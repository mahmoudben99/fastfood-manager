import type Database from 'better-sqlite3'
import {
  cashBreakdown, type OrderPaymentInput, type OrderPaymentRow, type OrderPaymentSummary, type PaymentStatus,
  type RefundInput
} from '../../shared/cash'
import { CashError, cleanText, wholeDinars } from './cash-error'
import { cashRoundingStep, enabledPaymentMethod } from './payment-methods'
import { journalPaymentRow } from './fiscal/journal' // v4 fiscal

/**
 * Order payments ledger (table order_payments). Every row is money that moved:
 * kind 'payment' (amount ≥ 0) or 'refund' (amount ≤ 0); `rounding` is the cash-rounding delta, so a
 * row changes the drawer by amount + rounding. The order's `payment_status` is derived from the
 * rows; NULL means a pre-v4 order, which is treated as paid in cash.
 *
 * Rows marked auto = 1 were written without a cashier decision (a checkout that sent no payment
 * info, cancel refunds). An order whose rows are ALL auto is kept settled automatically when its
 * total changes (edit, delivery fee, restore) — the pre-v4 "everything is paid in cash" behaviour.
 */

export interface PaymentContext {
  shiftId: number | null
  operator?: string | null
  driverId?: number | null
  auto?: boolean
  /** Settlement / auto rows: no cash rounding. */
  noRounding?: boolean
  reason?: string | null
  now: Date
}

interface OrderMoneyRow {
  id: number
  total: number
  status: string
  payment_status: PaymentStatus | null
}

const MAX_PAYMENT_LINES = 10

function orderRow(db: Database.Database, orderId: number): OrderMoneyRow {
  const order = db.prepare('SELECT id, total, status, payment_status FROM orders WHERE id = ?').get(orderId) as OrderMoneyRow | undefined
  if (!order) throw new CashError('not_found', 'Order not found')
  return order
}

export function orderPayments(db: Database.Database, orderId: number): OrderPaymentRow[] {
  return db.prepare('SELECT * FROM order_payments WHERE order_id = ? ORDER BY id').all(orderId) as OrderPaymentRow[]
}

const isLegacy = (order: OrderMoneyRow, rows: OrderPaymentRow[]): boolean => order.payment_status === null && rows.length === 0

function statusFor(total: number, paid: number, orderStatus: string): PaymentStatus {
  if (orderStatus === 'cancelled') return 'void'
  if (total <= 0 || paid >= total) return 'paid'
  return paid <= 0 ? 'unpaid' : 'partial'
}

export function paymentSummary(db: Database.Database, orderId: number): OrderPaymentSummary {
  const order = orderRow(db, orderId)
  const rows = orderPayments(db, orderId)
  const total = Math.round(Number(order.total))
  if (isLegacy(order, rows)) {
    return { orderId, total, paid: total, balanceDue: 0, status: order.status === 'cancelled' ? 'void' : 'paid', legacy: true, payments: [] }
  }
  const paid = rows.reduce((acc, row) => acc + row.amount, 0)
  return {
    orderId, total, paid, balanceDue: total - paid, status: statusFor(total, paid, order.status), legacy: false, payments: rows
  }
}

/**
 * Recompute orders.payment_status. A pre-v4 order (NULL, no rows) stays NULL unless `initial`
 * (a brand-new v4 order, which must never look legacy even when unpaid).
 */
export function refreshPaymentStatus(db: Database.Database, orderId: number, initial = false): PaymentStatus | null {
  const order = orderRow(db, orderId)
  const rows = orderPayments(db, orderId)
  if (!initial && isLegacy(order, rows)) return null
  const paid = rows.reduce((acc, row) => acc + row.amount, 0)
  const status = statusFor(Math.round(Number(order.total)), paid, order.status)
  db.prepare('UPDATE orders SET payment_status = ? WHERE id = ?').run(status, orderId)
  return status
}

function insertRow(
  db: Database.Database,
  orderId: number,
  row: { kind: 'payment' | 'refund'; method: string; amount: number; rounding: number; tendered: number | null; change: number; reference: string | null },
  ctx: PaymentContext
): void {
  db.prepare(
    `INSERT INTO order_payments
     (order_id, kind, method, amount, rounding, tendered, change_given, reference, shift_id, driver_id, auto, operator, reason, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    orderId, row.kind, row.method, row.amount, row.rounding, row.tendered, row.change, row.reference,
    ctx.shiftId, ctx.driverId ?? null, ctx.auto ? 1 : 0, cleanText(ctx.operator, 80), cleanText(ctx.reason, 200),
    ctx.now.toISOString()
  )
  // v4 fiscal: every money movement is a 'payment' / 'refund' journal entry (same transaction).
  journalPaymentRow(db, orderId, row, { ...ctx, operator: cleanText(ctx.operator, 80), reason: cleanText(ctx.reason, 200) })
}

/** Shape check done before any database work (order create / edit input validation). */
export function validatePaymentShape(payments: unknown): void {
  if (payments === undefined) return
  if (!Array.isArray(payments) || payments.length > MAX_PAYMENT_LINES) {
    throw new CashError('invalid_input', `Payments must be a list of at most ${MAX_PAYMENT_LINES} lines`)
  }
  payments.forEach((line, index) => {
    if (!line || typeof line !== 'object' || typeof line.method !== 'string' || !line.method) {
      throw new CashError('invalid_input', `Payment line ${index + 1} needs a method`)
    }
    if (line.amount !== undefined) wholeDinars(line.amount, `Payment line ${index + 1} amount`, 1)
    if (line.tendered !== undefined) wholeDinars(line.tendered, `Payment line ${index + 1} tendered cash`)
  })
}

/**
 * Record payment lines against the order's balance (split payments welcome). A line without an
 * amount pays the remaining balance. Lines may not exceed the balance: cash over-payment is
 * expressed with `tendered` and returned as change. Cash lines are rounded (setting cash_rounding).
 */
export function recordPayments(
  db: Database.Database,
  orderId: number,
  lines: OrderPaymentInput[],
  ctx: PaymentContext
): OrderPaymentSummary {
  validatePaymentShape(lines)
  const order = orderRow(db, orderId)
  if (order.status === 'cancelled') throw new CashError('not_allowed', 'A cancelled order cannot take a payment')
  let remaining = paymentSummary(db, orderId).balanceDue
  const step = ctx.noRounding ? 0 : cashRoundingStep(db)
  lines.forEach((line, index) => {
    const method = String(line.method).trim()
    if (!(ctx.auto && method === 'cash') && !enabledPaymentMethod(db, method)) {
      throw new CashError('invalid_input', `Payment method "${method}" is not enabled`)
    }
    const amount = line.amount === undefined ? remaining : wholeDinars(line.amount, 'Payment amount', 1)
    if (amount <= 0) throw new CashError('invalid_input', 'This order has no balance left to pay')
    if (amount > remaining) {
      throw new CashError('invalid_input', `Payment line ${index + 1} (${amount}) exceeds the balance due (${remaining})`)
    }
    let rounding = 0
    let tendered: number | null = null
    let change = 0
    if (method === 'cash') {
      const cash = cashBreakdown(amount, line.tendered, step)
      if (!cash.sufficient) {
        throw new CashError('invalid_input', `Tendered cash (${line.tendered}) is less than the amount due (${cash.due})`)
      }
      rounding = cash.rounding
      tendered = line.tendered === undefined ? null : Math.round(line.tendered)
      change = cash.change ?? 0
    }
    insertRow(db, orderId, {
      kind: 'payment', method, amount, rounding, tendered, change, reference: cleanText(line.reference, 100)
    }, ctx)
    remaining -= amount
  })
  refreshPaymentStatus(db, orderId, true)
  return paymentSummary(db, orderId)
}

/** Give money back on one method (amount > 0 DA, at most what that method has net collected). */
export function recordRefund(db: Database.Database, orderId: number, input: RefundInput, ctx: PaymentContext): OrderPaymentSummary {
  const method = String(input?.method ?? '').trim()
  const amount = wholeDinars(input?.amount, 'Refund amount', 1)
  const summary = paymentSummary(db, orderId)
  const collected = summary.legacy
    ? (method === 'cash' ? summary.total : 0)
    : summary.payments.filter((row) => row.method === method).reduce((acc, row) => acc + row.amount, 0)
  if (amount > collected) throw new CashError('invalid_input', `Only ${collected} was collected by ${method} on this order`)
  const step = method === 'cash' && !ctx.noRounding ? cashRoundingStep(db) : 0
  const rounding = method === 'cash' ? cashBreakdown(amount, undefined, step).rounding : 0
  if (summary.legacy) insertLegacyCash(db, orderId, summary.total, ctx)
  insertRow(db, orderId, {
    kind: 'refund', method, amount: -amount, rounding: -rounding, tendered: null, change: 0, reference: null
  }, { ...ctx, reason: input?.reason ?? ctx.reason })
  refreshPaymentStatus(db, orderId, true)
  return paymentSummary(db, orderId)
}

/**
 * A pre-v4 order becomes explicit before its first ledger change: one auto cash row for its total,
 * outside any shift (it was paid before shifts existed).
 */
function insertLegacyCash(db: Database.Database, orderId: number, total: number, ctx: PaymentContext): void {
  if (total <= 0) return
  insertRow(db, orderId, {
    kind: 'payment', method: 'cash', amount: total, rounding: 0, tendered: null, change: 0, reference: null
  }, { ...ctx, shiftId: null, auto: true, driverId: null, reason: 'Paid before v4 (assumed cash)' })
}

/** On cancel: refund, per method, everything still collected (auto rows; rounding reversed too). */
export function refundAllPayments(db: Database.Database, orderId: number, ctx: PaymentContext): void {
  const summary = paymentSummary(db, orderId)
  if (summary.legacy) insertLegacyCash(db, orderId, summary.total, ctx)
  const net = new Map<string, { amount: number; rounding: number }>()
  for (const row of orderPayments(db, orderId)) {
    const entry = net.get(row.method) ?? { amount: 0, rounding: 0 }
    entry.amount += row.amount
    entry.rounding += row.rounding
    net.set(row.method, entry)
  }
  for (const [method, entry] of net) {
    if (entry.amount <= 0) continue
    insertRow(db, orderId, {
      kind: 'refund', method, amount: -entry.amount, rounding: -entry.rounding, tendered: null, change: 0, reference: null
    }, { ...ctx, auto: true })
  }
}

/**
 * Keep an all-auto order settled after its total changed (edit, delivery fee, restore): post the
 * difference as an auto cash row. Orders with any explicit payment keep their balance due.
 */
export function keepAutoSettled(db: Database.Database, orderId: number, ctx: PaymentContext): void {
  const order = orderRow(db, orderId)
  const rows = orderPayments(db, orderId)
  if (order.status === 'cancelled' || rows.length === 0 || rows.some((row) => row.auto !== 1)) return
  const paid = rows.reduce((acc, row) => acc + row.amount, 0)
  const delta = Math.round(Number(order.total)) - paid
  if (delta === 0) return
  insertRow(db, orderId, {
    kind: delta > 0 ? 'payment' : 'refund', method: 'cash', amount: delta, rounding: 0, tendered: null, change: 0, reference: null
  }, { ...ctx, auto: true })
}

/**
 * Non-cancelled orders with a balance due (pay later / COD), newest first. `refunded` = money handed
 * back by hand (a partial refund keeps the total, so it shows up here as a balance due).
 */
export function listUnpaidOrders(db: Database.Database, options: { date?: string; shiftId?: number } = {}): {
  id: number; daily_number: number; order_date: string; order_type: string; customer_name: string | null
  customer_phone: string | null; total: number; paid: number; balance_due: number; payment_status: string; refunded: number
}[] {
  return db.prepare(
    `SELECT o.id, o.daily_number, o.order_date, o.order_type, o.customer_name, o.customer_phone, o.total,
            COALESCE(SUM(p.amount), 0) AS paid, o.total - COALESCE(SUM(p.amount), 0) AS balance_due, o.payment_status,
            COALESCE(SUM(CASE WHEN p.kind = 'refund' AND p.auto = 0 THEN -p.amount ELSE 0 END), 0) AS refunded
     FROM orders o LEFT JOIN order_payments p ON p.order_id = o.id
     WHERE o.status != 'cancelled' AND o.payment_status IN ('unpaid', 'partial')
       AND (? IS NULL OR o.order_date = ?) AND (? IS NULL OR o.shift_id = ?)
     GROUP BY o.id ORDER BY o.id DESC LIMIT 500`
  ).all(options.date ?? null, options.date ?? null, options.shiftId ?? null, options.shiftId ?? null) as any[]
}

/**
 * Collected money by method for a date range (order_date), net of refunds. Pre-v4 orders count as
 * cash for their total. Cancelled orders net to zero through their refunds.
 */
export function salesByMethod(db: Database.Database, startDate: string, endDate: string): { method: string; amount: number; count: number }[] {
  const rows = db.prepare(
    `SELECT p.method, COALESCE(SUM(p.amount), 0) AS amount, COUNT(DISTINCT CASE WHEN p.kind = 'payment' THEN p.order_id END) AS count
     FROM order_payments p JOIN orders o ON o.id = p.order_id
     WHERE o.order_date BETWEEN ? AND ? GROUP BY p.method ORDER BY amount DESC`
  ).all(startDate, endDate) as { method: string; amount: number; count: number }[]
  const legacy = db.prepare(
    `SELECT COALESCE(SUM(o.total), 0) AS amount, COUNT(*) AS count FROM orders o
     WHERE o.order_date BETWEEN ? AND ? AND o.status != 'cancelled' AND o.payment_status IS NULL
       AND NOT EXISTS (SELECT 1 FROM order_payments p WHERE p.order_id = o.id)`
  ).get(startDate, endDate) as { amount: number; count: number }
  if (legacy.count > 0) {
    const cash = rows.find((row) => row.method === 'cash')
    if (cash) {
      cash.amount += Math.round(legacy.amount)
      cash.count += legacy.count
    } else {
      rows.push({ method: 'cash', amount: Math.round(legacy.amount), count: legacy.count })
    }
  }
  return rows
}
