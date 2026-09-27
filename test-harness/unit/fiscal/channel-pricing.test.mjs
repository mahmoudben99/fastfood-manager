// v4 channels: per-channel prices, order channel resolution, interplay with options, combos,
// POS price overrides, edits and menu reads.
// Run: ELECTRON_RUN_AS_NODE=1 node_modules/electron/dist/electron.exe --no-warnings --test test-harness/unit/fiscal/*.test.mjs
import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import {
  cleanup, createCombosService, createOrderService, freshDb, load, menuRepo, requestId, seedCatalog
} from '../order-effects/catalog-harness.mjs'

const channels = await load('src/main/services/channels.ts')
const { verifyJournal } = await load('src/main/services/fiscal/verify.ts')

after(cleanup)

const NOW = new Date('2026-09-27T10:00:00Z')
const service = (db) => createOrderService({ db, now: () => NOW })
const create = (db, orderType, lines, extra = {}) =>
  service(db).createOrder({ source: 'pos', sourceRequestId: requestId(), orderType, lines, applyAutoPromotions: false, ...extra })
const lineRows = (db, orderId) => db.prepare('SELECT * FROM order_items WHERE order_id = ? ORDER BY id').all(orderId)

function seedCombo(db) {
  const ids = seedCatalog(db)
  const combo = createCombosService(db).save(10, { slots: [
    { name: 'Burger', choices: [{ menu_item_id: 1, is_default: true }] },
    { name: 'Side', choices: [{ menu_item_id: 3, is_default: true }, { menu_item_id: 4, upcharge: 100 }] },
    { name: 'Drink', choices: [{ menu_item_id: 2, is_default: true }] }
  ] })
  const [burger, side, drink] = combo.slots.map((slot) => slot.id)
  return { ...ids, slot: { burger, side, drink } }
}

test('channel prices: storage, validation, platform list', () => {
  const db = freshDb()
  seedCatalog(db)
  assert.deepEqual(channels.listChannels(db).map((c) => [c.id, c.orderType, c.enabled]), [
    ['local', 'local', true], ['takeout', 'takeout', true], ['delivery', 'delivery', true], ['yassir', 'delivery', true]
  ])
  assert.deepEqual(channels.setItemChannelPrices(db, 1, { takeout: 450, delivery: 600, yassir: 650, local: null }), { delivery: 600, takeout: 450, yassir: 650 })
  assert.throws(() => channels.setItemChannelPrices(db, 1, { glovo: 700 }), /CHANNEL_UNKNOWN_CHANNEL/)
  assert.throws(() => channels.setItemChannelPrices(db, 1, { takeout: -1 }), /CHANNEL_INVALID_PRICE/)
  assert.throws(() => channels.setItemChannelPrices(db, 999, { takeout: 1 }), /CHANNEL_NOT_FOUND/)
  const saved = channels.savePlatforms(db, [{ id: 'yassir', label: 'Yassir', enabled: true }, { label: 'Glovo Express' }])
  assert.deepEqual(saved.slice(3).map((c) => [c.id, c.label, c.builtin]), [['yassir', '', true], ['glovo-express', 'Glovo Express', false]])
  assert.throws(() => channels.savePlatforms(db, [{ id: 'delivery', label: 'x' }]), /CHANNEL_INVALID_PLATFORM/)
  assert.deepEqual(channels.getItemChannelPrices(db, 1), { delivery: 600, takeout: 450, yassir: 650 }, 'a failed save keeps the prices')
})

test('orders are priced from their channel; options add on top; wrong channels are refused', () => {
  const db = freshDb()
  const ids = seedCatalog(db)
  channels.setItemChannelPrices(db, 1, { takeout: 450, delivery: 600, yassir: 650 })
  channels.savePlatforms(db, [{ id: 'yassir', label: 'Yassir' }, { id: 'glovo', label: 'Glovo' }])
  const unit = (orderType, channel, lineExtra = {}) => {
    const result = create(db, orderType, [{ menuItemId: 1, quantity: 1, ...lineExtra }], channel ? { channel } : {})
    assert.equal(result.ok, true, result.message)
    const order = db.prepare('SELECT channel FROM orders WHERE id = ?').get(result.orderId)
    return [order.channel, lineRows(db, result.orderId)[0].unit_price]
  }
  assert.deepEqual(unit('local'), ['local', 500], 'no local price = menu price')
  assert.deepEqual(unit('takeout'), ['takeout', 450])
  assert.deepEqual(unit('delivery'), ['delivery', 600])
  assert.deepEqual(unit('delivery', 'yassir'), ['yassir', 650])
  assert.deepEqual(unit('delivery', 'glovo'), ['glovo', 500], 'a platform without its own price sells at the menu price')
  const options = [{ option_id: ids.algerian.id }, { option_id: ids.cheese.id, quantity: 2 }]
  assert.deepEqual(unit('delivery', 'yassir', { modifiers: options }), ['yassir', 650 + 20 + 100])

  assert.equal(create(db, 'local', [{ menuItemId: 1, quantity: 1 }], { channel: 'yassir' }).code, 'invalid_input')
  assert.equal(create(db, 'delivery', [{ menuItemId: 1, quantity: 1 }], { channel: 'uber' }).code, 'invalid_input')
  channels.savePlatforms(db, [{ id: 'yassir', label: 'Yassir', enabled: false }])
  assert.equal(create(db, 'delivery', [{ menuItemId: 1, quantity: 1 }], { channel: 'yassir' }).code, 'invalid_input')

  // Tablet / remote orders never trust client prices: the channel price applies to them too.
  const tablet = service(db).createOrder({
    source: 'tablet', sourceRequestId: requestId(), orderType: 'takeout', applyAutoPromotions: false,
    lines: [{ menuItemId: 1, quantity: 2, unitPriceOverride: 1 }]
  })
  assert.deepEqual(lineRows(db, tablet.orderId).map((l) => [l.unit_price, l.total_price]), [[450, 900]])
})

test('combos: the combo channel price + upcharges + child options; children allocations sum to the line', () => {
  const db = freshDb()
  const ids = seedCombo(db)
  channels.setItemChannelPrices(db, 10, { yassir: 900 })
  channels.setItemChannelPrices(db, 3, { yassir: 999 }) // a child's own channel price never changes the combo
  const result = create(db, 'delivery', [{
    menuItemId: 10, quantity: 2,
    children: [
      { slot_id: ids.slot.burger, menu_item_id: 1, modifiers: [{ option_id: ids.ketchup.id }, { option_id: ids.cheese.id }] },
      { slot_id: ids.slot.side, menu_item_id: 4 },
      { slot_id: ids.slot.drink, menu_item_id: 2 }
    ]
  }], { channel: 'yassir' })
  assert.equal(result.ok, true, result.message)
  const lines = lineRows(db, result.orderId)
  const parent = lines.find((l) => l.line_kind === 'combo')
  assert.deepEqual([parent.unit_price, parent.total_price], [900 + 100 + 50, 2100])
  const children = lines.filter((l) => l.line_kind === 'combo_child')
  assert.ok(children.every((child) => child.unit_price === 0))
  assert.equal(Math.round(children.reduce((sum, child) => sum + child.allocated_revenue, 0)), 2100)
  assert.equal(result.total, 2100)
  assert.ok(verifyJournal(db).ok)
})

test('POS price overrides are audited against the channel price; edits price new lines on the order channel', () => {
  const db = freshDb()
  seedCatalog(db)
  channels.setItemChannelPrices(db, 1, { yassir: 650, takeout: 450 })
  channels.setItemChannelPrices(db, 2, { yassir: 130 })
  const same = create(db, 'delivery', [{ menuItemId: 1, quantity: 1, unitPriceOverride: 650 }], { channel: 'yassir' })
  assert.equal(same.ok, true, same.message)
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM audit_events WHERE order_id = ?').get(same.orderId).n, 0)
  const cheaper = create(db, 'delivery', [{ menuItemId: 2, quantity: 1, unitPriceOverride: 100 }], { channel: 'yassir' })
  assert.equal(cheaper.ok, true, cheaper.message)
  assert.deepEqual({ ...db.prepare('SELECT original_value, new_value FROM audit_events WHERE order_id = ?').get(cheaper.orderId) },
    { original_value: '130', new_value: '100' })

  channels.setItemChannelPrices(db, 1, { yassir: 700, takeout: 450 })
  const [burger] = lineRows(db, same.orderId)
  const edit = service(db).updateOrderLines({
    orderId: same.orderId,
    lines: [{ orderItemId: burger.id, menuItemId: 1, quantity: 1 }, { menuItemId: 2, quantity: 1 }]
  })
  assert.equal(edit.ok, true, edit.message)
  assert.deepEqual(lineRows(db, same.orderId).map((l) => l.unit_price), [650, 130], 'snapshot kept, added line at the yassir price')
  const retype = service(db).updateOrderLines({
    orderId: same.orderId,
    lines: [...lineRows(db, same.orderId).map((l) => ({ orderItemId: l.id, menuItemId: l.menu_item_id, quantity: l.quantity })), { menuItemId: 1, quantity: 1 }],
    header: { orderType: 'takeout' }
  })
  assert.equal(retype.ok, true, retype.message)
  assert.equal(db.prepare('SELECT channel FROM orders WHERE id = ?').get(same.orderId).channel, 'takeout')
  assert.deepEqual(lineRows(db, same.orderId).map((l) => l.unit_price), [650, 130, 450])
  assert.equal(service(db).updateOrderLines({
    orderId: same.orderId, lines: [{ orderItemId: burger.id, menuItemId: 1, quantity: 1 }], header: { orderType: 'local', channel: 'yassir' }
  }).code, 'invalid_input')
})

test('menu reads carry channel_prices and available_now', () => {
  const db = freshDb()
  seedCatalog(db)
  channels.setItemChannelPrices(db, 1, { takeout: 450 })
  const all = menuRepo.getAll()
  const burger = all.find((item) => item.id === 1)
  assert.deepEqual(burger.channel_prices, { takeout: 450 })
  assert.equal(burger.available_now, 1)
  assert.deepEqual(all.find((item) => item.id === 2).channel_prices, {})
  assert.deepEqual(menuRepo.getById(1).channel_prices, { takeout: 450 })
  assert.equal(menuRepo.getActiveById(1).available_now, 1)
})
