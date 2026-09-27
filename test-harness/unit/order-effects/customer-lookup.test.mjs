// v4 checkout — customers: migration 026 (consent), "repeat last order" lines (modifiers, combo
// picks, sold-out / removed items skipped), consent record / withdraw, through the real repo.
// Run: ELECTRON_RUN_AS_NODE=1 node_modules/electron/dist/electron.exe --no-warnings --test <this file>
import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import {
  cleanup, createCombosService, createOrderService, createSoldOutService, freshDb, load, requestId, seedCatalog
} from './catalog-harness.mjs'

const { customersRepo } = await load('src/main/database/repositories/customers.repo.ts')
const { CUSTOMER_CONSENT_VERSION } = await load('src/shared/customer-lookup.ts')

after(cleanup)

const PHONE = '0550 12 34 56'

function seedCombo(db) {
  const ids = seedCatalog(db)
  const combo = createCombosService(db).save(10, { slots: [
    { name: 'Burger', choices: [{ menu_item_id: 1, is_default: true }] },
    { name: 'Side', choices: [{ menu_item_id: 3, is_default: true }, { menu_item_id: 4, upcharge: 100 }] },
    { name: 'Drink', choices: [{ menu_item_id: 2, is_default: true }, { category_id: 2 }] }
  ] })
  const [burger, side, drink] = combo.slots.map((slot) => slot.id)
  return { ...ids, slot: { burger, side, drink } }
}

function order(db, lines, extra = {}) {
  const created = createOrderService({ db }).createOrder({
    source: 'pos', sourceRequestId: requestId(), orderType: 'takeout', lines, applyAutoPromotions: false,
    customer: { phone: PHONE, name: 'Amine' }, ...extra
  })
  assert.equal(created.ok, true, created.message)
  return created
}

const customerId = (db) => db.prepare('SELECT id FROM customers').get().id

test('migration 026 adds the consent columns and the customer index', () => {
  const db = freshDb()
  const columns = db.prepare('PRAGMA table_info(customers)').all().map((c) => c.name)
  assert.ok(columns.includes('consent_at') && columns.includes('consent_version'))
  const applied = db.prepare('SELECT version FROM _migrations WHERE version = 26').get()
  assert.ok(applied, 'migration 26 recorded')
  const index = db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_orders_customer'").get()
  assert.ok(index)
})

test('repeat last order: options + combo picks come back as order-line input; cancelled orders ignored', () => {
  const db = freshDb()
  const ids = seedCombo(db)
  order(db, [{ menuItemId: 3, quantity: 1 }])
  const last = order(db, [
    { menuItemId: 1, quantity: 2, note: 'well done', modifiers: [{ option_id: ids.algerian.id }, { option_id: ids.cheese.id, quantity: 2 }, { option_id: ids.onions.id }] },
    { menuItemId: 10, quantity: 1, children: [
      { slot_id: ids.slot.burger, menu_item_id: 1, modifiers: [{ option_id: ids.ketchup.id }] },
      { slot_id: ids.slot.side, menu_item_id: 4 },
      { slot_id: ids.slot.drink, menu_item_id: 5 }
    ] }
  ])
  const cancelled = order(db, [{ menuItemId: 2, quantity: 5 }])
  db.prepare("UPDATE orders SET status = 'cancelled' WHERE id = ?").run(cancelled.orderId)

  const result = customersRepo.getLastOrder(customerId(db))
  assert.equal(result.order.id, last.orderId)
  assert.equal(result.order.item_count, 3)
  assert.deepEqual(result.skipped, [])
  assert.equal(result.lines.length, 2)
  const [burger, maxi] = result.lines
  assert.equal(burger.menu_item_id, 1)
  assert.equal(burger.quantity, 2)
  assert.equal(burger.notes, 'well done')
  assert.deepEqual(burger.modifiers.map((m) => [m.option_id, m.quantity]).sort((a, b) => a[0] - b[0]),
    [[ids.algerian.id, 1], [ids.cheese.id, 2], [ids.onions.id, 1]].sort((a, b) => a[0] - b[0]))
  assert.equal(maxi.menu_item_id, 10)
  assert.deepEqual(maxi.children.map((c) => [c.slot_id, c.menu_item_id]), [
    [ids.slot.burger, 1], [ids.slot.side, 4], [ids.slot.drink, 5]
  ])
  assert.deepEqual(maxi.children[0].modifiers.map((m) => m.option_id), [ids.ketchup.id])

  // The lines are accepted as a brand-new order (the point of "repeat").
  const again = createOrderService({ db }).createOrder({
    source: 'pos', sourceRequestId: requestId(), orderType: 'takeout', applyAutoPromotions: false,
    lines: result.lines.map((line) => ({
      menuItemId: line.menu_item_id, quantity: line.quantity, note: line.notes ?? undefined,
      modifiers: line.modifiers ?? undefined,
      children: line.children.length ? line.children.map((c) => ({ slot_id: c.slot_id, menu_item_id: c.menu_item_id, modifiers: c.modifiers })) : undefined
    }))
  })
  assert.equal(again.ok, true, again.message)
  assert.equal(again.subtotal, last.subtotal)
})

test('repeat last order skips sold-out, removed and no-longer-offered lines, trims removed options', () => {
  const db = freshDb()
  const ids = seedCombo(db)
  order(db, [
    { menuItemId: 1, quantity: 1, modifiers: [{ option_id: ids.ketchup.id }, { option_id: ids.cheese.id }] },
    { menuItemId: 3, quantity: 2 },
    { menuItemId: 2, quantity: 1 },
    { menuItemId: 10, quantity: 1, children: [
      { slot_id: ids.slot.burger, menu_item_id: 1, modifiers: [{ option_id: ids.ketchup.id }] },
      { slot_id: ids.slot.side, menu_item_id: 3 },
      { slot_id: ids.slot.drink, menu_item_id: 5 }
    ] }
  ])
  createSoldOutService(db).set(3, true) // Fries sold out → the Fries line AND the combo using it
  db.prepare('UPDATE menu_items SET is_active = 0 WHERE id = 2').run() // Cola removed from the menu
  db.prepare('UPDATE modifier_options SET is_active = 0 WHERE id = ?').run(ids.cheese.id) // option gone

  const result = customersRepo.getLastOrder(customerId(db))
  assert.deepEqual(result.lines.map((l) => l.menu_item_id), [1])
  assert.deepEqual(result.lines[0].modifiers.map((m) => m.option_id), [ids.ketchup.id])
  assert.deepEqual(result.trimmed, ['Burger'])
  assert.deepEqual(result.skipped.map((s) => [s.name, s.reason]), [
    ['Fries', 'sold_out'], ['Cola', 'unavailable'], ['Menu Maxi', 'sold_out']
  ])
})

test('a line saved without options falls back to the default options when a group became required', () => {
  const db = freshDb()
  seedCatalog(db)
  const created = order(db, [{ menuItemId: 1, quantity: 1 }])
  // Simulate a pre-v4 order line: no option snapshot at all.
  db.prepare('DELETE FROM order_item_modifiers WHERE order_item_id IN (SELECT id FROM order_items WHERE order_id = ?)').run(created.orderId)
  const result = customersRepo.getLastOrder(customerId(db))
  assert.equal(result.lines.length, 1)
  assert.equal(result.lines[0].modifiers, null, 'null = let the item defaults apply')
})

test('no customer / no orders → empty result', () => {
  freshDb()
  assert.deepEqual(customersRepo.getLastOrder(999), { order: null, lines: [], skipped: [], trimmed: [] })
  assert.deepEqual(customersRepo.getLastOrder(-1), { order: null, lines: [], skipped: [], trimmed: [] })
})

test('consent: recorded by phone (customer created), versioned, idempotent; withdraw forgets addresses', () => {
  const db = freshDb()
  assert.throws(() => customersRepo.recordConsent({ phone: '12' }), /valid customer phone/)
  const first = customersRepo.recordConsent({ phone: PHONE, name: '  Sara  ' })
  assert.equal(first.phone_normalized, '+213550123456')
  assert.equal(first.name, 'Sara')
  assert.equal(first.order_count, 0)
  assert.equal(first.consent_version, CUSTOMER_CONSENT_VERSION)
  assert.ok(first.consent_at)

  const again = customersRepo.recordConsent({ phone: '+213 550 123 456', version: 'v2' })
  assert.equal(again.id, first.id, 'same customer (normalized phone)')
  assert.equal(again.name, 'Sara', 'empty name keeps the stored one')
  assert.equal(again.consent_version, 'v2')

  db.prepare("INSERT INTO customer_addresses (customer_id, address) VALUES (?, 'Rue 1, Oran')").run(first.id)
  const withdrawn = customersRepo.withdrawConsent(first.id)
  assert.equal(withdrawn.consent_at, null)
  assert.equal(withdrawn.consent_version, null)
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM customer_addresses WHERE customer_id = ?').get(first.id).n, 0)
  assert.throws(() => customersRepo.withdrawConsent(4242), /not found/)

  const byId = customersRepo.recordConsent({ customer_id: first.id })
  assert.ok(byId.consent_at)
  assert.throws(() => customersRepo.recordConsent({ customer_id: 4242 }), /not found/)
  // search results carry the consent columns (CustomerLookup reads them).
  assert.ok(customersRepo.search('0550')[0].consent_at)
})
