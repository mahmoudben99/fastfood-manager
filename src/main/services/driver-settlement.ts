import type Database from 'better-sqlite3'
import { businessDateInAlgiers } from '../../shared/order-edit'
import type { DriverSettlement, DriverSettlementPreview } from '../../shared/delivery'
import { CashError, cleanText, wholeDinars } from './cash-error'
import { paymentSummary, recordPayments } from './payments'
import { actingOperator, openShiftId } from './shifts'

/**
 * End-of-day driver cash settlement. A driver's delivered, not yet settled orders are expected to
 * bring back their balance due in cash (COD). Settling records those cash payments (with the
 * driver id) in the open shift and stores collected − expected; the drawer's expected cash adds
 * that difference, so a driver's shortage is reported against the driver, not the cashier.
 */
export function driverSettlementPreview(db: Database.Database, driverId: number): DriverSettlementPreview {
  const driver = db.prepare('SELECT id, name FROM workers WHERE id = ?').get(driverId) as { id: number; name: string } | undefined
  if (!driver) throw new CashError('not_found', 'Driver not found')
  const rows = db.prepare(
    `SELECT o.id, o.daily_number, o.order_date, o.total, o.delivery_fee
     FROM order_deliveries d JOIN orders o ON o.id = d.order_id
     WHERE d.driver_id = ? AND d.status = 'delivered' AND d.settlement_id IS NULL AND o.status != 'cancelled'
     ORDER BY o.id`
  ).all(driverId) as { id: number; daily_number: number; order_date: string; total: number; delivery_fee: number }[]
  const orders = rows.map((row) => {
    const balance = Math.max(0, paymentSummary(db, row.id).balanceDue)
    return { orderId: row.id, dailyNumber: row.daily_number, orderDate: row.order_date, total: Math.round(row.total), balanceDue: balance }
  })
  const pending = db.prepare(
    `SELECT SUM(CASE WHEN d.status = 'out_for_delivery' THEN 1 ELSE 0 END) AS out_count,
            SUM(CASE WHEN d.status = 'failed' THEN 1 ELSE 0 END) AS failed_count
     FROM order_deliveries d JOIN orders o ON o.id = d.order_id
     WHERE d.driver_id = ? AND d.settlement_id IS NULL AND o.status != 'cancelled'`
  ).get(driverId) as { out_count: number | null; failed_count: number | null }
  return {
    driverId,
    driverName: driver.name,
    orders,
    expectedCash: orders.reduce((acc, order) => acc + order.balanceDue, 0),
    deliveryFees: Math.round(rows.reduce((acc, row) => acc + Number(row.delivery_fee), 0)),
    outForDelivery: pending.out_count ?? 0,
    failed: pending.failed_count ?? 0
  }
}

export function settleDriver(
  db: Database.Database,
  input: { driver_id: number; collected_cash: number; note?: string; operator?: string },
  now: Date = new Date()
): DriverSettlement {
  const collected = wholeDinars(input?.collected_cash, 'Collected cash')
  return db.transaction(() => {
    const preview = driverSettlementPreview(db, Number(input.driver_id))
    if (preview.orders.length === 0) throw new CashError('invalid_input', 'This driver has no delivered order to settle')
    const shiftId = openShiftId(db)
    const operator = actingOperator(db, input.operator)
    for (const order of preview.orders) {
      if (order.balanceDue <= 0) continue
      recordPayments(db, order.orderId, [{ method: 'cash', amount: order.balanceDue }], {
        shiftId, operator, driverId: preview.driverId, noRounding: true, reason: 'Driver settlement', now
      })
    }
    const id = Number(db.prepare(
      `INSERT INTO driver_settlements
       (driver_id, shift_id, business_date, order_count, expected_cash, collected_cash, difference, note, operator, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      preview.driverId, shiftId, businessDateInAlgiers(now), preview.orders.length, preview.expectedCash, collected,
      collected - preview.expectedCash, cleanText(input.note, 300), operator, now.toISOString()
    ).lastInsertRowid)
    const mark = db.prepare('UPDATE order_deliveries SET settlement_id = ?, updated_at = ? WHERE order_id = ?')
    for (const order of preview.orders) mark.run(id, now.toISOString(), order.orderId)
    return getSettlement(db, id)!
  })()
}

export function getSettlement(db: Database.Database, id: number): DriverSettlement | null {
  return (db.prepare(
    `SELECT s.*, w.name AS driver_name FROM driver_settlements s LEFT JOIN workers w ON w.id = s.driver_id WHERE s.id = ?`
  ).get(id) as DriverSettlement | undefined) ?? null
}

export function listSettlements(db: Database.Database, options: { date?: string; shiftId?: number } = {}): DriverSettlement[] {
  return db.prepare(
    `SELECT s.*, w.name AS driver_name FROM driver_settlements s LEFT JOIN workers w ON w.id = s.driver_id
     WHERE (? IS NULL OR s.business_date = ?) AND (? IS NULL OR s.shift_id = ?) ORDER BY s.id DESC LIMIT 500`
  ).all(options.date ?? null, options.date ?? null, options.shiftId ?? null, options.shiftId ?? null) as DriverSettlement[]
}
