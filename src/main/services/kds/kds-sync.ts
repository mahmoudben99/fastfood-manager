import type Database from 'better-sqlite3'
import { KDS_EXPO_STATION, type KdsModifier } from '../../../shared/kds'
import { notifyKdsChanged } from './kds-events'

/**
 * Keeps KDS tickets in step with the order they belong to. Called inside every order mutation
 * (order-service → enqueueOutbox), so tickets commit atomically with the order. Idempotent: it
 * reconciles the tickets against the CURRENT order state rather than replaying an event, which
 * also lets healKdsTickets() rebuild missing tickets after an upgrade or a swallowed failure.
 *
 * Station split mirrors the kitchen-ticket routing: a line goes to its worker_id's station, an
 * unassigned line to station 0 (expo). v4-catalog combo containers (line_kind = 'combo') are
 * not cookable and never reach a ticket; their children carry the combo name as context.
 */

interface OrderHeaderRow {
  id: number
  status: string
  order_type: string
  table_number: string | null
  notes: string | null
  customer_name: string | null
  created_at: string
}

interface TicketRow {
  id: number
  station_id: number
  status: string
  started_at: string | null
  ready_at: string | null
  closed_by: string | null
  change_kind: string | null
  header_sig: string | null
}

interface ItemRow {
  id: number
  order_item_id: number
  quantity: number
  previous_quantity: number | null
  notes: string | null
  modifiers: string | null
  change_kind: string | null
  done_at: string | null
}

export interface KdsLine {
  id: number
  menu_item_id: number | null
  quantity: number
  notes: string | null
  worker_id: number | null
  name: string
  name_ar: string | null
  name_fr: string | null
  parent_order_item_id: number | null
  combo_name: string | null
  modifiers: string | null
}

interface LineShape {
  parent: boolean
  lineKind: boolean
  modifierTable: boolean
}

const shapes = new WeakMap<Database.Database, LineShape>()

/** Probes the optional v4-catalog schema once per connection (migrations run before any order). */
function lineShape(db: Database.Database): LineShape {
  const cached = shapes.get(db)
  if (cached) return cached
  const columns = new Set((db.prepare('PRAGMA table_info(order_items)').all() as { name: string }[]).map((c) => c.name))
  const shape: LineShape = {
    parent: columns.has('parent_order_item_id'),
    lineKind: columns.has('line_kind'),
    modifierTable: !!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'order_item_modifiers'").get()
  }
  shapes.set(db, shape)
  return shape
}

function modifiersFor(db: Database.Database, orderItemId: number): string | null {
  const rows = db.prepare(
    'SELECT * FROM order_item_modifiers WHERE order_item_id = ? ORDER BY sort_order, id'
  ).all(orderItemId) as Record<string, unknown>[]
  const list: KdsModifier[] = rows
    .filter((row) => typeof row.name === 'string' && row.name)
    .map((row) => ({
      name: String(row.name),
      name_ar: typeof row.name_ar === 'string' ? row.name_ar : null,
      name_fr: typeof row.name_fr === 'string' ? row.name_fr : null,
      quantity: Number.isFinite(Number(row.quantity)) && Number(row.quantity) > 0 ? Number(row.quantity) : 1,
      kind: typeof row.kind === 'string' ? row.kind : null
    }))
  return list.length > 0 ? JSON.stringify(list) : null
}

/** The cookable lines of an order, parent-then-children, with the sold-name snapshot. */
export function kdsLinesFor(db: Database.Database, orderId: number): KdsLine[] {
  const shape = lineShape(db)
  const parentSelect = shape.parent
    ? `oi.parent_order_item_id AS parent_order_item_id,
       (SELECT COALESCE(p.item_name, pm.name) FROM order_items p LEFT JOIN menu_items pm ON pm.id = p.menu_item_id
        WHERE p.id = oi.parent_order_item_id) AS combo_name`
    : 'NULL AS parent_order_item_id, NULL AS combo_name'
  const lines = db.prepare(
    `SELECT oi.id, oi.menu_item_id, oi.quantity, oi.notes, oi.worker_id,
            COALESCE(oi.item_name, mi.name, '#' || oi.menu_item_id) AS name,
            CASE WHEN oi.item_name IS NOT NULL THEN oi.item_name_ar ELSE mi.name_ar END AS name_ar,
            CASE WHEN oi.item_name IS NOT NULL THEN oi.item_name_fr ELSE mi.name_fr END AS name_fr,
            ${parentSelect}
     FROM order_items oi LEFT JOIN menu_items mi ON mi.id = oi.menu_item_id
     WHERE oi.order_id = ? ${shape.lineKind ? "AND COALESCE(oi.line_kind, 'item') <> 'combo'" : ''}
     ORDER BY ${shape.parent ? 'COALESCE(oi.parent_order_item_id, oi.id), ' : ''}oi.id`
  ).all(orderId) as Omit<KdsLine, 'modifiers'>[]
  return lines.map((line) => ({ ...line, modifiers: shape.modifierTable ? modifiersFor(db, line.id) : null }))
}

function iso(value: string | null | undefined, fallback: string): string {
  if (!value) return fallback
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value) ? value.replace(' ', 'T') + 'Z' : value
  const time = Date.parse(normalized)
  return Number.isFinite(time) ? new Date(time).toISOString() : fallback
}

const ACTIVE = new Set(['new', 'in_progress'])
const TERMINAL = new Set(['ready', 'bumped', 'cancelled'])

export interface KdsSyncOptions {
  now?: Date
}

/** Reconciles one order's tickets. Returns true when any ticket row changed. */
export function syncKdsOrder(db: Database.Database, orderId: number, options: KdsSyncOptions = {}): boolean {
  const stamp = (options.now ?? new Date()).toISOString()
  const order = db.prepare(
    'SELECT id, status, order_type, table_number, notes, customer_name, created_at FROM orders WHERE id = ?'
  ).get(orderId) as OrderHeaderRow | undefined
  if (!order) return false

  if (order.status === 'cancelled') {
    return db.prepare(
      `UPDATE kds_tickets SET status = 'cancelled', cancelled_at = ?, change_kind = 'cancelled', changed_at = ?,
       updated_at = ? WHERE order_id = ? AND status IN ('new', 'in_progress', 'ready')`
    ).run(stamp, stamp, stamp, orderId).changes > 0
  }
  if (order.status === 'completed') {
    // Completed at the POS = handed over: close whatever the kitchen had not bumped yet.
    return db.prepare(
      `UPDATE kds_tickets SET status = 'bumped', bumped_at = ?, closed_by = 'pos', updated_at = ?
       WHERE order_id = ? AND status IN ('new', 'in_progress', 'ready')`
    ).run(stamp, stamp, orderId).changes > 0
  }

  const tickets = db.prepare(
    'SELECT id, station_id, status, started_at, ready_at, closed_by, change_kind, header_sig FROM kds_tickets WHERE order_id = ?'
  ).all(orderId) as TicketRow[]
  const fresh = tickets.length === 0
  const sig = JSON.stringify([order.order_type, order.table_number ?? null, order.notes ?? null, order.customer_name ?? null])
  const lines = kdsLinesFor(db, orderId)
  const byStation = new Map<number, KdsLine[]>()
  for (const line of lines) {
    const station = line.worker_id ?? KDS_EXPO_STATION
    if (!byStation.has(station)) byStation.set(station, [])
    byStation.get(station)!.push(line)
  }

  const insertItem = db.prepare(
    `INSERT INTO kds_ticket_items
     (ticket_id, order_item_id, menu_item_id, parent_order_item_id, combo_name, name, name_ar, name_fr,
      quantity, notes, modifiers, change_kind, changed_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
  const addItem = (ticketId: number, line: KdsLine, mark: 'added' | null): void => {
    insertItem.run(ticketId, line.id, line.menu_item_id, line.parent_order_item_id, line.combo_name, line.name,
      line.name_ar, line.name_fr, line.quantity, line.notes, line.modifiers, mark, mark ? stamp : null, stamp)
  }
  let changed = false

  for (const [station, stationLines] of byStation) {
    if (tickets.some((ticket) => ticket.station_id === station)) continue
    // A ticket born with the order starts its timer at the order time; one born from an edit
    // (a station that had no lines before) is news: every line is ADDED.
    const ticketId = Number(db.prepare(
      `INSERT INTO kds_tickets (order_id, station_id, status, created_at, change_kind, changed_at, header_sig, updated_at)
       VALUES (?, ?, 'new', ?, ?, ?, ?, ?)`
    ).run(orderId, station, fresh ? iso(order.created_at, stamp) : stamp, fresh ? null : 'updated',
      fresh ? null : stamp, sig, stamp).lastInsertRowid)
    for (const line of stationLines) addItem(ticketId, line, fresh ? null : 'added')
    changed = true
  }

  for (const ticket of tickets) {
    const stationLines = byStation.get(ticket.station_id) ?? []
    const items = db.prepare(
      'SELECT id, order_item_id, quantity, previous_quantity, notes, modifiers, change_kind, done_at FROM kds_ticket_items WHERE ticket_id = ?'
    ).all(ticket.id) as ItemRow[]
    const itemByLine = new Map(items.map((item) => [item.order_item_id, item]))
    const liveIds = new Set(stationLines.map((line) => line.id))

    const added = stationLines.filter((line) => {
      const item = itemByLine.get(line.id)
      return !item || item.change_kind === 'removed'
    })
    const edited = stationLines.filter((line) => {
      const item = itemByLine.get(line.id)
      return !!item && item.change_kind !== 'removed' &&
        (item.quantity !== line.quantity || (item.notes ?? null) !== (line.notes ?? null) ||
         (item.modifiers ?? null) !== (line.modifiers ?? null))
    })
    const removed = items.filter((item) => item.change_kind !== 'removed' && !liveIds.has(item.order_item_id))
    const headerChanged = ticket.header_sig !== sig
    const cookable = added.length > 0 || edited.length > 0

    // Restore after an order un-cancel / POS un-complete (the ticket still holds live lines), or
    // reopen a finished station that got new work. A reopened ticket drops its stale marks so
    // only this edit is flagged.
    const orderRestored =
      (ticket.status === 'cancelled' &&
        items.some((item) => item.change_kind !== 'removed' && liveIds.has(item.order_item_id))) ||
      (ticket.status === 'bumped' && ticket.closed_by === 'pos')
    const reopen = !orderRestored && TERMINAL.has(ticket.status) && cookable
    if (orderRestored || reopen) {
      if (reopen) {
        db.prepare("DELETE FROM kds_ticket_items WHERE ticket_id = ? AND change_kind = 'removed'").run(ticket.id)
        db.prepare('UPDATE kds_ticket_items SET change_kind = NULL, changed_at = NULL, previous_quantity = NULL WHERE ticket_id = ?').run(ticket.id)
        for (const item of items) if (item.change_kind !== 'removed') item.change_kind = null
      }
      const status = orderRestored && ticket.status === 'bumped' && ticket.ready_at ? 'ready'
        : ticket.started_at ? 'in_progress' : 'new'
      db.prepare(
        `UPDATE kds_tickets SET status = ?, ready_at = CASE WHEN ? = 'ready' THEN ready_at ELSE NULL END,
         bumped_at = NULL, cancelled_at = NULL, closed_by = NULL, updated_at = ? WHERE id = ?`
      ).run(status, status, stamp, ticket.id)
      ticket.status = status
      changed = true
    }

    for (const line of added) {
      const item = itemByLine.get(line.id)
      if (item) {
        db.prepare(
          `UPDATE kds_ticket_items SET quantity = ?, previous_quantity = NULL, notes = ?, modifiers = ?, name = ?,
           change_kind = 'added', changed_at = ?, done_at = NULL WHERE id = ?`
        ).run(line.quantity, line.notes, line.modifiers, line.name, stamp, item.id)
      } else {
        addItem(ticket.id, line, 'added')
      }
    }
    for (const line of edited) {
      const item = itemByLine.get(line.id)!
      const quantityChanged = item.quantity !== line.quantity
      db.prepare(
        `UPDATE kds_ticket_items SET quantity = ?, previous_quantity = ?, notes = ?, modifiers = ?, name = ?,
         change_kind = ?, changed_at = ?, done_at = CASE WHEN ? > quantity THEN NULL ELSE done_at END WHERE id = ?`
      ).run(
        line.quantity,
        item.change_kind === 'added' ? null : quantityChanged ? item.previous_quantity ?? item.quantity : item.previous_quantity,
        line.notes, line.modifiers, line.name,
        item.change_kind === 'added' ? 'added' : 'changed', stamp, line.quantity, item.id
      )
    }
    for (const item of removed) {
      db.prepare("UPDATE kds_ticket_items SET change_kind = 'removed', changed_at = ? WHERE id = ?").run(stamp, item.id)
    }

    const lineChanged = added.length > 0 || edited.length > 0 || removed.length > 0
    if (ACTIVE.has(ticket.status) && stationLines.length === 0) {
      // Every line of this station was removed or moved away: the cook must stop.
      db.prepare(
        `UPDATE kds_tickets SET status = 'cancelled', cancelled_at = ?, change_kind = 'cancelled', changed_at = ?,
         header_sig = ?, updated_at = ? WHERE id = ?`
      ).run(stamp, stamp, sig, stamp, ticket.id)
      changed = true
      continue
    }
    const mark = orderRestored ? 'restored'
      : reopen || lineChanged || (headerChanged && ticket.status !== 'cancelled') ? 'updated'
        : null
    if (mark) {
      db.prepare(
        'UPDATE kds_tickets SET change_kind = ?, changed_at = ?, header_sig = ?, updated_at = ? WHERE id = ?'
      ).run(mark, stamp, sig, stamp, ticket.id)
      changed = true
    } else if (headerChanged) {
      db.prepare('UPDATE kds_tickets SET header_sig = ? WHERE id = ?').run(sig, ticket.id)
    }
  }
  return changed
}

/**
 * The hook order-service calls inside its transaction. A KDS failure must never lose an order:
 * the sync runs in a savepoint and any error is logged (healKdsTickets repairs it later).
 */
export function syncKdsAfterOrderChange(db: Database.Database, orderId: number): void {
  try {
    db.transaction(() => syncKdsOrder(db, orderId))()
    notifyKdsChanged(db, [orderId])
  } catch (error) {
    console.error('[KDS] Ticket sync failed; the order is saved and the kitchen screen will resync:', error)
  }
}

/**
 * Reconciles every active order of the last 24 h: creates missing tickets (first run after the
 * upgrade) and repairs stale ones (a sync error swallowed inside an order transaction). The sync
 * is idempotent, so orders already in step cost a few reads and write nothing.
 */
export function healKdsTickets(db: Database.Database, now: Date = new Date()): number[] {
  const since = new Date(now.getTime() - 24 * 60 * 60_000).toISOString()
  const active = db.prepare(
    `SELECT o.id FROM orders o
     WHERE o.status IN ('preparing', 'pending') AND datetime(o.created_at) >= datetime(?)
     ORDER BY o.id`
  ).all(since) as { id: number }[]
  const healed: number[] = []
  for (const { id } of active) {
    try {
      if (db.transaction(() => syncKdsOrder(db, id, { now }))()) healed.push(id)
    } catch (error) {
      console.error(`[KDS] Could not rebuild tickets for order ${id}:`, error)
    }
  }
  if (healed.length > 0) notifyKdsChanged(db, healed)
  return healed
}
