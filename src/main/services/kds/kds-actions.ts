import type Database from 'better-sqlite3'
import { parseKdsStation, type KdsActionResult, type KdsStationFilter } from '../../../shared/kds'
import { notifyKdsChanged } from './kds-events'

/**
 * Kitchen actions shared by the in-app screen (IPC) and the LAN screens (REST). Transitions:
 *   start:        new → in_progress (started_at)
 *   bump:         new / in_progress → ready (ready_at) — the station is done, the card leaves it;
 *                 ready → bumped (bumped_at)
 *   bump-order:   expo: every open ticket of the order → bumped (served)
 *   recall:       a finished station ticket back onto its station (in_progress, or new if never
 *                 started); the ORIGINAL created_at is kept, so the timer does not reset
 *   recall-order: expo undo: bumped tickets back to ready (or to cooking when never ready)
 *   recall-last:  the most recently finished ticket of a station / order of the expo view
 *   line-done:    toggles one line's done_at; the first done line starts a new ticket
 * Only KDS-closed tickets of still-active orders can be recalled.
 */

export type KdsAction =
  | { type: 'start'; ticketId: number }
  | { type: 'bump'; ticketId: number }
  | { type: 'recall'; ticketId: number }
  | { type: 'line-done'; itemId: number; done: boolean }
  | { type: 'bump-order'; orderId: number }
  | { type: 'recall-order'; orderId: number }
  | { type: 'recall-last'; station: KdsStationFilter }

const positiveId = (value: unknown): number | null =>
  typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null

/** Boundary validation for IPC / HTTP payloads. */
export function parseKdsAction(raw: unknown): KdsAction | null {
  if (!raw || typeof raw !== 'object') return null
  const value = raw as Record<string, unknown>
  switch (value.type) {
    case 'start':
    case 'bump':
    case 'recall': {
      const ticketId = positiveId(value.ticketId)
      return ticketId ? { type: value.type, ticketId } : null
    }
    case 'line-done': {
      const itemId = positiveId(value.itemId)
      return itemId && typeof value.done === 'boolean' ? { type: 'line-done', itemId, done: value.done } : null
    }
    case 'bump-order':
    case 'recall-order': {
      const orderId = positiveId(value.orderId)
      return orderId ? { type: value.type, orderId } : null
    }
    case 'recall-last':
      return { type: 'recall-last', station: parseKdsStation(value.station) }
    default:
      return null
  }
}

interface TicketState {
  id: number
  order_id: number
  status: string
  started_at: string | null
  ready_at: string | null
  closed_by: string | null
  order_status: string
}

const ACTIVE_ORDER = new Set(['preparing', 'pending'])

function ticketState(db: Database.Database, ticketId: number): TicketState | undefined {
  return db.prepare(
    `SELECT t.id, t.order_id, t.status, t.started_at, t.ready_at, t.closed_by, o.status AS order_status
     FROM kds_tickets t JOIN orders o ON o.id = t.order_id WHERE t.id = ?`
  ).get(ticketId) as TicketState | undefined
}

type Outcome = KdsActionResult & { orderId?: number }

function fail(error: string): Outcome {
  return { ok: false, error }
}

function recallTicket(db: Database.Database, ticket: TicketState, stamp: string): Outcome {
  if (!ACTIVE_ORDER.has(ticket.order_status)) return fail('order_closed')
  if (ticket.status !== 'ready' && ticket.status !== 'bumped') return fail('not_recallable')
  db.prepare(
    `UPDATE kds_tickets SET status = ?, ready_at = NULL, bumped_at = NULL, closed_by = NULL,
     recalled_at = ?, updated_at = ? WHERE id = ?`
  ).run(ticket.started_at ? 'in_progress' : 'new', stamp, stamp, ticket.id)
  return { ok: true, orderId: ticket.order_id }
}

function recallOrder(db: Database.Database, orderId: number, stamp: string): Outcome {
  const order = db.prepare('SELECT status FROM orders WHERE id = ?').get(orderId) as { status: string } | undefined
  if (!order) return fail('not_found')
  if (!ACTIVE_ORDER.has(order.status)) return fail('order_closed')
  const changes = db.prepare(
    `UPDATE kds_tickets SET
       status = CASE WHEN ready_at IS NOT NULL THEN 'ready' WHEN started_at IS NOT NULL THEN 'in_progress' ELSE 'new' END,
       bumped_at = NULL, closed_by = CASE WHEN ready_at IS NOT NULL THEN 'kds' ELSE NULL END,
       recalled_at = ?, updated_at = ?
     WHERE order_id = ? AND status = 'bumped' AND closed_by = 'kds'`
  ).run(stamp, stamp, orderId).changes
  return changes > 0 ? { ok: true, orderId } : fail('not_recallable')
}

function execute(db: Database.Database, action: KdsAction, stamp: string): Outcome {
  switch (action.type) {
    case 'start': {
      const ticket = ticketState(db, action.ticketId)
      if (!ticket) return fail('not_found')
      if (ticket.status === 'in_progress') return { ok: true, orderId: ticket.order_id }
      if (ticket.status !== 'new') return fail('not_active')
      db.prepare("UPDATE kds_tickets SET status = 'in_progress', started_at = ?, updated_at = ? WHERE id = ?")
        .run(stamp, stamp, ticket.id)
      return { ok: true, orderId: ticket.order_id }
    }
    case 'bump': {
      const ticket = ticketState(db, action.ticketId)
      if (!ticket) return fail('not_found')
      if (ticket.status === 'new' || ticket.status === 'in_progress') {
        db.prepare("UPDATE kds_tickets SET status = 'ready', ready_at = ?, closed_by = 'kds', updated_at = ? WHERE id = ?")
          .run(stamp, stamp, ticket.id)
      } else if (ticket.status === 'ready') {
        db.prepare("UPDATE kds_tickets SET status = 'bumped', bumped_at = ?, closed_by = 'kds', updated_at = ? WHERE id = ?")
          .run(stamp, stamp, ticket.id)
      } else {
        return fail('not_active')
      }
      return { ok: true, orderId: ticket.order_id }
    }
    case 'recall': {
      const ticket = ticketState(db, action.ticketId)
      return ticket ? recallTicket(db, ticket, stamp) : fail('not_found')
    }
    case 'line-done': {
      const item = db.prepare(
        `SELECT i.id, i.change_kind, t.id AS ticket_id, t.order_id, t.status
         FROM kds_ticket_items i JOIN kds_tickets t ON t.id = i.ticket_id WHERE i.id = ?`
      ).get(action.itemId) as { id: number; change_kind: string | null; ticket_id: number; order_id: number; status: string } | undefined
      if (!item) return fail('not_found')
      if (item.change_kind === 'removed') return fail('line_removed')
      db.prepare('UPDATE kds_ticket_items SET done_at = ? WHERE id = ?').run(action.done ? stamp : null, item.id)
      if (action.done && item.status === 'new') {
        db.prepare("UPDATE kds_tickets SET status = 'in_progress', started_at = ?, updated_at = ? WHERE id = ?")
          .run(stamp, stamp, item.ticket_id)
      } else {
        db.prepare('UPDATE kds_tickets SET updated_at = ? WHERE id = ?').run(stamp, item.ticket_id)
      }
      return { ok: true, orderId: item.order_id }
    }
    case 'bump-order': {
      const changes = db.prepare(
        `UPDATE kds_tickets SET status = 'bumped', bumped_at = ?, closed_by = 'kds', updated_at = ?
         WHERE order_id = ? AND status IN ('new', 'in_progress', 'ready')`
      ).run(stamp, stamp, action.orderId).changes
      return changes > 0 ? { ok: true, orderId: action.orderId } : fail('not_active')
    }
    case 'recall-order':
      return recallOrder(db, action.orderId, stamp)
    case 'recall-last': {
      if (action.station === 'all') {
        const last = db.prepare(
          `SELECT t.order_id FROM kds_tickets t JOIN orders o ON o.id = t.order_id
           WHERE t.status = 'bumped' AND t.closed_by = 'kds' AND o.status IN ('preparing', 'pending')
           ORDER BY t.bumped_at DESC, t.id DESC LIMIT 1`
        ).get() as { order_id: number } | undefined
        return last ? recallOrder(db, last.order_id, stamp) : fail('nothing_to_recall')
      }
      const last = db.prepare(
        `SELECT t.id FROM kds_tickets t JOIN orders o ON o.id = t.order_id
         WHERE t.station_id = ? AND t.status IN ('ready', 'bumped') AND t.closed_by = 'kds'
           AND o.status IN ('preparing', 'pending')
         ORDER BY COALESCE(t.bumped_at, t.ready_at) DESC, t.id DESC LIMIT 1`
      ).get(action.station) as { id: number } | undefined
      const ticket = last ? ticketState(db, last.id) : undefined
      return ticket ? recallTicket(db, ticket, stamp) : fail('nothing_to_recall')
    }
  }
}

/** Runs one action atomically and wakes every screen. */
export function runKdsAction(db: Database.Database, action: KdsAction, now: Date = new Date()): Outcome {
  const outcome = db.transaction(() => execute(db, action, now.toISOString()))()
  if (outcome.ok && outcome.orderId) notifyKdsChanged(db, [outcome.orderId])
  return outcome
}
