import type Database from 'better-sqlite3'
import type { FiscalEventType } from '../../../shared/fiscal'
import { canonicalJson, entryHash, GENESIS_HASH } from './hash'
import { orderSnapshot, snapshotHash, type FiscalOrderSnapshot } from './snapshot'

/**
 * v4 fiscal journal (migration 025): an append-only list of order events chained by SHA-256.
 * Every entry stores prev_hash (the previous entry's hash) and hash = SHA-256 of its own
 * canonical content, so changing, removing or reordering any entry breaks the chain
 * (verifyJournal). Triggers refuse UPDATE / DELETE on the table and any non-contiguous seq.
 *
 * Callers are the order transactions (order-service / order-level / payments): the entry is
 * written inside the SAME transaction as the change it records, so both commit or neither does.
 */

interface MetaRow { value: string }

const ready = new WeakSet<Database.Database>()

/** True once migration 025 ran on this connection (older test schemas simply skip the journal). */
export function fiscalReady(db: Database.Database): boolean {
  if (ready.has(db)) return true
  const table = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'fiscal_journal'").get()
  if (table) ready.add(db)
  return Boolean(table)
}

export function fiscalMeta(db: Database.Database, key: string): string | null {
  return (db.prepare('SELECT value FROM fiscal_meta WHERE key = ?').get(key) as MetaRow | undefined)?.value ?? null
}

export function setFiscalMeta(db: Database.Database, key: string, value: string): void {
  db.prepare('INSERT INTO fiscal_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, value)
}

/** Orders with an id above this were created under the journal (each must have a 'create' entry). */
export function journalStartOrderId(db: Database.Database): number {
  return Number(fiscalMeta(db, 'journal_start_order_id')) || 0
}

export interface AppendInput {
  type: FiscalEventType
  orderId?: number | null
  fiscalNumber?: number | null
  payload: Record<string, unknown>
  at?: Date
}

/** Appends one chained entry; returns its seq and hash. Also moves the head anchor in fiscal_meta. */
export function appendJournal(db: Database.Database, input: AppendInput): { seq: number; hash: string } {
  const head = db.prepare('SELECT seq, hash FROM fiscal_journal ORDER BY seq DESC LIMIT 1').get() as
    | { seq: number; hash: string }
    | undefined
  const fields = {
    seq: (head?.seq ?? 0) + 1,
    created_at: (input.at ?? new Date()).toISOString(),
    event_type: input.type,
    order_id: input.orderId ?? null,
    fiscal_number: input.fiscalNumber ?? null,
    payload: canonicalJson(input.payload),
    prev_hash: head?.hash ?? GENESIS_HASH
  }
  const hash = entryHash(fields)
  db.prepare(
    `INSERT INTO fiscal_journal (seq, created_at, event_type, order_id, fiscal_number, payload, prev_hash, hash)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(fields.seq, fields.created_at, fields.event_type, fields.order_id, fields.fiscal_number, fields.payload, fields.prev_hash, hash)
  setFiscalMeta(db, 'head', `${fields.seq}:${hash}`)
  return { seq: fields.seq, hash }
}

/**
 * Right after the order row is inserted (same transaction as the order): the next gapless
 * fiscal ticket number, and the sales channel. A rolled-back order rolls its number back too.
 */
export function assignFiscalNumber(db: Database.Database, orderId: number, channel: string | null): number | null {
  if (!fiscalReady(db)) return null
  const next = db.prepare(
    "UPDATE fiscal_counters SET last_value = last_value + 1 WHERE name = 'ticket' RETURNING last_value"
  ).get() as { last_value: number } | undefined
  if (!next) throw new Error('Fiscal counter missing (migration 025)')
  db.prepare('UPDATE orders SET fiscal_number = ?, channel = ? WHERE id = ?').run(next.last_value, channel, orderId)
  return next.last_value
}

export function lastFiscalNumber(db: Database.Database): number {
  const row = db.prepare("SELECT last_value FROM fiscal_counters WHERE name = 'ticket'").get() as { last_value: number } | undefined
  return row?.last_value ?? 0
}

function hasCreateEntry(db: Database.Database, orderId: number): boolean {
  return Boolean(db.prepare("SELECT 1 FROM fiscal_journal WHERE order_id = ? AND event_type = 'create' LIMIT 1").get(orderId))
}

/**
 * Journal an order event with the order's state hash (and, for create / line_edit, its full
 * fiscal content so the complete line history can be rebuilt from the journal alone).
 */
export function journalOrderEvent(
  db: Database.Database,
  orderId: number,
  type: FiscalEventType,
  details: Record<string, unknown> = {},
  options: { full?: boolean; before?: FiscalOrderSnapshot | null; at?: Date } = {}
): void {
  if (!fiscalReady(db)) return
  const state = orderSnapshot(db, orderId)
  if (!state) return
  appendJournal(db, {
    type,
    orderId,
    fiscalNumber: state.order.fiscal_number,
    at: options.at,
    payload: {
      ...details,
      state_hash: snapshotHash(state),
      state: options.full ? state : undefined,
      before: options.before ?? undefined
    }
  })
}

/** Snapshot taken at the start of an edit transaction (null when the journal is not installed). */
export function fiscalBefore(db: Database.Database, orderId: number): FiscalOrderSnapshot | null {
  return fiscalReady(db) ? orderSnapshot(db, orderId) : null
}

/**
 * payments.ts hook: every order_payments row. A payment taken while the order itself is being
 * created is part of that order's 'create' entry (written at the end of the same transaction).
 */
export function journalPaymentRow(
  db: Database.Database,
  orderId: number,
  row: { kind: 'payment' | 'refund'; method: string; amount: number; rounding: number },
  ctx: { auto?: boolean; operator?: string | null; reason?: string | null; now: Date }
): void {
  if (!fiscalReady(db)) return
  if (orderId > journalStartOrderId(db) && !hasCreateEntry(db, orderId)) return
  journalOrderEvent(db, orderId, row.kind === 'refund' ? 'refund' : 'payment', {
    payment: {
      kind: row.kind,
      method: row.method,
      amount: row.amount,
      rounding: row.rounding,
      auto: ctx.auto ? 1 : 0,
      operator: ctx.operator ?? null,
      reason: ctx.reason ?? null
    }
  }, { at: ctx.now })
}

/** order-level hook: a line removed or reduced on an edit (the Z report "void"). */
export function journalLineVoid(
  db: Database.Database,
  orderId: number,
  item: { id: number; menu_item_id: number; unit_price: number; item_name?: string | null },
  quantity: number,
  operator: string | null,
  now: Date
): void {
  if (!fiscalReady(db) || quantity <= 0) return
  const order = db.prepare('SELECT fiscal_number FROM orders WHERE id = ?').get(orderId) as { fiscal_number: number | null } | undefined
  appendJournal(db, {
    type: 'void',
    orderId,
    fiscalNumber: order?.fiscal_number ?? null,
    at: now,
    payload: {
      line: { id: item.id, menu_item_id: item.menu_item_id, item_name: item.item_name ?? null, unit_price: Number(item.unit_price) || 0 },
      quantity,
      amount: (Number(item.unit_price) || 0) * quantity,
      operator
    }
  })
}

const HEADER_FIELDS = ['order_type', 'table_number', 'customer_phone', 'customer_name', 'notes', 'delivery_fee', 'total'] as const
/** Personal free text: the journal records THAT it changed, never the value (6-year retention). */
const PRIVATE_FIELDS = new Set(['customer_phone', 'customer_name', 'notes'])

/** updateOrderHeader hook: journal the changed header fields (nothing changed = no entry). */
export function journalHeaderEdit(
  db: Database.Database,
  before: Record<string, unknown>,
  orderId: number,
  operator?: string | null
): void {
  if (!fiscalReady(db)) return
  const after = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId) as Record<string, unknown> | undefined
  if (!after) return
  const changes: Record<string, unknown> = {}
  for (const field of HEADER_FIELDS) {
    const from = before[field] ?? null
    const to = after[field] ?? null
    if (from === to) continue
    changes[field] = PRIVATE_FIELDS.has(field) ? { changed: true } : { from, to }
  }
  if (Object.keys(changes).length === 0) return
  journalOrderEvent(db, orderId, 'header_edit', { changes, operator: operator ?? null })
}
