import { getDb } from '../database/connection'
import { ordersRepo } from '../database/repositories/orders.repo'
import { broadcastQueueStrict } from '../tablet/server'
import { sendOrderNotificationStrict } from '../telegram/bot'
import { syncAnalyticsDateStrict } from '../sync/analytics-sync'
import { syncOrderToCloudStrict } from '../sync/owner-sync'
import { createOutboxWorker, type OutboxEventRow } from './outbox-worker'

let timer: ReturnType<typeof setInterval> | null = null
let running = false
let stopping = false
let worker: ReturnType<typeof createOutboxWorker> | null = null
let activeRun: Promise<void> | null = null

interface OrderEventPayload {
  orderId: number
  action: 'created' | 'updated' | 'cancelled' | 'restored'
  orderDate?: string
}

function payloadFor(event: OutboxEventRow): OrderEventPayload {
  let payload: unknown
  try { payload = JSON.parse(event.payload) } catch { throw new Error('Invalid outbox payload JSON') }
  const value = payload as Partial<OrderEventPayload>
  if (!Number.isInteger(value.orderId) || Number(value.orderId) <= 0) {
    throw new Error('Invalid outbox order id')
  }
  return value as OrderEventPayload
}

async function consumeOnce(
  event: OutboxEventRow,
  consumer: string,
  effect: () => Promise<void> | void
): Promise<void> {
  const db = getDb()
  const seen = db.prepare(
    'SELECT 1 FROM outbox_consumer_receipts WHERE event_id = ? AND consumer = ?'
  ).get(event.id, consumer)
  if (seen) return
  await effect()
  db.prepare(
    'INSERT OR IGNORE INTO outbox_consumer_receipts (event_id, consumer) VALUES (?, ?)'
  ).run(event.id, consumer)
}

function productionWorker(): ReturnType<typeof createOutboxWorker> {
  if (worker) return worker
  worker = createOutboxWorker({
    db: getDb(),
    consumers: {
      'owner-sync': (event) => consumeOnce(event, 'owner-sync', async () => {
        const payload = payloadFor(event)
        const order = ordersRepo.getById(payload.orderId)
        if (!order) throw new Error(`Order ${payload.orderId} no longer exists`)
        await syncOrderToCloudStrict(order)
      }),
      'analytics-dirty': (event) => consumeOnce(event, 'analytics-dirty', async () => {
        const payload = payloadFor(event)
        const orderDate = payload.orderDate || ordersRepo.getById(payload.orderId)?.order_date
        if (!orderDate) throw new Error(`Order ${payload.orderId} has no analytics date`)
        await syncAnalyticsDateStrict(orderDate)
      }),
      telegram: (event) => consumeOnce(event, 'telegram', async () => {
        const payload = payloadFor(event)
        const order = ordersRepo.getById(payload.orderId)
        if (!order) throw new Error(`Order ${payload.orderId} no longer exists`)
        await sendOrderNotificationStrict(order, event.id)
      }),
      'queue-broadcast': (event) => consumeOnce(event, 'queue-broadcast', () => {
        payloadFor(event)
        broadcastQueueStrict()
      })
    }
  })
  return worker
}

function triggerOutbox(): void {
  if (activeRun || stopping) return
  running = true
  activeRun = productionWorker().processOnce(20).then(() => undefined).finally(() => {
    running = false
    activeRun = null
  })
  void activeRun.catch((error) => {
    console.error('[Order Effects] Outbox processing failed:', error)
  })
}

export function startOrderEffectsRuntime(): void {
  if (timer) return
  stopping = false
  triggerOutbox()
  timer = setInterval(triggerOutbox, 2000)
}

export async function stopOrderEffectsRuntime(): Promise<void> {
  if (timer) clearInterval(timer)
  timer = null
  stopping = true
  if (activeRun) {
    try { await activeRun } catch { /* already logged; pending rows survive restart */ }
  }
  worker = null
  running = false
  activeRun = null
}
