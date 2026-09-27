// v4 delivery: zone fee in totals (create + edit), address book, driver, timeline, settlement.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createOrderService, delivery, fixedNow, freshDb, NOW, order, payments, seedDriver, seedMenu, settlement, shifts, tryOrder
} from './cash-test-helpers.mjs'

/** Migration 026 adds customers.consent_at; add it here when this branch runs without 026. */
function ensureConsentColumn(db) {
  const has = db.prepare("SELECT 1 FROM pragma_table_info('customers') WHERE name = 'consent_at'").get()
  if (!has) db.exec('ALTER TABLE customers ADD COLUMN consent_at TEXT; ALTER TABLE customers ADD COLUMN consent_version TEXT')
}

/** A customer who agreed to keep their data (law 18-07), as the order screen records it. */
function consentingCustomer(db, phone, normalized, name = null) {
  ensureConsentColumn(db)
  db.prepare(`INSERT INTO customers (phone, phone_normalized, name, total_spent, order_count, consent_at, consent_version)
              VALUES (?, ?, ?, 0, 0, ?, 'test')`).run(phone, normalized, name, NOW.toISOString())
}

function seedZones(db) {
  const center = delivery.saveZone(db, { name: 'Centre-ville', fee: 150, min_order: 800, estimated_minutes: 25 })
  const far = delivery.saveZone(db, { name: 'Bab Ezzouar', fee: 300 })
  return { center, far }
}

test('delivery fee is added to the total; zone snapshot, minimum order, address required', () => {
  const { db, cleanup } = freshDb()
  try {
    seedMenu(db)
    const { center } = seedZones(db)
    consentingCustomer(db, '0550 12 34 56', '+213550123456', 'Amine')
    const service = createOrderService({ db, now: fixedNow })
    const created = order(service, {
      orderType: 'delivery',
      customer: { phone: '0550 12 34 56', name: 'Amine' },
      delivery: { address: 'Cité 200 logements, bloc B', zoneId: center.id, saveAddress: true, notes: 'Ring twice' },
      payments: []
    })
    assert.deepEqual([created.subtotal, created.deliveryFee, created.total], [1000, 150, 1150])
    const row = delivery.getOrderDelivery(db, created.orderId)
    assert.deepEqual([row.zone_name, row.estimated_minutes, row.status, row.notes], ['Centre-ville', 25, 'pending', 'Ring twice'])
    assert.equal(db.prepare('SELECT total_spent FROM customers').get().total_spent, 1150)
    const book = delivery.listAddressesByPhone(db, '0550123456')
    assert.deepEqual(book.map((a) => [a.address, a.zone_id]), [['Cité 200 logements, bloc B', center.id]])

    const small = tryOrder(service, { orderType: 'delivery', lines: [{ menuItemId: 3, quantity: 1 }], delivery: { address: 'x', zoneId: center.id } })
    assert.equal(small.ok, false)
    assert.match(small.message, /^BELOW_MIN_ORDER:/)
    const forced = order(service, {
      orderType: 'delivery', lines: [{ menuItemId: 3, quantity: 1 }],
      delivery: { address: 'x', zoneId: center.id, ignoreMinOrder: true }
    })
    assert.equal(forced.total, 300)
    const noAddress = tryOrder(service, { orderType: 'delivery', delivery: { zoneId: center.id } })
    assert.match(noAddress.message, /address is required/)
    const saved = order(service, { orderType: 'delivery', delivery: { addressId: book[0].id } })
    assert.equal(saved.deliveryFee, 150, 'zone comes from the saved address')
    const override = order(service, { orderType: 'delivery', delivery: { address: 'y', zoneId: center.id, fee: 0 } })
    assert.equal(override.total, 1000)
    const plain = order(service, { orderType: 'delivery' })
    assert.deepEqual([plain.deliveryFee, delivery.getOrderDelivery(db, plain.orderId)], [0, null])
  } finally { cleanup() }
})

test('edits keep the fee, re-price on a zone change, drop it when the order stops being a delivery', () => {
  const { db, cleanup } = freshDb()
  try {
    seedMenu(db)
    const { center, far } = seedZones(db)
    const service = createOrderService({ db, now: fixedNow })
    const created = order(service, {
      orderType: 'delivery', customer: { phone: '0661000000' }, delivery: { address: 'Rue 1', zoneId: center.id }
    })
    const line = db.prepare('SELECT id FROM order_items WHERE order_id = ?').get(created.orderId)
    const lines = (quantity) => [{ orderItemId: line.id, menuItemId: 1, quantity }]

    let edited = service.updateOrderLines({ orderId: created.orderId, lines: lines(3) })
    assert.deepEqual([edited.subtotal, edited.deliveryFee, edited.total], [1500, 150, 1650])
    edited = service.updateOrderLines({ orderId: created.orderId, lines: lines(3), delivery: { zoneId: far.id } })
    assert.deepEqual([edited.deliveryFee, edited.total], [300, 1800])
    assert.equal(delivery.getOrderDelivery(db, created.orderId).address, 'Rue 1', 'patch keeps the address')

    const header = service.updateOrderHeader({ orderId: created.orderId, delivery: { fee: 250 } })
    assert.deepEqual([header.ok, header.deliveryFee, header.total], [true, 250, 1750])
    assert.equal(db.prepare('SELECT total_spent FROM customers').get().total_spent, 1750, 'loyalty follows the fee')
    assert.equal(payments.paymentSummary(db, created.orderId).paid, 1750, 'auto-settled order follows the fee')

    edited = service.updateOrderLines({ orderId: created.orderId, lines: lines(3), header: { orderType: 'takeout' } })
    assert.deepEqual([edited.deliveryFee, edited.total], [0, 1500])
    assert.equal(delivery.getOrderDelivery(db, created.orderId), null)

    edited = service.updateOrderLines({
      orderId: created.orderId, lines: lines(3), header: { orderType: 'delivery' }, delivery: { address: 'Rue 2', zoneId: far.id }
    })
    assert.deepEqual([edited.deliveryFee, edited.total], [300, 1800])

    service.updateOrderStatus(created.orderId, 'completed')
    const refused = service.updateOrderHeader({ orderId: created.orderId, delivery: { fee: 0 } })
    assert.deepEqual([refused.ok, refused.code], [false, 'not_allowed'])
  } finally { cleanup() }
})

test('driver assignment needs the driver role; status timeline is stamped and validated', () => {
  const { db, cleanup } = freshDb()
  try {
    seedMenu(db)
    const driver = seedDriver(db)
    db.exec(`INSERT INTO workers (id, name, role, pay_full_day, pay_half_day) VALUES (8, 'Cook', 'cook', 0, 0)`)
    const service = createOrderService({ db, now: fixedNow })
    const created = order(service, { orderType: 'delivery', delivery: { address: 'Rue 3' }, payments: [] })
    assert.throws(() => delivery.assignDriver(db, created.orderId, 8, NOW), /driver role/)
    assert.equal(delivery.assignDriver(db, created.orderId, driver, NOW).driver_name, 'Yacine')
    assert.deepEqual(delivery.listDrivers(db).map((d) => d.name), ['Yacine'])
    assert.throws(() => delivery.setDeliveryStatus(db, created.orderId, 'delivered', {}, NOW), /cannot move from pending to delivered/)
    delivery.setDeliveryStatus(db, created.orderId, 'preparing', {}, NOW)
    const out = delivery.setDeliveryStatus(db, created.orderId, 'out_for_delivery', {}, new Date('2026-09-27T10:20:00Z'))
    assert.equal(out.out_for_delivery_at, '2026-09-27T10:20:00.000Z')
    const failed = delivery.setDeliveryStatus(db, created.orderId, 'failed', { reason: 'No answer' }, NOW)
    assert.deepEqual([failed.status, failed.failure_reason], ['failed', 'No answer'])
    delivery.setDeliveryStatus(db, created.orderId, 'out_for_delivery', {}, NOW)
    const done = delivery.setDeliveryStatus(db, created.orderId, 'delivered', {}, NOW)
    assert.equal(done.delivered_at, NOW.toISOString())
    const listed = delivery.listDeliveries(db, { date: '2026-09-27' })
    assert.deepEqual([listed[0].status, listed[0].balance_due, listed[0].driver_name], ['delivered', 1000, 'Yacine'])

    const takeout = order(service)
    assert.throws(() => delivery.assignDriver(db, takeout.orderId, driver, NOW), /not a delivery/)
  } finally { cleanup() }
})

test('driver settlement: expected COD vs collected, payments in the shift, drawer counts the difference', () => {
  const { db, cleanup } = freshDb()
  try {
    seedMenu(db)
    const driver = seedDriver(db)
    const { far } = seedZones(db)
    const shift = shifts.openShift(db, { cashier_name: 'Karim', opening_float: 0 }, NOW)
    const service = createOrderService({ db, now: fixedNow })
    const cod1 = order(service, { orderType: 'delivery', delivery: { address: 'A', zoneId: far.id, driverId: driver }, payments: [] }) // 1300
    const cod2 = order(service, { orderType: 'delivery', lines: [{ menuItemId: 2, quantity: 1 }], delivery: { address: 'B', driverId: driver }, payments: [] }) // 300
    const prepaid = order(service, { orderType: 'delivery', delivery: { address: 'C', driverId: driver }, payments: [{ method: 'baridipay' }] })
    const stillOut = order(service, { orderType: 'delivery', delivery: { address: 'D', driverId: driver }, payments: [] })
    for (const id of [cod1.orderId, cod2.orderId, prepaid.orderId, stillOut.orderId]) {
      delivery.setDeliveryStatus(db, id, 'out_for_delivery', {}, NOW)
    }
    for (const id of [cod1.orderId, cod2.orderId, prepaid.orderId]) delivery.setDeliveryStatus(db, id, 'delivered', {}, NOW)

    const preview = settlement.driverSettlementPreview(db, driver)
    assert.deepEqual([preview.expectedCash, preview.orders.length, preview.outForDelivery, preview.deliveryFees], [1600, 3, 1, 300])
    const settled = settlement.settleDriver(db, { driver_id: driver, collected_cash: 1500, note: 'short 100' }, NOW)
    assert.deepEqual([settled.expected_cash, settled.collected_cash, settled.difference, settled.shift_id], [1600, 1500, -100, shift.id])
    for (const id of [cod1.orderId, cod2.orderId]) {
      const summary = payments.paymentSummary(db, id)
      assert.equal(summary.status, 'paid')
      assert.equal(summary.payments.at(-1).driver_id, driver)
    }
    assert.throws(() => settlement.settleDriver(db, { driver_id: driver, collected_cash: 0 }, NOW), /no delivered order/)
    assert.throws(() => delivery.setDeliveryStatus(db, cod1.orderId, 'out_for_delivery', {}, NOW), /already settled/)

    const report = shifts.closeShift(db, { counted_cash: 1500 }, NOW).report
    assert.deepEqual([report.cash.cash_sales, report.cash.driver_differences, report.cash.expected, report.cash.over_short], [1600, -100, 1500, 0])
    assert.deepEqual(report.driver_settlements, [{ driver_name: 'Yacine', expected: 1600, collected: 1500, difference: -100 }])
    assert.equal(report.unpaid.count, 1, 'the order still out for delivery is unpaid')
  } finally { cleanup() }
})

test('law 18-07: without recorded consent the address stays on the order only; the address book refuses it', () => {
  const { db, cleanup } = freshDb()
  try {
    seedMenu(db)
    ensureConsentColumn(db)
    const { center } = seedZones(db)
    const service = createOrderService({ db, now: fixedNow })
    const first = order(service, {
      orderType: 'delivery', customer: { phone: '0661 22 33 44', name: 'Samia' },
      delivery: { address: 'Rue des Frères, bloc 3', zoneId: center.id, saveAddress: true }
    })
    assert.equal(delivery.getOrderDelivery(db, first.orderId).address, 'Rue des Frères, bloc 3', 'the order keeps its address')
    assert.deepEqual(delivery.listAddressesByPhone(db, '0661223344'), [], 'nothing stored without consent')
    assert.throws(() => delivery.saveAddress(db, { customer_phone: '0661 22 33 44', address: 'Rue des Frères, bloc 3' }), /CONSENT_REQUIRED:/)
    assert.throws(() => delivery.saveAddress(db, { customer_phone: '0770 00 00 00', address: 'Somewhere' }), /CONSENT_REQUIRED:/)
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM customers WHERE phone_normalized = '+213770000000'").get().n, 0, 'a refused save creates no customer')

    db.prepare("UPDATE customers SET consent_at = ?, consent_version = 'test' WHERE phone_normalized = '+213661223344'").run(NOW.toISOString())
    order(service, {
      orderType: 'delivery', customer: { phone: '0661 22 33 44' },
      delivery: { address: 'Rue des Frères, bloc 3', zoneId: center.id, saveAddress: true }
    })
    const saved = delivery.saveAddress(db, { customer_phone: '0661 22 33 44', address: 'Bureau, Hydra', label: 'Work' })
    assert.deepEqual(delivery.listAddressesByPhone(db, '0661223344').map((a) => a.address).sort(), ['Bureau, Hydra', 'Rue des Frères, bloc 3'])
    assert.equal(saved.label, 'Work')
  } finally { cleanup() }
})
