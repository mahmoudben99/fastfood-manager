// v4 catalog — combos: definitions, pricing, children routing/stock/allocation, edits, tickets,
// analytics and the tablet HTTP API.
// Run: ELECTRON_RUN_AS_NODE=1 node_modules/electron/dist/electron.exe --no-warnings --test <this file>
import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import {
  analyticsRepo, cleanup, createCombosService, createOrderService, createSoldOutService, freshDb, load, near,
  ordersRepo, printDocuments, requestId, seedCatalog, seedStationPrinters, stock
} from './catalog-harness.mjs'

const { allocateComboRevenue } = await load('src/main/services/order-catalog-effects.ts')

after(cleanup)

const pos = (lines) => ({ source: 'pos', sourceRequestId: requestId(), orderType: 'local', lines, applyAutoPromotions: false })
const rows = (db, orderId) => db.prepare('SELECT * FROM order_items WHERE order_id = ? ORDER BY id').all(orderId)
const settings = { language: 'en', restaurant_name: 'Test', currency_symbol: 'DA' }

/** Menu Maxi (800): Burger slot, Side slot (Fries default, Large Fries +100, or any Side), Drink slot (Cola default, any Drink). */
function seedCombo(db) {
  const ids = seedCatalog(db)
  const combo = createCombosService(db).save(10, { slots: [
    { name: 'Burger', choices: [{ menu_item_id: 1, is_default: true }] },
    { name: 'Side', choices: [{ menu_item_id: 3, is_default: true }, { menu_item_id: 4, upcharge: 100 }, { category_id: 3 }] },
    { name: 'Drink', name_fr: 'Boisson', choices: [{ menu_item_id: 2, is_default: true }, { category_id: 2 }] }
  ] })
  const [burger, side, drink] = combo.slots.map((slot) => slot.id)
  return { ...ids, combo, slot: { burger, side, drink } }
}

const maxi = (ids, extra = {}) => ({
  menuItemId: 10,
  quantity: 1,
  children: [
    { slot_id: ids.slot.burger, menu_item_id: 1, modifiers: [{ option_id: ids.ketchup.id }, { option_id: ids.cheese.id }] },
    { slot_id: ids.slot.side, menu_item_id: 4 },
    { slot_id: ids.slot.drink, menu_item_id: 2 }
  ],
  ...extra
})

test('definitions: validation, stable slot ids, order-screen view with expanded categories and sold-out flags', () => {
  const db = freshDb()
  const ids = seedCombo(db)
  const combos = createCombosService(db)
  assert.throws(() => combos.save(10, { slots: [] }), /at least one part/)
  assert.throws(() => combos.save(10, { slots: [{ name: 'Side', choices: [{ category_id: 3, is_default: true }] }] }), /one item, not a whole category/)
  assert.throws(() => combos.save(10, { slots: [{ name: 'Self', choices: [{ menu_item_id: 10 }] }] }), /cannot contain a combo/)
  assert.throws(() => combos.save(10, { slots: [{ name: 'Two', choices: [{ menu_item_id: 1, is_default: true }, { menu_item_id: 3, is_default: true }] }] }), /more default choices/)
  assert.throws(() => combos.save(10, { slots: [{ name: 'Bad', choices: [{ menu_item_id: 1, upcharge: -5 }] }] }), /Upcharge/)
  assert.throws(() => combos.save(1, { slots: [{ name: 'X', choices: [{ menu_item_id: 3 }] }] }), /cannot contain a combo/, 'Burger is already a choice of Menu Maxi')
  assert.throws(() => combos.save(10, { slots: [{ name: 'Empty', choices: [] }] }), /needs at least one choice/)

  const again = combos.save(10, { slots: ids.combo.slots.map((slot) => ({ ...slot, choices: slot.choices })) })
  assert.deepEqual(again.slots.map((slot) => slot.id), ids.combo.slots.map((slot) => slot.id), 'slot ids kept')
  assert.equal(combos.list().length, 1)

  createSoldOutService(db).set(5, true)
  const view = combos.getForMenuItem(10)
  assert.equal(view.price, 800)
  const side = view.slots[1]
  assert.deepEqual(side.choices.map((c) => [c.name, c.upcharge, c.is_default]), [['Fries', 0, true], ['Large Fries', 100, false]])
  assert.deepEqual(view.slots[2].choices.map((c) => [c.name, c.sold_out]), [['Cola', false], ['Orange Juice', true]])
  assert.equal(view.slots[0].choices[0].has_modifiers, true)
  assert.equal(combos.getForMenuItem(1), null, 'not a combo')
  assert.equal(combos.remove(10), true)
  assert.equal(combos.get(10), null)
})

test('order: parent + children, prices, routing, stock, allocation (upcharges stay with their child)', () => {
  const db = freshDb()
  const ids = seedCombo(db)
  seedStationPrinters(db)
  const created = createOrderService({ db }).createOrder(pos([maxi(ids)]))
  assert.equal(created.ok, true, created.message)
  assert.equal(created.subtotal, 800 + 100 + 50)
  const [parent, burger, fries, cola] = rows(db, created.orderId)
  assert.deepEqual([parent.line_kind, parent.worker_id, parent.unit_price, parent.total_price], ['combo', null, 950, 950])
  assert.deepEqual([burger, fries, cola].map((r) => [r.line_kind, r.parent_order_item_id, r.unit_price, r.worker_id]), [
    ['combo_child', parent.id, 0, 1], ['combo_child', parent.id, 0, 3], ['combo_child', parent.id, 0, 2]
  ])
  assert.equal(fries.combo_upcharge, 100)
  assert.deepEqual([burger, fries, cola].map((r) => r.allocated_revenue), [550, 300, 100])
  near(stock(db, 1), 100 - 0.15, 'beef')
  near(stock(db, 2), 99, 'child option: cheese')
  near(stock(db, 4), 50 - 0.3, 'large fries potato')
  near(stock(db, 5), 99, 'cola can')

  const jobs = db.prepare("SELECT scope, worker_id, printer_name FROM print_jobs WHERE order_id = ? AND event_type = 'new' ORDER BY printer_name").all(created.orderId)
  assert.deepEqual(jobs.map((j) => j.printer_name), ['BAR', 'FRYER', 'GRILL'])
  assert.ok(!jobs.some((j) => j.scope === 'unassigned'), 'the combo parent never produces a ticket')

  const items = ordersRepo.getById(created.orderId).items
  assert.deepEqual(items.map((i) => i.combo_name ?? null), [null, 'Menu Maxi', 'Menu Maxi', 'Menu Maxi'])
  assert.deepEqual(items[1].modifiers.map((m) => m.name), ['Ketchup', 'Cheese'])

  assert.deepEqual(allocateComboRevenue(100, [{ weight: 1, own: 0 }, { weight: 1, own: 0 }, { weight: 1, own: 0 }]), [33.34, 33.33, 33.33])
  assert.deepEqual(allocateComboRevenue(50, [{ weight: 0, own: 80 }, { weight: 0, own: 20 }]), [40, 10], 'override below the extras')
})

test('defaults and validation: omitted picks use defaults; slot min/max, foreign choice, sold out', () => {
  const db = freshDb()
  const ids = seedCombo(db)
  const service = createOrderService({ db })
  const defaults = service.createOrder(pos([{ menuItemId: 10, quantity: 2 }]))
  assert.equal(defaults.ok, true, defaults.message)
  assert.equal(defaults.subtotal, 1600)
  const children = ordersRepo.getById(defaults.orderId).items.slice(1)
  assert.deepEqual(children.map((c) => [c.menu_item_name, c.quantity]), [['Burger', 2], ['Fries', 2], ['Cola', 2]])
  assert.deepEqual(children[0].modifiers.map((m) => m.name), ['Ketchup'], 'child default options')

  const fail = (children, pattern, code = 'invalid_input') => {
    const result = service.createOrder(pos([{ menuItemId: 10, quantity: 1, children }]))
    assert.equal(result.ok, false)
    assert.equal(result.code, code)
    assert.match(result.message, pattern)
  }
  const burger = { slot_id: ids.slot.burger, menu_item_id: 1 }
  const fries = { slot_id: ids.slot.side, menu_item_id: 3 }
  fail([burger, fries], /at least 1 for "Drink"/)
  fail([burger, burger, fries, { slot_id: ids.slot.drink, menu_item_id: 2 }], /at most 1 for "Burger"/)
  fail([{ slot_id: ids.slot.burger, menu_item_id: 2 }, fries, { slot_id: ids.slot.drink, menu_item_id: 2 }], /"Cola" cannot be chosen for "Burger"/)
  fail([burger, fries, { slot_id: 9999, menu_item_id: 2 }], /does not match any part/)
  createSoldOutService(db).set(5, true)
  fail([burger, fries, { slot_id: ids.slot.drink, menu_item_id: 5 }], /"Orange Juice" is sold out/, 'inactive_item')
  createSoldOutService(db).set(10, true)
  fail(undefined, /"Menu Maxi" is sold out/, 'inactive_item')
})

test('edits: quantity, changed picks, legacy clients resending child rows, removal, cancel/restore', () => {
  const db = freshDb()
  const ids = seedCombo(db)
  seedStationPrinters(db)
  const service = createOrderService({ db })
  const created = service.createOrder(pos([maxi(ids)]))
  const parentId = rows(db, created.orderId)[0].id

  let edited = service.updateOrderLines({ orderId: created.orderId, lines: [{ orderItemId: parentId, menuItemId: 10, quantity: 2 }] })
  assert.equal(edited.ok, true, edited.message)
  assert.equal(edited.subtotal, 1900)
  let [, burger, fries, cola] = rows(db, created.orderId)
  assert.deepEqual([burger.quantity, fries.quantity, cola.quantity], [2, 2, 2])
  assert.deepEqual([burger, fries, cola].map((r) => r.allocated_revenue), [1100, 600, 200])
  near(stock(db, 1), 100 - 0.3)
  near(stock(db, 2), 98, 'child option scaled')
  near(stock(db, 5), 98)

  // Swap the drink: Cola -> Orange Juice (same price, other stock, other ticket content).
  const before = db.prepare("SELECT COUNT(*) AS n FROM print_jobs WHERE order_id = ? AND event_type = 'updated'").get(created.orderId).n
  edited = service.updateOrderLines({ orderId: created.orderId, lines: [{
    orderItemId: parentId, menuItemId: 10, quantity: 2,
    children: [...maxi(ids).children.slice(0, 2), { slot_id: ids.slot.drink, menu_item_id: 5 }]
  }] })
  assert.equal(edited.ok, true, edited.message)
  assert.equal(edited.subtotal, 1900)
  near(stock(db, 5), 100, 'cola given back')
  near(stock(db, 7), 96, 'orange: 2 per juice × 2')
  near(stock(db, 2), 98, 'unchanged burger options kept (re-created at the same amount)')
  const updated = db.prepare("SELECT printer_name, detail FROM print_jobs WHERE order_id = ? AND event_type = 'updated' ORDER BY id").all(created.orderId).slice(before)
  assert.deepEqual(updated.map((j) => j.printer_name), ['BAR'], 'only the drink station hears about the swap')
  assert.deepEqual(JSON.parse(updated[0].detail).changes.map((c) => [c.kind, c.menuItemId]), [['removed', 2], ['added', 5]])
  const children = rows(db, created.orderId).slice(1)
  near(children.reduce((sum, row) => sum + row.allocated_revenue, 0), 1900, 'allocation sums to the line total')
  assert.ok(children.find((row) => row.menu_item_id === 4).allocated_revenue >= 200, 'upcharge stays with Large Fries')

  // A legacy client resends every row (children included) with their prices: nothing changes.
  const all = ordersRepo.getById(created.orderId).items
  edited = service.updateOrderLines({ orderId: created.orderId, lines: all.map((item) => ({
    orderItemId: item.id, menuItemId: item.menu_item_id, quantity: item.quantity, unitPriceOverride: item.unit_price
  })) })
  assert.equal(edited.ok, true, edited.message)
  assert.equal(edited.subtotal, 1900)
  assert.equal(rows(db, created.orderId).length, 4)

  // Cancel gives everything back; restore takes it again.
  assert.equal(service.updateOrderStatus(created.orderId, 'cancelled').ok, true)
  near(stock(db, 1), 100)
  near(stock(db, 7), 100)
  near(stock(db, 2), 100)
  assert.equal(service.updateOrderStatus(created.orderId, 'preparing').ok, true)
  near(stock(db, 7), 96)

  // Replace the combo by a Cola: every child is removed and its stock restored.
  edited = service.updateOrderLines({ orderId: created.orderId, lines: [{ menuItemId: 2, quantity: 1 }] })
  assert.equal(edited.ok, true, edited.message)
  assert.equal(edited.subtotal, 100)
  assert.equal(rows(db, created.orderId).length, 1)
  near(stock(db, 1), 100)
  near(stock(db, 2), 100)
  near(stock(db, 4), 50)
  near(stock(db, 7), 100)
  near(stock(db, 5), 99)
  assert.deepEqual(db.pragma('foreign_key_check'), [])
})

test('tickets and receipts: combo with its choices; kitchen shows children with COMBO context', async () => {
  const db = freshDb()
  const ids = seedCombo(db)
  const created = createOrderService({ db }).createOrder(pos([maxi(ids)]))
  const order = ordersRepo.getById(created.orderId)
  const receipt = printDocuments.buildDefaultReceiptHTML(order, settings, { logoDataUrl: null, paperWidth: '80', receiptFontSize: null })
  assert.match(receipt, /1x Menu Maxi/)
  assert.match(receipt, /· Large Fries<\/span><span>\+100\.00/)
  assert.match(receipt, /- EXTRA Cheese<\/span><span>\+50\.00/)
  assert.doesNotMatch(receipt, /1x Burger/, 'children are not separate receipt rows')
  assert.match(receipt, /950\.00 DA/)

  const grill = order.items.filter((item) => item.worker_id === 1)
  const ticket = printDocuments.buildKitchenHTML(order, grill, settings, {
    paperWidth: '80', kitchenFontSize: null, eventType: 'new', workerName: 'Grill', changes: [], removedNames: {}
  })
  assert.match(ticket, /COMBO: MENU MAXI/)
  assert.match(ticket, /item-name">Burger</)
  assert.match(ticket, /EXTRA CHEESE/)
  const full = printDocuments.buildKitchenHTML(order, order.items, settings, {
    paperWidth: '80', kitchenFontSize: null, eventType: 'new', workerName: null, changes: [], removedNames: {}
  })
  assert.doesNotMatch(full, /item-name">Menu Maxi</, 'the combo parent is not a cookable line')
  assert.equal((full.match(/COMBO: MENU MAXI/g) || []).length, 1)
})

test('analytics: combo children count as item sales at their allocated revenue', () => {
  const db = freshDb()
  const ids = seedCombo(db)
  const created = createOrderService({ db }).createOrder(pos([maxi(ids), { menuItemId: 2, quantity: 1 }]))
  const day = created.orderDate
  const top = analyticsRepo.getTopSellingItems(day, day, 10)
  const byName = Object.fromEntries(top.map((row) => [row.name, row]))
  assert.equal(byName['Menu Maxi'], undefined)
  assert.equal(byName.Cola.total_quantity, 2)
  assert.equal(byName.Cola.total_revenue, 200)
  assert.equal(byName.Burger.total_revenue, 550)
  assert.equal(byName['Large Fries'].total_revenue, 300)
  near(top.reduce((sum, row) => sum + row.total_revenue, 0), created.total)
  near(analyticsRepo.getRevenueByCategory(day, day).reduce((sum, row) => sum + row.total_revenue, 0), created.total)
  const grill = analyticsRepo.getWorkerPerformance(day, day).find((row) => row.name === 'Grill')
  assert.equal(grill.total_revenue, 550)
  assert.equal(analyticsRepo.getProfitSummary(day, day).total_revenue, created.total)
})

test('tablet HTTP API: combos + options accepted, client prices ignored, duplicate retry recognised', async () => {
  const db = freshDb()
  const ids = seedCombo(db)
  const server = await load('src/main/tablet/server.ts')
  const { port } = await server.startTabletServer({ webContents: { send() {} } })
  try {
    const body = {
      source_request_id: requestId(),
      order_type: 'takeout',
      items: [
        { ...maxi(ids), menu_item_id: 10, unit_price: 1, total_price: 1, children: maxi(ids).children.map((c) => ({ ...c, price: 0, upcharge: -100 })) },
        { menu_item_id: 1, quantity: 1, unit_price: 1, modifiers: [{ option_id: ids.algerian.id, price_delta: -500 }] }
      ]
    }
    const post = () => fetch(`http://127.0.0.1:${port}/api/order`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const response = await post()
    const json = await response.json()
    assert.equal(response.status, 200, JSON.stringify(json))
    const order = ordersRepo.getById(json.id)
    assert.equal(order.source, 'tablet')
    assert.equal(order.subtotal, 950 + 520)
    assert.equal(order.items.filter((item) => item.parent_order_item_id != null).length, 3)
    const retry = await post()
    const retried = await retry.json()
    assert.equal(retry.status, 200, JSON.stringify(retried))
    assert.equal(retried.duplicate, true)
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM orders').get().n, 1)
  } finally {
    await server.stopTabletServer()
  }
})
