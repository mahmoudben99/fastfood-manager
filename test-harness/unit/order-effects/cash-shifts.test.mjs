// v4 shifts / cash drawer: open / close math, pay-in / pay-out, cancellations, voids, Z report.
import test from 'node:test'
import assert from 'node:assert/strict'
import { createOrderService, fixedNow, freshDb, NOW, order, rows, seedMenu, setSetting, shifts, tryOrder } from './cash-test-helpers.mjs'

test('one open shift per register; orders carry its id; require_open_shift blocks orders without one', () => {
  const { db, cleanup } = freshDb()
  try {
    seedMenu(db)
    const service = createOrderService({ db, now: fixedNow })
    const before = order(service)
    assert.equal(db.prepare('SELECT shift_id FROM orders WHERE id = ?').get(before.orderId).shift_id, null)

    setSetting(db, 'require_open_shift', 'true')
    const refused = tryOrder(service)
    assert.equal(refused.ok, false)
    assert.equal(refused.code, 'no_open_shift')
    assert.match(refused.message, /^NO_OPEN_SHIFT:/)

    const shift = shifts.openShift(db, { cashier_name: 'Karim', opening_float: 5000 }, NOW)
    assert.equal(shift.status, 'open')
    assert.equal(shift.business_date, '2026-09-27')
    assert.throws(() => shifts.openShift(db, { cashier_name: 'Nadia', opening_float: 0 }, NOW), /SHIFT_ALREADY_OPEN/)
    const during = order(service)
    const row = db.prepare('SELECT shift_id, cashier_name FROM orders WHERE id = ?').get(during.orderId)
    assert.deepEqual(row, { shift_id: shift.id, cashier_name: 'Karim' })
    assert.equal(db.prepare('SELECT shift_id FROM order_payments WHERE order_id = ?').get(during.orderId).shift_id, shift.id)

    shifts.closeShift(db, { counted_cash: 6000 }, NOW)
    assert.equal(tryOrder(service).code, 'no_open_shift')
    assert.throws(() => shifts.openShift(db, { opening_float: 0 }, NOW), /cashier name is required/)
  } finally { cleanup() }
})

test('pay-in / pay-out need an open shift, a positive amount and a reason', () => {
  const { db, cleanup } = freshDb()
  try {
    assert.throws(() => shifts.addCashMovement(db, { kind: 'pay_out', amount: 200, reason: 'bread' }, NOW), /NO_OPEN_SHIFT/)
    shifts.openShift(db, { cashier_name: 'Karim', opening_float: 0 }, NOW)
    assert.throws(() => shifts.addCashMovement(db, { kind: 'pay_out', amount: 200, reason: '  ' }, NOW), /reason is required/)
    assert.throws(() => shifts.addCashMovement(db, { kind: 'pay_out', amount: -5, reason: 'x' }, NOW), /whole number/)
    const movement = shifts.addCashMovement(db, { kind: 'pay_out', amount: 200, reason: 'Bought bread' }, NOW)
    assert.deepEqual([movement.kind, movement.amount, movement.reason, movement.operator], ['pay_out', 200, 'Bought bread', 'Karim'])
  } finally { cleanup() }
})

test('X / Z report: expected cash = float + cash sales − refunds + pay-ins − pay-outs; blind count; snapshot', () => {
  const { db, cleanup } = freshDb()
  try {
    seedMenu(db)
    setSetting(db, 'language', 'fr')
    const service = createOrderService({ db, now: fixedNow })
    const shift = shifts.openShift(db, { cashier_name: 'Karim', opening_float: 5000 }, NOW)

    const a = order(service, { payments: [{ method: 'cash', tendered: 2000 }] }) // 1000 cash, change 1000
    const b = order(service, { lines: [{ menuItemId: 2, quantity: 1 }, { menuItemId: 1, quantity: 1 }], payments: [{ method: 'cib' }] }) // 800
    const c = order(service, { lines: [{ menuItemId: 3, quantity: 2 }], payments: [{ method: 'cash' }] }) // 300, cancelled below
    order(service, { lines: [{ menuItemId: 1, quantity: 1 }], explicitDiscountAmount: 100, operator: 'Nadia' }) // 400 auto cash
    const e = order(service, { lines: [{ menuItemId: 1, quantity: 1 }, { menuItemId: 2, quantity: 1 }] }) // 800 auto cash
    const burgerLine = db.prepare('SELECT id FROM order_items WHERE order_id = ? AND menu_item_id = 1').get(e.orderId)
    assert.equal(service.updateOrderLines({ orderId: e.orderId, lines: [{ orderItemId: burgerLine.id, menuItemId: 1, quantity: 1 }] }).ok, true)
    assert.equal(service.updateOrderStatus(c.orderId, 'cancelled', { operator: 'Karim', reason: 'wrong order' }).ok, true)
    shifts.addCashMovement(db, { kind: 'pay_in', amount: 300, reason: 'Float top-up' }, NOW)
    shifts.addCashMovement(db, { kind: 'pay_out', amount: 200, reason: 'Bought bread' }, NOW)

    const x = shifts.currentShiftReport(db, NOW)
    assert.equal(x.kind, 'X')
    assert.equal(x.blind, true)
    assert.equal(x.cash.expected, null, 'blind count hides the expected cash')
    assert.equal(shifts.currentShiftReport(db, NOW, true).cash.expected, 7000)

    setSetting(db, 'shift_blind_close', 'false')
    const open = shifts.currentShiftReport(db, NOW)
    assert.equal(open.cash.expected, 7000)
    assert.deepEqual(open.orders, {
      count: 4, gross_sales: 2800, discounts: 100, delivery_fees: 0, net_sales: 2700, average_ticket: 675,
      by_type: { local: { count: 0, total: 0 }, takeout: { count: 4, total: 2700 }, delivery: { count: 0, total: 0 } }
    })
    const cash = open.payments.find((p) => p.method === 'cash')
    assert.deepEqual([cash.label, cash.count, cash.amount, cash.refunds, cash.net], ['Espèces', 4, 2500, -600, 1900])
    assert.deepEqual(open.payments.find((p) => p.method === 'cib').net, 800)
    assert.deepEqual([open.cash.cash_sales, open.cash.cash_refunds, open.cash.pay_ins, open.cash.pay_outs, open.cash.change_given], [2500, -600, 300, 200, 1000])
    assert.deepEqual(open.cancellations.list.map((row) => [row.daily_number, row.total, row.by, row.reason]), [[3, 300, 'Karim', 'wrong order']])
    assert.deepEqual([open.voids.count, open.voids.amount, open.voids.list[0].item_name, open.voids.list[0].by], [1, 300, 'Fries', 'Karim'])
    assert.deepEqual(open.discounts.by_cashier, [{ cashier: 'Nadia', count: 1, amount: 100 }])
    assert.deepEqual(open.categories, [{ name: 'Plats', quantity: 6, revenue: 2800 }])
    assert.equal(open.top_items[0].name, 'Burger')

    const closed = shifts.closeShift(db, { denominations: { n2000: 3, n500: 1, c200: 2, c50: 1 }, closed_by: 'Karim' }, NOW)
    assert.equal(closed.shift.status, 'closed')
    assert.deepEqual([closed.report.kind, closed.report.cash.expected, closed.report.cash.counted, closed.report.cash.over_short], ['Z', 7000, 6950, -50])
    assert.deepEqual([closed.shift.expected_cash, closed.shift.counted_cash, closed.shift.over_short], [7000, 6950, -50])
    const outbox = rows(db, "SELECT payload FROM outbox_events WHERE event_type = 'telegram' AND payload LIKE '%shift-report%'")
    assert.deepEqual(outbox.map((row) => JSON.parse(row.payload)), [{ kind: 'shift-report', shiftId: shift.id }])

    // The Z report is a snapshot: a later cancellation (no shift open) does not rewrite it.
    assert.equal(service.updateOrderStatus(b.orderId, 'cancelled').ok, true)
    const stored = shifts.shiftReport(db, shift.id, NOW)
    assert.deepEqual([stored.kind, stored.orders.net_sales, stored.cash.expected], ['Z', 2700, 7000])
    assert.equal(a.total, 1000)
  } finally { cleanup() }
})

test('closing requires a count; telegram_shift_report=false queues no summary; restore after close stays out of the Z', () => {
  const { db, cleanup } = freshDb()
  try {
    seedMenu(db)
    setSetting(db, 'telegram_shift_report', 'false')
    shifts.openShift(db, { cashier_name: 'Karim', opening_float: 1000 }, NOW)
    assert.throws(() => shifts.closeShift(db, {}, NOW), /Counted cash/)
    assert.throws(() => shifts.closeShift(db, { denominations: { n3000: 1 } }, NOW), /Unknown denomination/)
    const { report } = shifts.closeShift(db, { counted_cash: 1000 }, NOW)
    assert.equal(report.cash.over_short, 0)
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM outbox_events WHERE payload LIKE '%shift-report%'").get().n, 0)
    assert.equal(shifts.listShifts(db).length, 1)
  } finally { cleanup() }
})
