import type Database from 'better-sqlite3'
import type { OrderPaymentInput } from '../../shared/cash'
import type { OrderDeliveryInput } from '../../shared/delivery'
import { CashError, cleanText, settingValue } from './cash-error'
import {
  getOrderDelivery, removeOrderDelivery, resolveDelivery, writeOrderDelivery, type DeliveryDetails, type ResolvedDelivery
} from './delivery'
import { keepAutoSettled, recordPayments, refreshPaymentStatus, refundAllPayments, validatePaymentShape } from './payments'
import { actingOperator, getOpenShift, openShiftId, requireOpenShift } from './shifts'

/**
 * v4 order-level effects, called from order-service.ts inside its transactions:
 * shift, payments, delivery fee / details, cancellation refunds and void records.
 * Line-level pricing stays in order-service; this module only ever sees the order's net amount.
 *
 * Payments on create: `payments` omitted → POS orders are paid in cash in full (the pre-v4
 * behaviour, auto rows); tablet orders follow setting `tablet_order_payment` ('unpaid' default |
 * 'cash'); remote orders are unpaid. `payments: []` → unpaid (pay later / cash on delivery).
 */
export { CashError }

export type { DeliveryDetails }

/** CashError → order-service result code. */
export function cashResultCode(error: CashError): 'invalid_input' | 'no_open_shift' | 'not_allowed' {
  return error.code === 'no_open_shift' || error.code === 'not_allowed' ? error.code : 'invalid_input'
}

export interface OrderLevelInput {
  payments?: OrderPaymentInput[]
  delivery?: DeliveryDetails | null
}

export interface OrderLevelPlan {
  shiftId: number | null
  deliveryFee: number
  /** A row to write, null = no delivery row (removed if present), undefined = leave as is. */
  delivery: ResolvedDelivery | null | undefined
}

const optionalId = (value: unknown, field: string): void => {
  if (value !== undefined && value !== null && (!Number.isInteger(value) || (value as number) <= 0)) {
    throw new CashError('invalid_input', `Invalid ${field}`)
  }
}

/** Shape validation before any database work. */
export function validateOrderLevel(input: OrderLevelInput): void {
  validatePaymentShape(input.payments)
  const delivery = input.delivery
  if (delivery === undefined || delivery === null) return
  if (typeof delivery !== 'object') throw new CashError('invalid_input', 'Invalid delivery details')
  optionalId(delivery.addressId, 'saved address')
  optionalId(delivery.zoneId, 'delivery zone')
  optionalId(delivery.driverId, 'driver')
}

function defaultPayment(db: Database.Database, source: string): 'cash' | 'unpaid' {
  if (source === 'pos') return 'cash'
  if (source === 'tablet') return settingValue(db, 'tablet_order_payment') === 'cash' ? 'cash' : 'unpaid'
  return 'unpaid'
}

/** Before the order row exists: shift requirement, delivery fee (total = net + fee). */
export function planOrderLevelCreate(
  db: Database.Database,
  input: OrderLevelInput & { orderType: string },
  netBeforeFee: number
): OrderLevelPlan {
  const shiftId = openShiftId(db)
  if (shiftId === null && requireOpenShift(db)) {
    throw new CashError('no_open_shift', 'NO_OPEN_SHIFT: open a shift before taking orders')
  }
  if (input.orderType !== 'delivery' || !input.delivery) return { shiftId, deliveryFee: 0, delivery: undefined }
  const resolved = resolveDelivery(db, input.delivery, null, netBeforeFee)
  return { shiftId, deliveryFee: resolved.fee, delivery: resolved }
}

/** After the order row (with its final total) was inserted. */
export function applyOrderLevelCreate(
  db: Database.Database,
  orderId: number,
  plan: OrderLevelPlan,
  input: OrderLevelInput & { source: string; operator?: string },
  now: Date
): void {
  const cashier = cleanText(input.operator, 80) || getOpenShift(db)?.cashier_name || null
  // payment_status leaves NULL at once: NULL would read as a pre-v4 (paid) order.
  db.prepare("UPDATE orders SET delivery_fee = ?, shift_id = ?, cashier_name = ?, payment_status = 'unpaid' WHERE id = ?")
    .run(plan.deliveryFee, plan.shiftId, cashier, orderId)
  if (plan.delivery) writeOrderDelivery(db, orderId, plan.delivery, now)
  const ctx = { shiftId: plan.shiftId, operator: cashier, now }
  if (input.payments !== undefined) {
    if (input.payments.length > 0) recordPayments(db, orderId, input.payments, ctx)
  } else if (defaultPayment(db, input.source) === 'cash') {
    const total = (db.prepare('SELECT total FROM orders WHERE id = ?').get(orderId) as { total: number }).total
    if (total > 0) recordPayments(db, orderId, [{ method: 'cash' }], { ...ctx, auto: true, noRounding: true })
  }
  refreshPaymentStatus(db, orderId, true)
}

/** Edit: the fee follows the (next) order type and optional delivery patch. */
export function planOrderLevelEdit(
  db: Database.Database,
  orderId: number,
  nextOrderType: string,
  delivery: DeliveryDetails | null | undefined,
  netBeforeFee: number
): OrderLevelPlan {
  const order = db.prepare('SELECT order_type, delivery_fee, shift_id FROM orders WHERE id = ?').get(orderId) as
    { order_type: string; delivery_fee: number; shift_id: number | null }
  const row = getOrderDelivery(db, orderId)
  const shiftId = order.shift_id
  if (nextOrderType !== 'delivery') return { shiftId, deliveryFee: 0, delivery: row ? null : undefined }
  if (delivery === undefined) {
    return { shiftId, deliveryFee: order.order_type === 'delivery' ? Number(order.delivery_fee) || 0 : 0, delivery: undefined }
  }
  if (delivery === null) return { shiftId, deliveryFee: 0, delivery: row ? null : undefined }
  const resolved = resolveDelivery(db, delivery, { row, fee: Number(order.delivery_fee) || 0 }, netBeforeFee)
  return { shiftId, deliveryFee: resolved.fee, delivery: resolved }
}

/** After the edited totals were written. */
export function applyOrderLevelEdit(db: Database.Database, orderId: number, plan: OrderLevelPlan, now: Date): void {
  db.prepare('UPDATE orders SET delivery_fee = ? WHERE id = ?').run(plan.deliveryFee, orderId)
  if (plan.delivery === null) removeOrderDelivery(db, orderId)
  else if (plan.delivery) writeOrderDelivery(db, orderId, plan.delivery, now)
  keepAutoSettled(db, orderId, { shiftId: openShiftId(db), operator: actingOperator(db), now })
  refreshPaymentStatus(db, orderId)
}

/** After the status was set to cancelled: refunds, 'void' payment status, cancellation record. */
export function onOrderCancelled(
  db: Database.Database,
  orderId: number,
  meta: { operator?: string; reason?: string } | undefined,
  now: Date
): void {
  const shiftId = openShiftId(db)
  const operator = actingOperator(db, meta?.operator)
  const reason = cleanText(meta?.reason, 200)
  const order = db.prepare('SELECT total FROM orders WHERE id = ?').get(orderId) as { total: number }
  refundAllPayments(db, orderId, { shiftId, operator, reason: reason ?? 'Order cancelled', now })
  refreshPaymentStatus(db, orderId)
  db.prepare(
    `INSERT INTO order_voids (scope, order_id, quantity, amount, shift_id, operator, reason, created_at)
     VALUES ('order', ?, 0, ?, ?, ?, ?, ?)`
  ).run(orderId, Number(order.total) || 0, shiftId, operator, reason, now.toISOString())
}

/** After a cancelled order was restored: all-auto orders are re-settled, others owe their total. */
export function onOrderRestored(db: Database.Database, orderId: number, now: Date): void {
  keepAutoSettled(db, orderId, { shiftId: openShiftId(db), operator: actingOperator(db), now })
  refreshPaymentStatus(db, orderId)
}

/** A line removed (or reduced by `quantity`) on an edit — Z report "voids". */
export function recordLineVoid(
  db: Database.Database,
  orderId: number,
  item: { id: number; menu_item_id: number; unit_price: number; item_name?: string | null },
  quantity: number,
  operator: string | undefined,
  now: Date
): void {
  if (quantity <= 0) return
  db.prepare(
    `INSERT INTO order_voids
     (scope, order_id, order_item_id, menu_item_id, item_name, quantity, unit_price, amount, shift_id, operator, created_at)
     VALUES ('line', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    orderId, item.id, item.menu_item_id, item.item_name ?? null, quantity, Number(item.unit_price) || 0,
    (Number(item.unit_price) || 0) * quantity, openShiftId(db), actingOperator(db, operator), now.toISOString()
  )
}

/** Renderer (snake_case) delivery input → service shape; keeps "absent" vs "null" for patches. */
export function mapDeliveryInput(input: OrderDeliveryInput | null | undefined): DeliveryDetails | null | undefined {
  if (input === undefined || input === null) return input
  const out: DeliveryDetails = {}
  if ('address' in input) out.address = input.address
  if ('address_id' in input) out.addressId = input.address_id
  if ('zone_id' in input) out.zoneId = input.zone_id
  if ('driver_id' in input) out.driverId = input.driver_id
  if ('fee' in input) out.fee = input.fee
  if ('notes' in input) out.notes = input.notes
  if (input.save_address) out.saveAddress = true
  if (input.ignore_min_order) out.ignoreMinOrder = true
  return out
}
