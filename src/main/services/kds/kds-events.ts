import type Database from 'better-sqlite3'
import { EventEmitter } from 'events'
import type { KdsChangeEvent, KdsReadyEvent } from '../../../shared/kds'
import { orderReadiness } from './kds-query'

/**
 * In-process change feed for the kitchen screens. Writers (order transactions, KDS actions) call
 * notifyKdsChanged() — possibly inside an open transaction — and the flush runs on the next
 * macrotask, after better-sqlite3's synchronous transaction has committed or rolled back. Every
 * listener re-reads the database, so a notification for a rolled-back write is harmless.
 *
 * Events:
 *   'changed' (KdsChangeEvent) — tickets of these orders (or the settings) changed;
 *   'ready'   (KdsReadyEvent)  — an order became ready / stopped being ready (POS badges).
 */
export const kdsEvents = new EventEmitter()
kdsEvents.setMaxListeners(200)

const pending = new Map<Database.Database, Set<number>>()
const lastReady = new WeakMap<Database.Database, Map<number, boolean>>()
let scheduled = false

function emitSafely(event: 'changed' | 'ready', payload: KdsChangeEvent | KdsReadyEvent): void {
  for (const listener of kdsEvents.listeners(event)) {
    try {
      ;(listener as (value: unknown) => void)(payload)
    } catch (error) {
      console.error(`[KDS] ${event} listener failed:`, error)
    }
  }
}

function flush(): void {
  scheduled = false
  const batches = [...pending.entries()]
  pending.clear()
  for (const [db, ids] of batches) {
    if (!db.open) continue
    const orderIds = [...ids]
    emitSafely('changed', { orderIds })
    let known = lastReady.get(db)
    if (!known) {
      known = new Map()
      lastReady.set(db, known)
    }
    for (const orderId of orderIds) {
      try {
        const readiness = orderReadiness(db, orderId)
        const was = known.get(orderId) ?? false
        const ready = readiness?.ready ?? false
        if (ready) known.set(orderId, true)
        else known.delete(orderId)
        if (readiness && ready !== was) {
          emitSafely('ready', { orderId, dailyNumber: readiness.dailyNumber, ready })
        }
      } catch (error) {
        console.error('[KDS] Readiness check failed:', error)
      }
    }
  }
}

export function notifyKdsChanged(db: Database.Database, orderIds: number[]): void {
  let set = pending.get(db)
  if (!set) {
    set = new Set()
    pending.set(db, set)
  }
  for (const id of orderIds) set.add(id)
  if (!scheduled) {
    scheduled = true
    setImmediate(flush)
  }
}

/** Settings (timers, sound, board) changed: every open screen refetches. */
export function notifyKdsSettingsChanged(): void {
  emitSafely('changed', { orderIds: [], settings: true })
}
