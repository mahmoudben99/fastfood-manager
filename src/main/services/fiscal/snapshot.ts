import type Database from 'better-sqlite3'
import { canonicalJson, sha256 } from './hash'

/**
 * The FISCAL content of an order: what was sold, at which price, on which ticket number, and the
 * money that moved. Its SHA-256 ("state hash") is written with every journal event, so a later
 * change made outside the software (a direct database edit) no longer matches the journal.
 *
 * Deliberately left out: operational fields that legitimately change without a sale changing
 * (kitchen status, completed_at, worker routing, payment_status which is derived from payments)
 * and personal data (customer phone / name, table, notes) that must not be frozen for 6 years in
 * an append-only journal. Line/option ids of modifier rows are left out too (they are rewritten
 * when options change; the content is what matters).
 */
export interface FiscalOrderSnapshot {
  order: {
    id: number
    fiscal_number: number | null
    daily_number: number
    order_date: string
    created_at: string
    order_type: string
    channel: string | null
    source: string | null
    cancelled: boolean
    subtotal: number
    discount_amount: number
    discount_details: string | null
    delivery_fee: number
    total: number
    shift_id: number | null
    cashier_name: string | null
  }
  lines: FiscalLineSnapshot[]
  payments: {
    id: number
    kind: string
    method: string
    amount: number
    rounding: number
    auto: number
    created_at: string
  }[]
}

export interface FiscalLineSnapshot {
  id: number
  menu_item_id: number
  item_name: string | null
  quantity: number
  unit_price: number
  total_price: number
  line_kind: string | null
  parent_order_item_id: number | null
  combo_slot_id: number | null
  combo_upcharge: number | null
  allocated_revenue: number | null
  modifiers: { name: string; kind: string; price_delta: number; quantity: number }[]
}

export function orderSnapshot(db: Database.Database, orderId: number): FiscalOrderSnapshot | null {
  const row = db.prepare(
    `SELECT id, fiscal_number, daily_number, order_date, created_at, order_type, channel, source, status,
            subtotal, discount_amount, discount_details, delivery_fee, total, shift_id, cashier_name
     FROM orders WHERE id = ?`
  ).get(orderId) as (Omit<FiscalOrderSnapshot['order'], 'cancelled'> & { status: string }) | undefined
  if (!row) return null
  const { status, ...order } = row
  const lines = db.prepare(
    `SELECT id, menu_item_id, item_name, quantity, unit_price, total_price, line_kind, parent_order_item_id,
            combo_slot_id, combo_upcharge, allocated_revenue
     FROM order_items WHERE order_id = ? ORDER BY id`
  ).all(orderId) as Omit<FiscalLineSnapshot, 'modifiers'>[]
  const modifiers = db.prepare(
    `SELECT m.order_item_id, m.name, m.kind, m.price_delta, m.quantity
     FROM order_item_modifiers m JOIN order_items i ON i.id = m.order_item_id
     WHERE i.order_id = ? ORDER BY m.order_item_id, m.sort_order, m.id`
  ).all(orderId) as ({ order_item_id: number } & FiscalLineSnapshot['modifiers'][number])[]
  const payments = db.prepare(
    `SELECT id, kind, method, amount, rounding, auto, created_at FROM order_payments WHERE order_id = ? ORDER BY id`
  ).all(orderId) as FiscalOrderSnapshot['payments']
  return {
    order: { ...order, discount_amount: order.discount_amount ?? 0, delivery_fee: order.delivery_fee ?? 0, cancelled: status === 'cancelled' },
    lines: lines.map((line) => ({
      ...line,
      modifiers: modifiers
        .filter((modifier) => modifier.order_item_id === line.id)
        .map(({ name, kind, price_delta, quantity }) => ({ name, kind, price_delta, quantity }))
    })),
    payments
  }
}

export function snapshotHash(snapshot: FiscalOrderSnapshot | null): string | null {
  return snapshot ? sha256(canonicalJson(snapshot)) : null
}
