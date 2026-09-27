// v4 waiter tablet: LAN endpoints (menu, item options, quote dry-run, order with modifiers /
// combo children, sold-out refusal, price tampering, promotions on extras, order status) against
// the REAL tablet request handler + repositories on a throwaway database.
//
// Run with: ELECTRON_RUN_AS_NODE=1 node_modules/electron/dist/electron.exe --no-warnings
//   --test test-harness/unit/tablet/*.test.mjs

import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { randomUUID } from 'node:crypto'
import { cleanup, freshDb, load, seedCatalog, stock } from '../order-effects/catalog-harness.mjs'

const { handleTabletHttpRequest } = await load('src/main/tablet/server.ts')
const { createCombosService, createSoldOutService } = await load('src/main/services/combos.ts')
const { openShift } = await load('src/main/services/shifts.ts')

after(() => cleanup())

function setSetting(db, key, value) {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value)
}

/** Catalog seed + Menu Maxi combo: Burger (default), Side (Fries default / Large Fries +100), Drink (no default). */
function seed() {
  const db = freshDb()
  const ids = seedCatalog(db)
  const combo = createCombosService(db).save(10, { slots: [
    { name: 'Burger', choices: [{ menu_item_id: 1, is_default: true }] },
    { name: 'Side', choices: [{ menu_item_id: 3, is_default: true }, { menu_item_id: 4, upcharge: 100 }] },
    { name: 'Drink', choices: [{ category_id: 2 }] }
  ] })
  const [burger, side, drink] = combo.slots.map((slot) => slot.id)
  return { db, ...ids, slot: { burger, side, drink } }
}

async function withServer(fn) {
  const server = http.createServer(handleTabletHttpRequest)
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  try {
    await fn(base)
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
}

async function call(base, path, { method = 'GET', body, token } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body)
  })
  const text = await res.text()
  let json = null
  try { json = JSON.parse(text) } catch { /* html */ }
  return { status: res.status, json, text }
}

const order = (items, extra = {}) => ({ source_request_id: randomUUID(), order_type: 'takeout', items, ...extra })
const count = (db, table) => db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n

test('GET /api/menu flags items with options, combos and sold-out; categories get a stable colour', async () => {
  const { db } = seed()
  createSoldOutService(db).set(5, true)
  await withServer(async (base) => {
    const { status, json } = await call(base, '/api/menu')
    assert.equal(status, 200)
    const item = (id) => json.items.find((row) => row.id === id)
    assert.equal(item(1).has_modifiers, true, 'Burger gets the Burgers category groups')
    assert.equal(item(2).has_modifiers, false, 'Cola has no groups')
    assert.equal(item(10).is_combo, 1)
    assert.equal(item(5).sold_out, 1, 'Orange Juice 86d')
    assert.equal(item(1).sold_out, 0)
    assert.deepEqual(json.categories.map((c) => [c.id, c.color]), [[1, 1], [2, 2], [3, 3], [4, 4]])
    const setting = (key) => db.prepare('SELECT value FROM settings WHERE key = ?').get(key)?.value
    assert.equal(json.currency, setting('currency_symbol') || setting('currency') || 'DA')
    const page = await call(base, '/')
    assert.equal(page.status, 200)
    assert.match(page.text, /window\.TABLET_CONFIG = /)
  })
})

test('GET /api/items/:id/options resolves groups, combo slots and the groups of combo choices', async () => {
  const { slot } = seed()
  await withServer(async (base) => {
    const burger = await call(base, '/api/items/1/options')
    assert.equal(burger.status, 200)
    assert.deepEqual(burger.json.groups.map((g) => [g.name, g.min_select, g.max_select]), [['Sauce', 1, 1], ['Extras', 0, 3], ['Remove', 0, null]])
    assert.equal(burger.json.combo, null)
    const combo = await call(base, '/api/items/10/options')
    assert.deepEqual(combo.json.combo.slots.map((s) => s.id), [slot.burger, slot.side, slot.drink])
    assert.deepEqual(combo.json.combo.slots[2].choices.map((c) => c.name).sort(), ['Cola', 'Orange Juice'])
    assert.deepEqual(Object.keys(combo.json.child_groups), ['1'], 'only the Burger choice has options')
    assert.equal((await call(base, '/api/items/999/options')).status, 404)
  })
})

test('POST /api/order stores modifiers + combo children priced from the DB; tampered prices are ignored', async () => {
  const { db, algerian, cheese, onions, slot } = seed()
  await withServer(async (base) => {
    const items = [
      // Burger 500 + Algerian 20 + Cheese 2 x 50 = 620; client "prices" must be ignored.
      { menu_item_id: 1, quantity: 1, unit_price: 1, price: 1,
        modifiers: [{ option_id: algerian.id, price_delta: -500 }, { option_id: cheese.id, quantity: 2 }, { option_id: onions.id }] },
      // Menu Maxi 800 + Large Fries +100 = 900.
      { menu_item_id: 10, quantity: 1, unit_price: 0, children: [
        { slot_id: slot.burger, menu_item_id: 1 }, { slot_id: slot.side, menu_item_id: 4 }, { slot_id: slot.drink, menu_item_id: 2 }
      ] }
    ]
    const cheeseBefore = stock(db, 2)
    const res = await call(base, '/api/order', { method: 'POST', body: order(items) })
    assert.equal(res.status, 200, res.text)
    const saved = db.prepare('SELECT * FROM orders WHERE id = ?').get(res.json.id)
    assert.equal(saved.subtotal, 1520)
    assert.equal(saved.total, 1520)
    const lines = db.prepare('SELECT * FROM order_items WHERE order_id = ? ORDER BY id').all(res.json.id)
    assert.equal(lines[0].unit_price, 620)
    const mods = db.prepare('SELECT name, kind, quantity FROM order_item_modifiers WHERE order_item_id = ? ORDER BY sort_order').all(lines[0].id)
    assert.deepEqual(mods.map((m) => [m.name, m.kind, m.quantity]), [['Algerian', 'none', 1], ['Cheese', 'extra', 2], ['Onions', 'no', 1]])
    const children = lines.filter((line) => line.parent_order_item_id === lines[1].id)
    assert.deepEqual(children.map((c) => c.menu_item_id), [1, 4, 2])
    assert.equal(stock(db, 2), cheeseBefore - 2, 'extra cheese deducted')
  })
})

test('sold-out items and missing required picks are refused with a clear message; the quote says so first', async () => {
  const { db, slot } = seed()
  createSoldOutService(db).set(1, true)
  await withServer(async (base) => {
    const quote = await call(base, '/api/quote', { method: 'POST', body: order([{ menu_item_id: 1, quantity: 1 }]) })
    assert.equal(quote.status, 409)
    assert.equal(quote.json.code, 'inactive_item')
    assert.match(quote.json.message, /"Burger" is sold out/)
    const res = await call(base, '/api/order', { method: 'POST', body: order([{ menu_item_id: 1, quantity: 1 }]) })
    assert.notEqual(res.status, 200)
    assert.match(res.json.error, /sold out/)
    assert.equal(count(db, 'orders'), 0)

    createSoldOutService(db).set(1, false)
    const noDrink = await call(base, '/api/quote', { method: 'POST', body: order([{ menu_item_id: 10, quantity: 1, children: [
      { slot_id: slot.burger, menu_item_id: 1 }, { slot_id: slot.side, menu_item_id: 3 }
    ] }]) })
    assert.equal(noDrink.status, 422)
    assert.match(noDrink.json.message, /Choose at least 1 for "Drink"/)
    assert.equal(noDrink.json.line_index, 0)
  })
})

test('quote = the order it previews (promotions on the final price incl. extras) and writes nothing', async () => {
  const { db, cheese, ketchup } = seed()
  db.prepare("INSERT INTO promotions (name, type, discount_value, applies_to, is_active) VALUES ('Happy 10', 'percentage', 10, 'all', 1)").run()
  const items = [{ menu_item_id: 1, quantity: 2, modifiers: [{ option_id: ketchup.id }, { option_id: cheese.id, quantity: 2 }] }, { menu_item_id: 2, quantity: 1 }]
  await withServer(async (base) => {
    const before = { orders: count(db, 'orders'), outbox: count(db, 'outbox_events'), stock: stock(db, 2) }
    const quote = await call(base, '/api/quote', { method: 'POST', body: order(items, { order_type: 'local', table_number: '4' }) })
    assert.equal(quote.status, 200, quote.text)
    // Burger 500 + Ketchup 0 + 2 cheese 100 = 600 x2 = 1200; Cola 100.
    assert.equal(quote.json.subtotal, 1300)
    assert.equal(quote.json.discount, 130, '10% of the final prices, extras included (base-only would be 110)')
    assert.equal(quote.json.total, 1170)
    assert.deepEqual(quote.json.lines.map((l) => l.total), [1200, 100])
    assert.deepEqual({ orders: count(db, 'orders'), outbox: count(db, 'outbox_events'), stock: stock(db, 2) }, before, 'dry run left no trace')

    const res = await call(base, '/api/order', { method: 'POST', body: order(items, { order_type: 'local', table_number: '4' }) })
    assert.equal(res.status, 200, res.text)
    const saved = db.prepare('SELECT subtotal, discount_amount, total, discount_details FROM orders WHERE id = ?').get(res.json.id)
    assert.deepEqual([saved.subtotal, saved.discount_amount, saved.total], [1300, 130, 1170])
    assert.match(saved.discount_details, /Happy 10: -130/)
  })
})

test('quote reports no open shift (require_open_shift) as a 409 with its own code', async () => {
  const { db } = seed()
  setSetting(db, 'require_open_shift', 'true')
  await withServer(async (base) => {
    const quote = await call(base, '/api/quote', { method: 'POST', body: order([{ menu_item_id: 2, quantity: 1 }]) })
    assert.equal(quote.status, 409)
    assert.equal(quote.json.code, 'no_open_shift')
    openShift(db, { cashier_name: 'Karim', opening_float: 0 })
    const ok = await call(base, '/api/quote', { method: 'POST', body: order([{ menu_item_id: 2, quantity: 1 }]) })
    assert.equal(ok.status, 200, ok.text)
  })
})

test('order status: preparing → ready when every kitchen ticket is ready → served; PIN protects quote/status', async () => {
  const { db } = seed()
  await withServer(async (base) => {
    const res = await call(base, '/api/order', { method: 'POST', body: order([{ menu_item_id: 2, quantity: 1 }]) })
    assert.equal(res.status, 200, res.text)
    const id = res.json.id
    const status = async (token) => (await call(base, `/api/orders/status?ids=${id},abc,-1`, { token })).json
    assert.deepEqual((await status()).orders, [{ id, daily_number: res.json.order_number, status: 'preparing' }])
    db.prepare("UPDATE kds_tickets SET status = 'ready' WHERE order_id = ?").run(id)
    assert.equal((await status()).orders[0].status, 'ready')
    db.prepare("UPDATE orders SET status = 'completed' WHERE id = ?").run(id)
    assert.equal((await status()).orders[0].status, 'completed')

    setSetting(db, 'tablet_pin_enabled', '1')
    setSetting(db, 'tablet_pin', '4321')
    assert.equal((await call(base, `/api/orders/status?ids=${id}`)).status, 401)
    assert.equal((await call(base, '/api/quote', { method: 'POST', body: order([{ menu_item_id: 2, quantity: 1 }]) })).status, 401)
    const pin = await call(base, '/api/pin', { method: 'POST', body: { pin: '4321' } })
    assert.equal((await status(pin.json.token)).orders[0].status, 'completed')
  })
})
