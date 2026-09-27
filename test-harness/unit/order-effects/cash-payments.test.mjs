// v4 payments: split payments, change, cash rounding, pay later, refunds, auto-settled orders.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createOrderService, fixedNow, freshDb, NOW, order, paymentMethods, payments, rows, seedMenu, setSetting, tryOrder
} from './cash-test-helpers.mjs'

const ctx = { shiftId: null, now: NOW }

test('POS checkout without payment info is paid in cash in full (auto row, pre-v4 behaviour)', () => {
  const { db, cleanup } = freshDb()
  try {
    seedMenu(db)
    const created = order(createOrderService({ db, now: fixedNow }))
    const summary = payments.paymentSummary(db, created.orderId)
    assert.equal(summary.status, 'paid')
    assert.equal(summary.legacy, false)
    assert.deepEqual(summary.payments.map((p) => [p.method, p.amount, p.auto]), [['cash', 1000, 1]])
    assert.equal(db.prepare('SELECT payment_status FROM orders WHERE id = ?').get(created.orderId).payment_status, 'paid')
  } finally { cleanup() }
})

test('split payment: cash with tendered/change + CIB for the rest', () => {
  const { db, cleanup } = freshDb()
  try {
    seedMenu(db)
    const created = order(createOrderService({ db, now: fixedNow }), {
      payments: [{ method: 'cash', amount: 600, tendered: 1000 }, { method: 'cib', reference: 'TPE-889' }]
    })
    const summary = payments.paymentSummary(db, created.orderId)
    assert.equal(summary.status, 'paid')
    assert.equal(summary.balanceDue, 0)
    const [cash, card] = summary.payments
    assert.deepEqual([cash.method, cash.amount, cash.tendered, cash.change_given, cash.auto], ['cash', 600, 1000, 400, 0])
    assert.deepEqual([card.method, card.amount, card.reference, card.tendered], ['cib', 400, 'TPE-889', null])
  } finally { cleanup() }
})

test('invalid payments reject the whole order: over the balance, short tender, disabled method', () => {
  const { db, cleanup } = freshDb()
  try {
    seedMenu(db)
    const service = createOrderService({ db, now: fixedNow })
    const over = tryOrder(service, { payments: [{ method: 'cib', amount: 1500 }] })
    assert.equal(over.ok, false)
    assert.equal(over.code, 'invalid_input')
    const short = tryOrder(service, { payments: [{ method: 'cash', tendered: 900 }] })
    assert.equal(short.ok, false)
    assert.match(short.message, /less than the amount due/)
    paymentMethods.savePaymentMethods(db, [{ id: 'baridipay', enabled: false }])
    const disabled = tryOrder(service, { payments: [{ method: 'baridipay' }] })
    assert.equal(disabled.ok, false)
    assert.match(disabled.message, /not enabled/)
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM orders').get().n, 0, 'nothing persisted')
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM order_payments').get().n, 0)
  } finally { cleanup() }
})

test('cash rounding to 5 / 10 DA: rounding recorded, change from the rounded amount', () => {
  const { db, cleanup } = freshDb()
  try {
    seedMenu(db)
    db.prepare('UPDATE menu_items SET price = 1233 WHERE id = 1').run()
    setSetting(db, 'cash_rounding', '5')
    const service = createOrderService({ db, now: fixedNow })
    const a = order(service, { lines: [{ menuItemId: 1, quantity: 1 }], payments: [{ method: 'cash', tendered: 1300 }] })
    const cashA = payments.paymentSummary(db, a.orderId).payments[0]
    assert.deepEqual([cashA.amount, cashA.rounding, cashA.change_given], [1233, 2, 65])
    setSetting(db, 'cash_rounding', '10')
    const b = order(service, { lines: [{ menuItemId: 1, quantity: 1 }], payments: [{ method: 'cash', tendered: 2000 }] })
    const cashB = payments.paymentSummary(db, b.orderId).payments[0]
    assert.deepEqual([cashB.amount, cashB.rounding, cashB.change_given], [1233, -3, 770])
    assert.equal(payments.paymentSummary(db, b.orderId).status, 'paid', 'rounding never leaves a balance')
  } finally { cleanup() }
})

test('pay later: [] = unpaid, then partial, then paid; a cancelled order refuses payments', () => {
  const { db, cleanup } = freshDb()
  try {
    seedMenu(db)
    const service = createOrderService({ db, now: fixedNow })
    const created = order(service, { payments: [] })
    assert.equal(payments.paymentSummary(db, created.orderId).status, 'unpaid')
    payments.recordPayments(db, created.orderId, [{ method: 'baridipay', amount: 400 }], ctx)
    assert.equal(payments.paymentSummary(db, created.orderId).status, 'partial')
    const done = payments.recordPayments(db, created.orderId, [{ method: 'cash', tendered: 1000 }], ctx)
    assert.equal(done.status, 'paid')
    assert.equal(done.payments[1].change_given, 400)
    assert.throws(() => payments.recordPayments(db, created.orderId, [{ method: 'cash' }], ctx), /no balance left/)

    const other = order(service, { payments: [] })
    assert.equal(service.updateOrderStatus(other.orderId, 'cancelled').ok, true)
    assert.throws(() => payments.recordPayments(db, other.orderId, [{ method: 'cash' }], ctx), /cancelled/)
  } finally { cleanup() }
})

test('cancel refunds per method (rounding reversed); restoring an explicitly paid order leaves it owing', () => {
  const { db, cleanup } = freshDb()
  try {
    seedMenu(db)
    setSetting(db, 'cash_rounding', '5')
    db.prepare('UPDATE menu_items SET price = 612 WHERE id = 1').run()
    const service = createOrderService({ db, now: fixedNow })
    const created = order(service, { lines: [{ menuItemId: 1, quantity: 1 }], payments: [{ method: 'cash', amount: 300 }, { method: 'edahabia' }] })
    assert.equal(service.updateOrderStatus(created.orderId, 'cancelled', { operator: 'Samir', reason: 'Customer left' }).ok, true)
    const refunds = rows(db, "SELECT method, amount, rounding, auto FROM order_payments WHERE order_id = ? AND kind = 'refund' ORDER BY id", created.orderId)
    assert.deepEqual(refunds.map((r) => [r.method, r.amount, r.auto]), [['cash', -300, 1], ['edahabia', -312, 1]])
    assert.equal(payments.paymentSummary(db, created.orderId).status, 'void')
    assert.equal(service.updateOrderStatus(created.orderId, 'preparing').ok, true)
    const restored = payments.paymentSummary(db, created.orderId)
    assert.equal(restored.status, 'unpaid')
    assert.equal(restored.balanceDue, 612)
  } finally { cleanup() }
})

test('auto-settled order stays settled across an edit, a cancel and a restore', () => {
  const { db, cleanup } = freshDb()
  try {
    seedMenu(db)
    const service = createOrderService({ db, now: fixedNow })
    const created = order(service)
    const item = db.prepare('SELECT id FROM order_items WHERE order_id = ?').get(created.orderId)
    const edited = service.updateOrderLines({
      orderId: created.orderId,
      lines: [{ orderItemId: item.id, menuItemId: 1, quantity: 2 }, { menuItemId: 3, quantity: 1 }]
    })
    assert.equal(edited.ok, true)
    assert.equal(edited.total, 1150)
    let summary = payments.paymentSummary(db, created.orderId)
    assert.deepEqual([summary.status, summary.paid], ['paid', 1150])
    service.updateOrderStatus(created.orderId, 'cancelled')
    assert.equal(payments.paymentSummary(db, created.orderId).paid, 0)
    service.updateOrderStatus(created.orderId, 'preparing')
    summary = payments.paymentSummary(db, created.orderId)
    assert.deepEqual([summary.status, summary.paid], ['paid', 1150])
  } finally { cleanup() }
})

test('tablet orders default to unpaid; setting tablet_order_payment=cash pays them; remote is unpaid', () => {
  const { db, cleanup } = freshDb()
  try {
    seedMenu(db)
    const service = createOrderService({ db, now: fixedNow })
    const tablet = order(service, { source: 'tablet' })
    assert.equal(payments.paymentSummary(db, tablet.orderId).status, 'unpaid')
    setSetting(db, 'tablet_order_payment', 'cash')
    const tabletCash = order(service, { source: 'tablet' })
    assert.equal(payments.paymentSummary(db, tabletCash.orderId).status, 'paid')
    const remote = order(service, { source: 'remote' })
    assert.equal(payments.paymentSummary(db, remote.orderId).status, 'unpaid')
    assert.deepEqual(payments.listUnpaidOrders(db).map((o) => o.id).sort(), [tablet.orderId, remote.orderId].sort())
  } finally { cleanup() }
})

test('pre-v4 order (payment_status NULL, no rows) reads as paid cash; manual refund and sales by method', () => {
  const { db, cleanup } = freshDb()
  try {
    seedMenu(db)
    db.exec(`INSERT INTO orders (id, daily_number, order_date, order_type, status, subtotal, total, created_at)
             VALUES (50, 90, '2026-09-27', 'takeout', 'completed', 700, 700, '2026-09-27T08:00:00Z')`)
    const legacy = payments.paymentSummary(db, 50)
    assert.deepEqual([legacy.legacy, legacy.status, legacy.balanceDue], [true, 'paid', 0])
    const created = order(createOrderService({ db, now: fixedNow }), { payments: [{ method: 'cib' }] })
    assert.deepEqual(payments.salesByMethod(db, '2026-09-27', '2026-09-27').map((r) => [r.method, r.amount]).sort(),
      [['cash', 700], ['cib', 1000]])
    const refunded = payments.recordRefund(db, 50, { method: 'cash', amount: 200, reason: 'cold fries' }, ctx)
    // A refund handed back by hand settles that part of the order: 500 kept, nothing left to collect.
    assert.deepEqual([refunded.legacy, refunded.paid, refunded.balanceDue, refunded.status], [false, 500, 0, 'paid'])
    assert.equal(payments.listUnpaidOrders(db).find((o) => o.id === 50), undefined, 'a refunded order is not unpaid')
    assert.deepEqual(payments.salesByMethod(db, '2026-09-27', '2026-09-27').map((r) => [r.method, r.amount]).sort(),
      [['cash', 500], ['cib', 1000]], 'collected money is net of the refund')
    assert.throws(() => payments.recordRefund(db, created.orderId, { method: 'cash', amount: 1 }, ctx), /Only 0/)
  } finally { cleanup() }
})
