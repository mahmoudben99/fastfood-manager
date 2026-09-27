import type Database from 'better-sqlite3'
import type { DenominationCounts } from '../../shared/cash'
import type { Shift, ShiftReport, ShiftReportLine } from '../../shared/shift-report'
import { CashError } from './cash-error'
import { appLang, methodLabel } from './payment-methods'

/**
 * X / Z report numbers for one shift.
 *
 *  - Sales (orders, categories, top items, discounts) = orders rung up in this shift, not cancelled.
 *  - Payments by method = money that moved in this shift (a pay-later order settled now counts here).
 *  - Expected cash = float + cash sales − cash refunds + rounding + pay-ins − pay-outs
 *                    + driver settlement differences (collected − expected COD).
 *  - Cancellations / voids = order_voids rows written while this shift was open.
 */
export interface ShiftReportOptions {
  kind: 'X' | 'Z'
  now: Date
  /** Hide the expected cash (blind count before close). */
  blind?: boolean
  counted?: number | null
  denominations?: DenominationCounts | null
  /** The shift row as it will be stored (used while closing). */
  shiftOverride?: Shift
}

interface OrderRow {
  id: number
  daily_number: number
  order_type: string
  status: string
  subtotal: number
  discount_amount: number
  delivery_fee: number
  total: number
  cashier_name: string | null
}

const sum = (values: number[]): number => Math.round(values.reduce((acc, value) => acc + (Number(value) || 0), 0))

/** SQLite `datetime('now')` values are UTC without a zone marker. */
const iso = (value: string): string =>
  /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value) ? `${value.replace(' ', 'T')}Z` : value

export function buildShiftReport(db: Database.Database, shiftId: number, options: ShiftReportOptions): ShiftReport {
  const shift = options.shiftOverride ??
    (db.prepare('SELECT * FROM shifts WHERE id = ?').get(shiftId) as Shift | undefined)
  if (!shift) throw new CashError('not_found', 'Shift not found')
  const lang = appLang(db)
  const nameColumn = lang === 'ar' ? 'name_ar' : lang === 'fr' ? 'name_fr' : null

  const orders = db.prepare(
    `SELECT id, daily_number, order_type, status, subtotal, discount_amount, delivery_fee, total, cashier_name
     FROM orders WHERE shift_id = ? ORDER BY id`
  ).all(shiftId) as OrderRow[]
  const live = orders.filter((order) => order.status !== 'cancelled')
  const byType: ShiftReport['orders']['by_type'] = {
    local: { count: 0, total: 0 }, takeout: { count: 0, total: 0 }, delivery: { count: 0, total: 0 }
  }
  for (const order of live) {
    const bucket = byType[(order.order_type as keyof typeof byType)] ?? byType.local
    bucket.count += 1
    bucket.total = Math.round(bucket.total + Number(order.total))
  }
  const netSales = sum(live.map((order) => order.total))

  const paymentRows = db.prepare(
    `SELECT method, kind, COUNT(*) AS n, COALESCE(SUM(amount), 0) AS amount,
            COALESCE(SUM(rounding), 0) AS rounding, COALESCE(SUM(change_given), 0) AS change_given
     FROM order_payments WHERE shift_id = ? GROUP BY method, kind ORDER BY method`
  ).all(shiftId) as { method: string; kind: 'payment' | 'refund'; n: number; amount: number; rounding: number; change_given: number }[]
  const byMethod = new Map<string, ShiftReport['payments'][number]>()
  for (const row of paymentRows) {
    const entry = byMethod.get(row.method) ??
      { method: row.method, label: methodLabel(db, row.method, lang), count: 0, amount: 0, refunds: 0, net: 0 }
    if (row.kind === 'payment') {
      entry.count += row.n
      entry.amount += row.amount
    } else {
      entry.refunds += row.amount
    }
    entry.net = entry.amount + entry.refunds
    byMethod.set(row.method, entry)
  }
  const cashRows = paymentRows.filter((row) => row.method === 'cash')
  const cashSales = sum(cashRows.filter((row) => row.kind === 'payment').map((row) => row.amount))
  const cashRefunds = sum(cashRows.filter((row) => row.kind === 'refund').map((row) => row.amount))
  const rounding = sum(cashRows.map((row) => row.rounding))
  const changeGiven = sum(cashRows.map((row) => row.change_given))

  const movements = db.prepare('SELECT * FROM cash_movements WHERE shift_id = ? ORDER BY id').all(shiftId) as ShiftReport['movements']
  const payIns = sum(movements.filter((row) => row.kind === 'pay_in').map((row) => row.amount))
  const payOuts = sum(movements.filter((row) => row.kind === 'pay_out').map((row) => row.amount))

  const settlements = db.prepare(
    `SELECT s.expected_cash, s.collected_cash, s.difference, COALESCE(w.name, 'Driver #' || s.driver_id) AS driver_name
     FROM driver_settlements s LEFT JOIN workers w ON w.id = s.driver_id WHERE s.shift_id = ? ORDER BY s.id`
  ).all(shiftId) as { expected_cash: number; collected_cash: number; difference: number; driver_name: string }[]
  const driverDifferences = sum(settlements.map((row) => row.difference))

  const expected = shift.opening_float + cashSales + cashRefunds + rounding + payIns - payOuts + driverDifferences
  const counted = options.counted ?? shift.counted_cash ?? null
  const blind = Boolean(options.blind)

  const paidByOrder = new Map<number, number>()
  for (const row of db.prepare(
    `SELECT p.order_id, COALESCE(SUM(p.amount), 0) AS paid FROM order_payments p
     JOIN orders o ON o.id = p.order_id WHERE o.shift_id = ? GROUP BY p.order_id`
  ).all(shiftId) as { order_id: number; paid: number }[]) paidByOrder.set(row.order_id, row.paid)
  const dues = live.map((order) => Number(order.total) - (paidByOrder.get(order.id) ?? 0)).filter((due) => due > 0)

  const localized = (base: string, localizedColumn: string | null): string =>
    localizedColumn ? `COALESCE(NULLIF(${localizedColumn}, ''), ${base})` : base
  const categories = db.prepare(
    `SELECT ${localized('c.name', nameColumn && `c.${nameColumn}`)} AS name,
            SUM(oi.quantity) AS quantity, SUM(oi.total_price) AS revenue
     FROM order_items oi JOIN orders o ON o.id = oi.order_id
     LEFT JOIN menu_items mi ON mi.id = oi.menu_item_id LEFT JOIN categories c ON c.id = mi.category_id
     WHERE o.shift_id = ? AND o.status != 'cancelled'
     GROUP BY mi.category_id ORDER BY revenue DESC`
  ).all(shiftId) as ShiftReportLine[]
  const itemName = nameColumn
    ? `COALESCE(NULLIF(CASE WHEN oi.item_name IS NOT NULL THEN oi.item_${nameColumn} ELSE mi.${nameColumn} END, ''), oi.item_name, mi.name)`
    : 'COALESCE(oi.item_name, mi.name)'
  const topItems = db.prepare(
    `SELECT MAX(oi.id) AS last_line_id, ${itemName} AS name, SUM(oi.quantity) AS quantity, SUM(oi.total_price) AS revenue
     FROM order_items oi JOIN orders o ON o.id = oi.order_id LEFT JOIN menu_items mi ON mi.id = oi.menu_item_id
     WHERE o.shift_id = ? AND o.status != 'cancelled'
     GROUP BY oi.menu_item_id ORDER BY quantity DESC, revenue DESC LIMIT 10`
  ).all(shiftId) as (ShiftReportLine & { last_line_id?: number })[]

  const discounted = live.filter((order) => Number(order.discount_amount) > 0)
  const discountsByCashier = new Map<string, { cashier: string; count: number; amount: number }>()
  for (const order of discounted) {
    const cashier = order.cashier_name || shift.cashier_name
    const entry = discountsByCashier.get(cashier) ?? { cashier, count: 0, amount: 0 }
    entry.count += 1
    entry.amount = Math.round(entry.amount + Number(order.discount_amount))
    discountsByCashier.set(cashier, entry)
  }

  const cancellations = db.prepare(
    `SELECT v.order_id, o.daily_number, v.amount, v.created_at, COALESCE(v.operator, 'system') AS operator, v.reason
     FROM order_voids v JOIN orders o ON o.id = v.order_id
     WHERE v.shift_id = ? AND v.scope = 'order' AND o.status = 'cancelled'
       AND v.id = (SELECT MAX(id) FROM order_voids WHERE order_id = v.order_id AND scope = 'order')
     ORDER BY v.id`
  ).all(shiftId) as { order_id: number; daily_number: number; amount: number; created_at: string; operator: string; reason: string | null }[]
  const voids = db.prepare(
    `SELECT v.order_id, o.daily_number, COALESCE(v.item_name, 'Item #' || v.menu_item_id) AS item_name,
            v.quantity, v.amount, v.created_at, COALESCE(v.operator, 'system') AS operator
     FROM order_voids v JOIN orders o ON o.id = v.order_id
     WHERE v.shift_id = ? AND v.scope = 'line' ORDER BY v.id`
  ).all(shiftId) as { order_id: number; daily_number: number; item_name: string; quantity: number; amount: number; created_at: string; operator: string }[]
  const voidsByOperator = new Map<string, { operator: string; count: number; amount: number }>()
  for (const row of voids) {
    const entry = voidsByOperator.get(row.operator) ?? { operator: row.operator, count: 0, amount: 0 }
    entry.count += 1
    entry.amount = Math.round(entry.amount + Number(row.amount))
    voidsByOperator.set(row.operator, entry)
  }

  return {
    kind: options.kind,
    generated_at: options.now.toISOString(),
    shift,
    orders: {
      count: live.length,
      gross_sales: sum(live.map((order) => order.subtotal)),
      discounts: sum(live.map((order) => order.discount_amount)),
      delivery_fees: sum(live.map((order) => order.delivery_fee)),
      net_sales: netSales,
      average_ticket: live.length > 0 ? Math.round(netSales / live.length) : 0,
      by_type: byType
    },
    payments: [...byMethod.values()],
    cash: {
      opening_float: shift.opening_float,
      cash_sales: cashSales,
      cash_refunds: cashRefunds,
      rounding,
      pay_ins: payIns,
      pay_outs: payOuts,
      driver_differences: driverDifferences,
      change_given: changeGiven,
      expected: blind ? null : expected,
      counted,
      over_short: blind || counted === null ? null : counted - expected,
      denominations: options.denominations ?? (shift.denominations ? JSON.parse(shift.denominations) : null)
    },
    unpaid: { count: dues.length, amount: sum(dues) },
    categories: categories.map((row) => ({ name: row.name || '—', quantity: Number(row.quantity), revenue: Math.round(Number(row.revenue)) })),
    top_items: topItems.map((row) => ({ name: row.name || '—', quantity: Number(row.quantity), revenue: Math.round(Number(row.revenue)) })),
    discounts: { count: discounted.length, amount: sum(discounted.map((order) => order.discount_amount)), by_cashier: [...discountsByCashier.values()] },
    cancellations: {
      count: cancellations.length,
      amount: sum(cancellations.map((row) => row.amount)),
      list: cancellations.map((row) => ({
        order_id: row.order_id, daily_number: row.daily_number, total: Math.round(row.amount),
        at: iso(row.created_at), by: row.operator, reason: row.reason
      }))
    },
    voids: {
      count: voids.length,
      amount: sum(voids.map((row) => row.amount)),
      list: voids.map((row) => ({
        order_id: row.order_id, daily_number: row.daily_number, item_name: row.item_name,
        quantity: row.quantity, amount: Math.round(row.amount), at: iso(row.created_at), by: row.operator
      })),
      by_operator: [...voidsByOperator.values()]
    },
    movements,
    driver_settlements: settlements.map((row) => ({
      driver_name: row.driver_name, expected: row.expected_cash, collected: row.collected_cash, difference: row.difference
    })),
    blind
  }
}
