import type Database from 'better-sqlite3'
import { businessDateInAlgiers } from '../../../shared/order-edit'
import {
  KDS_CANCEL_FLASH_MS,
  KDS_EXPO_STATION,
  type KdsAllDayRow,
  type KdsBoardEntry,
  type KdsBoardState,
  type KdsCard,
  type KdsItemView,
  type KdsModifier,
  type KdsSnapshot,
  type KdsStation,
  type KdsStationFilter,
  type KdsTicketStatus,
  type KdsTicketView
} from '../../../shared/kds'
import { readKdsDisplaySettings, restaurantName } from './kds-settings'

/** Read side of the KDS: screen snapshots, order readiness and the customer board. */

const DAY_MS = 24 * 60 * 60_000

interface TicketJoinRow {
  id: number
  order_id: number
  station_id: number
  status: KdsTicketStatus
  created_at: string
  started_at: string | null
  ready_at: string | null
  bumped_at: string | null
  cancelled_at: string | null
  recalled_at: string | null
  change_kind: KdsTicketView['change']
  changed_at: string | null
  daily_number: number
  order_type: string
  table_number: string | null
  customer_name: string | null
  order_note: string | null
  source: string
  station_name: string | null
}

interface ItemJoinRow {
  id: number
  ticket_id: number
  order_item_id: number
  menu_item_id: number | null
  parent_order_item_id: number | null
  combo_name: string | null
  name: string
  name_ar: string | null
  name_fr: string | null
  quantity: number
  previous_quantity: number | null
  notes: string | null
  modifiers: string | null
  change_kind: KdsItemView['change']
  done_at: string | null
}

function parseModifiers(raw: string | null): KdsModifier[] {
  if (!raw) return []
  try {
    const list = JSON.parse(raw)
    return Array.isArray(list) ? list.filter((entry) => entry && typeof entry.name === 'string') : []
  } catch {
    return []
  }
}

function toItem(row: ItemJoinRow): KdsItemView {
  return {
    id: row.id,
    orderItemId: row.order_item_id,
    parentOrderItemId: row.parent_order_item_id,
    comboName: row.combo_name,
    name: row.name,
    nameAr: row.name_ar,
    nameFr: row.name_fr,
    quantity: row.quantity,
    previousQuantity: row.previous_quantity,
    notes: row.notes,
    modifiers: parseModifiers(row.modifiers),
    change: row.change_kind,
    doneAt: row.done_at
  }
}

function aggregateStatus(tickets: KdsTicketView[]): KdsTicketStatus {
  const live = tickets.filter((ticket) => ticket.status !== 'cancelled')
  if (live.length === 0) return 'cancelled'
  if (live.every((ticket) => ticket.status === 'ready' || ticket.status === 'bumped')) return 'ready'
  return live.some((ticket) => ticket.status !== 'new') ? 'in_progress' : 'new'
}

const latest = (values: (string | null)[]): string | null =>
  values.filter((value): value is string => !!value).sort().pop() ?? null

function cardFor(key: string, row: TicketJoinRow, tickets: KdsTicketView[]): KdsCard {
  const changed = [...tickets].filter((ticket) => ticket.changedAt).sort((a, b) => (a.changedAt! < b.changedAt! ? -1 : 1)).pop()
  const status = tickets.length === 1 ? tickets[0].status : aggregateStatus(tickets)
  return {
    key,
    orderId: row.order_id,
    dailyNumber: row.daily_number,
    orderType: row.order_type,
    tableNumber: row.table_number,
    customerName: row.customer_name,
    orderNote: row.order_note,
    source: row.source,
    timerStart: tickets.map((ticket) => ticket.createdAt).sort()[0],
    status,
    change: changed?.change ?? null,
    changedAt: changed?.changedAt ?? null,
    cancelledAt: status === 'cancelled' ? latest(tickets.map((ticket) => ticket.cancelledAt)) : null,
    tickets
  }
}

export function kdsStations(db: Database.Database): KdsStation[] {
  const workers = db.prepare(
    `SELECT id, name FROM workers
     WHERE (is_active = 1 AND (role = 'cook' OR id IN (SELECT worker_id FROM worker_categories)))
        OR id IN (SELECT station_id FROM kds_tickets WHERE status IN ('new', 'in_progress', 'ready'))
     ORDER BY name COLLATE NOCASE`
  ).all() as KdsStation[]
  return [...workers, { id: KDS_EXPO_STATION, name: '' }]
}

export function readyOrderIds(db: Database.Database, now: Date = new Date()): number[] {
  return (db.prepare(
    `SELECT t.order_id FROM kds_tickets t JOIN orders o ON o.id = t.order_id
     WHERE o.status IN ('preparing', 'pending') AND datetime(t.created_at) >= datetime(?)
     GROUP BY t.order_id
     HAVING SUM(t.status <> 'cancelled') > 0 AND SUM(t.status IN ('new', 'in_progress')) = 0
     ORDER BY t.order_id`
  ).all(new Date(now.getTime() - DAY_MS).toISOString()) as { order_id: number }[]).map((row) => row.order_id)
}

/** null when the order does not exist. Ready = every live ticket is ready or bumped. */
export function orderReadiness(db: Database.Database, orderId: number): { ready: boolean; dailyNumber: number } | null {
  const row = db.prepare(
    `SELECT o.daily_number, o.status,
            COALESCE(SUM(t.status <> 'cancelled'), 0) AS live,
            COALESCE(SUM(t.status IN ('new', 'in_progress')), 0) AS open
     FROM orders o LEFT JOIN kds_tickets t ON t.order_id = o.id
     WHERE o.id = ? GROUP BY o.id`
  ).get(orderId) as { daily_number: number; status: string; live: number; open: number } | undefined
  if (!row) return null
  const active = row.status === 'preparing' || row.status === 'pending'
  return { ready: active && row.live > 0 && row.open === 0, dailyNumber: row.daily_number }
}

function canRecall(db: Database.Database, station: KdsStationFilter, since: string): boolean {
  const stationClause = station === 'all' ? "t.status = 'bumped'" : "t.station_id = ? AND t.status IN ('ready', 'bumped')"
  const args: unknown[] = station === 'all' ? [since] : [station, since]
  return !!db.prepare(
    `SELECT 1 FROM kds_tickets t JOIN orders o ON o.id = t.order_id
     WHERE ${stationClause} AND t.closed_by = 'kds' AND o.status IN ('preparing', 'pending')
       AND datetime(t.created_at) >= datetime(?) LIMIT 1`
  ).get(...args)
}

export function buildKdsSnapshot(db: Database.Database, station: KdsStationFilter, now: Date = new Date()): KdsSnapshot {
  const since = new Date(now.getTime() - DAY_MS).toISOString()
  const grace = new Date(now.getTime() - KDS_CANCEL_FLASH_MS - 3000).toISOString()
  const base = `SELECT t.*, o.daily_number, o.order_type, o.table_number, o.customer_name, o.notes AS order_note,
                       o.source, w.name AS station_name
                FROM kds_tickets t JOIN orders o ON o.id = t.order_id LEFT JOIN workers w ON w.id = t.station_id`
  const rows = (station === 'all'
    ? db.prepare(
      `${base}
       WHERE t.order_id IN (
         SELECT order_id FROM kds_tickets WHERE datetime(created_at) >= datetime(?)
           AND (status IN ('new', 'in_progress', 'ready') OR (status = 'cancelled' AND datetime(cancelled_at) >= datetime(?))))
         AND NOT (t.status = 'cancelled' AND datetime(t.cancelled_at) < datetime(?))
       ORDER BY t.created_at, t.order_id, t.id`
    ).all(since, grace, grace)
    : db.prepare(
      `${base}
       WHERE t.station_id = ? AND datetime(t.created_at) >= datetime(?)
         AND (t.status IN ('new', 'in_progress') OR (t.status = 'cancelled' AND datetime(t.cancelled_at) >= datetime(?)))
       ORDER BY t.created_at, t.order_id, t.id`
    ).all(station, since, grace)) as TicketJoinRow[]

  const itemRows = rows.length === 0 ? [] : db.prepare(
    `SELECT * FROM kds_ticket_items WHERE ticket_id IN (SELECT value FROM json_each(?))
     ORDER BY COALESCE(parent_order_item_id, order_item_id), order_item_id`
  ).all(JSON.stringify(rows.map((row) => row.id))) as ItemJoinRow[]
  const itemsByTicket = new Map<number, KdsItemView[]>()
  for (const row of itemRows) {
    if (!itemsByTicket.has(row.ticket_id)) itemsByTicket.set(row.ticket_id, [])
    itemsByTicket.get(row.ticket_id)!.push(toItem(row))
  }
  const views = rows.map((row): KdsTicketView => ({
    id: row.id,
    stationId: row.station_id,
    stationName: row.station_id === KDS_EXPO_STATION ? '' : row.station_name || `#${row.station_id}`,
    status: row.status,
    createdAt: row.created_at,
    startedAt: row.started_at,
    readyAt: row.ready_at,
    bumpedAt: row.bumped_at,
    cancelledAt: row.cancelled_at,
    recalledAt: row.recalled_at,
    change: row.change_kind,
    changedAt: row.changed_at,
    items: itemsByTicket.get(row.id) ?? []
  }))

  let cards: KdsCard[]
  if (station === 'all') {
    const byOrder = new Map<number, { row: TicketJoinRow; tickets: KdsTicketView[] }>()
    rows.forEach((row, index) => {
      if (!byOrder.has(row.order_id)) byOrder.set(row.order_id, { row, tickets: [] })
      byOrder.get(row.order_id)!.tickets.push(views[index])
    })
    cards = [...byOrder.values()].map(({ row, tickets }) => {
      // Stations in a stable order, the expo/unassigned group last.
      tickets.sort((a, b) => (a.stationId === 0 ? 1 : 0) - (b.stationId === 0 ? 1 : 0) || a.stationName.localeCompare(b.stationName))
      return cardFor(`o${row.order_id}`, row, tickets)
    })
  } else {
    cards = rows.map((row, index) => cardFor(`t${row.id}`, row, [views[index]]))
  }
  cards.sort((a, b) => (a.timerStart < b.timerStart ? -1 : a.timerStart > b.timerStart ? 1 : a.dailyNumber - b.dailyNumber))

  // "All day": what is still to cook in this view (open tickets, lines not done / not removed).
  const allDay = new Map<string, KdsAllDayRow>()
  const menuItemOf = new Map(itemRows.map((row) => [row.id, row.menu_item_id]))
  for (const view of views) {
    if (view.status !== 'new' && view.status !== 'in_progress') continue
    for (const item of view.items) {
      if (item.change === 'removed' || item.doneAt) continue
      const menuItemId = menuItemOf.get(item.id)
      const key = menuItemId != null ? `m${menuItemId}` : `n${item.name}`
      const entry = allDay.get(key) ?? { key, name: item.name, nameAr: item.nameAr, nameFr: item.nameFr, quantity: 0 }
      entry.quantity += item.quantity
      allDay.set(key, entry)
    }
  }

  return {
    serverTime: now.toISOString(),
    station,
    stations: kdsStations(db),
    settings: readKdsDisplaySettings(db),
    cards,
    allDay: [...allDay.values()].sort((a, b) => b.quantity - a.quantity || a.name.localeCompare(b.name)),
    readyOrderIds: readyOrderIds(db, now),
    canRecall: canRecall(db, station, since)
  }
}

function toTime(value: string | null): number | null {
  if (!value) return null
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value) ? value.replace(' ', 'T') + 'Z' : value
  const time = Date.parse(normalized)
  return Number.isFinite(time) ? time : null
}

/**
 * Customer "Preparing / Ready" board for today's orders. Ready = the kitchen finished every
 * ticket (or the POS completed the order); a ready number clears after `clearMinutes`.
 */
export function buildBoardState(db: Database.Database, now: Date = new Date()): KdsBoardState {
  const { boardClearMinutes } = readKdsDisplaySettings(db)
  const rows = db.prepare(
    `SELECT o.id, o.daily_number, o.status, o.completed_at,
            COUNT(t.id) AS live,
            COALESCE(SUM(t.status IN ('new', 'in_progress')), 0) AS open,
            MAX(COALESCE(t.ready_at, t.bumped_at)) AS kitchen_done
     FROM orders o LEFT JOIN kds_tickets t ON t.order_id = o.id AND t.status <> 'cancelled'
     WHERE o.order_date = ? AND o.status <> 'cancelled'
     GROUP BY o.id ORDER BY o.daily_number`
  ).all(businessDateInAlgiers(now)) as {
    id: number; daily_number: number; status: string; completed_at: string | null
    live: number; open: number; kitchen_done: string | null
  }[]
  const preparing: KdsBoardEntry[] = []
  const ready: (KdsBoardEntry & { at: number })[] = []
  const clearMs = boardClearMinutes * 60_000
  for (const row of rows) {
    const kitchenDone = row.live > 0 && row.open === 0 ? toTime(row.kitchen_done) : null
    const readyTime = row.status === 'completed' ? kitchenDone ?? toTime(row.completed_at) : kitchenDone
    if (readyTime != null) {
      if (now.getTime() - readyTime < clearMs) {
        ready.push({ orderId: row.id, number: row.daily_number, readyAt: new Date(readyTime).toISOString(), at: readyTime })
      }
    } else if (row.status === 'preparing' || row.status === 'pending') {
      preparing.push({ orderId: row.id, number: row.daily_number, readyAt: null })
    }
  }
  ready.sort((a, b) => b.at - a.at)
  return {
    serverTime: now.toISOString(),
    restaurantName: restaurantName(db),
    clearMinutes: boardClearMinutes,
    preparing: preparing.slice(0, 60),
    ready: ready.slice(0, 24).map(({ orderId, number, readyAt }) => ({ orderId, number, readyAt }))
  }
}
