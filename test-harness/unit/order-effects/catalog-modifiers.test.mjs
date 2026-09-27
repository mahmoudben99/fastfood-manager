// v4 catalog — modifiers: admin rules, pricing, validation, stock, edits, tickets, sold out, migration.
// Run: ELECTRON_RUN_AS_NODE=1 node_modules/electron/dist/electron.exe --no-warnings --test <this file>
import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync } from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import {
  cleanup, createModifiersService, createOrderService, createSoldOutService, freshDb, load, menuRepo, near,
  ordersRepo, printDocuments, requestId, rootDir, seedCatalog, seedStationPrinters, stock, buildFromTemplate
} from './catalog-harness.mjs'

const { sanitizeCatalogFields } = await load('src/main/services/order-catalog.ts')
const { sanitizeOrderItems } = await load('src/main/services/order-promotions.ts')
const { runMigrations } = await load('src/main/database/migrations/index.ts')
const { migration021 } = await load('src/main/database/migrations/021_modifiers_combos.ts')

after(cleanup)

const pos = (lines, extra = {}) => ({ source: 'pos', sourceRequestId: requestId(), orderType: 'local', lines, applyAutoPromotions: false, ...extra })
const lineOf = (db, orderId) => db.prepare('SELECT * FROM order_items WHERE order_id = ? ORDER BY id').all(orderId)
const settings = { language: 'en', restaurant_name: 'Test', currency_symbol: 'DA' }

test('admin rules: selection rules, "no" options cannot deduct stock, item rows override the category', () => {
  const db = freshDb()
  const ids = seedCatalog(db)
  const mods = createModifiersService(db)
  assert.throws(() => mods.createGroup({ name: 'Bad', min_select: 3, max_select: 2 }), /Invalid selection rules/)
  assert.throws(() => mods.createGroup({ name: '  ' }), /name is required/)
  assert.throws(() => mods.createOption(ids.remove.id, { name: 'Tomato', kind: 'no', ingredients: [{ stock_item_id: 3, quantity: 5, unit: 'g' }] }), /cannot deduct stock/)
  assert.throws(() => mods.createOption(ids.extras.id, { name: 'Bad unit', ingredients: [{ stock_item_id: 2, quantity: 5, unit: 'g' }] }), /incompatible with Cheese/)
  assert.throws(() => mods.updateOption(ids.onions.id, { kind: 'weird' }), /Unknown option type/)

  let groups = mods.getForMenuItem(1)
  assert.deepEqual(groups.map((g) => g.name), ['Sauce', 'Extras', 'Remove'])
  assert.equal(groups[0].min_select, 1, 'required group needs at least 1')
  assert.equal(groups[1].min_select, 0)
  assert.equal(groups[1].max_quantity, 3)
  assert.equal(groups[2].max_quantity, 1)
  assert.deepEqual(mods.getForMenuItem(2), [], 'drinks have no groups')

  // Item rows: hide "Remove" for this item and pull "Extras" to the top.
  mods.setItemAssignments(1, [{ group_id: ids.remove.id, excluded: true }, { group_id: ids.extras.id, sort_order: 0 }])
  groups = mods.getForMenuItem(1)
  assert.deepEqual(groups.map((g) => [g.name, g.source]), [['Extras', 'item'], ['Sauce', 'category']])
  mods.setItemAssignments(1, [])
  assert.equal(mods.getForMenuItem(1).length, 3)

  mods.updateOption(ids.cheese.id, { is_active: false })
  assert.deepEqual(mods.getForMenuItem(1).find((g) => g.name === 'Extras'), undefined, 'a group with no active option is hidden')
  assert.equal(mods.getGroup(ids.extras.id).options[0].ingredients[0].stock_item_name, 'Cheese')
})

test('pricing: base + deltas × quantity, snapshot rows, defaults, negative deltas clamp at 0', () => {
  const db = freshDb()
  const ids = seedCatalog(db)
  const service = createOrderService({ db })
  const created = service.createOrder(pos([{
    menuItemId: 1,
    quantity: 2,
    modifiers: [{ option_id: ids.cheese.id, quantity: 2 }, { option_id: ids.onions.id }, { option_id: ids.algerian.id }]
  }]))
  assert.equal(created.ok, true, created.message)
  const [line] = lineOf(db, created.orderId)
  assert.equal(line.unit_price, 500 + 50 * 2 + 20)
  assert.equal(line.total_price, 620 * 2)
  assert.equal(created.subtotal, 1240)

  // Snapshot survives catalog edits.
  createModifiersService(db).updateOption(ids.cheese.id, { name: 'Cheddar', price_delta: 999 })
  const items = ordersRepo.getById(created.orderId).items
  assert.deepEqual(items[0].modifiers.map((m) => [m.name, m.kind, m.price_delta, m.quantity]), [
    ['Algerian', 'none', 20, 1], ['Cheese', 'extra', 50, 2], ['Onions', 'no', 0, 1]
  ])

  // Omitted modifiers = defaults (Ketchup satisfies the required Sauce group).
  const defaults = service.createOrder(pos([{ menuItemId: 1, quantity: 1 }]))
  assert.equal(defaults.ok, true, defaults.message)
  assert.deepEqual(ordersRepo.getById(defaults.orderId).items[0].modifiers.map((m) => m.name), ['Ketchup'])
  assert.equal(defaults.subtotal, 500)

  // Negative delta ("no cheese -50" style) and a clamp at 0.
  const deal = createModifiersService(db).createOption(ids.remove.id, { name: 'Bun', kind: 'no', price_delta: -600 })
  const cheap = service.createOrder(pos([{ menuItemId: 1, quantity: 1, modifiers: [{ option_id: ids.ketchup.id }, { option_id: deal.id }] }]))
  assert.equal(cheap.ok, true, cheap.message)
  assert.equal(lineOf(db, cheap.orderId)[0].unit_price, 0)
})

test('validation: required, max, quantity rules, foreign/repeated options, children on a plain item', () => {
  const db = freshDb()
  const ids = seedCatalog(db)
  const service = createOrderService({ db })
  const fail = (lines, pattern, code = 'invalid_input') => {
    const result = service.createOrder(pos(lines))
    assert.equal(result.ok, false)
    assert.equal(result.code, code)
    assert.match(result.message, pattern)
    assert.equal(result.lineIndex, lines.length - 1)
  }
  fail([{ menuItemId: 1, quantity: 1, modifiers: [] }], /Choose at least 1 in "Sauce"/)
  fail([{ menuItemId: 1, quantity: 1, modifiers: [{ option_id: ids.ketchup.id }, { option_id: ids.algerian.id }] }], /at most 1 in "Sauce"/)
  fail([{ menuItemId: 1, quantity: 1, modifiers: [{ option_id: ids.ketchup.id }, { option_id: ids.onions.id, quantity: 2 }] }], /"Remove" allows each option only once/)
  fail([{ menuItemId: 1, quantity: 1, modifiers: [{ option_id: ids.ketchup.id }, { option_id: ids.cheese.id, quantity: 4 }] }], /at most 3 in "Extras"/)
  fail([{ menuItemId: 1, quantity: 1, modifiers: [{ option_id: ids.ketchup.id }, { option_id: ids.ketchup.id }] }], /chosen twice/)
  fail([{ menuItemId: 2, quantity: 1 }, { menuItemId: 2, quantity: 1, modifiers: [{ option_id: ids.cheese.id }] }], /not available/, 'inactive_item')
  fail([{ menuItemId: 2, quantity: 1, children: [{ slot_id: 1, menu_item_id: 3 }] }], /is not a combo/)
  fail([{ menuItemId: 1, quantity: 1, modifiers: [{ option_id: 'x' }] }], /Invalid options/)

  // Localized (app language fr / ar).
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('language', 'fr')").run()
  assert.match(service.createOrder(pos([{ menuItemId: 1, quantity: 1, modifiers: [] }])).message, /Choisissez au moins 1 dans « Sauce »/)
  db.prepare("UPDATE settings SET value = 'ar' WHERE key = 'language'").run()
  assert.match(service.createOrder(pos([{ menuItemId: 1, quantity: 1, modifiers: [] }])).message, /اختر 1 على الأقل/)
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM orders').get().n, 0, 'every refusal rolled back')
})

test('tablet/remote: client prices are ignored; the sanitizer keeps only ids and quantities', () => {
  const db = freshDb()
  const ids = seedCatalog(db)
  const raw = [{ menu_item_id: 1, quantity: 1, unit_price: 1, price: 1, modifiers: [{ option_id: ids.cheese.id, price_delta: -999, quantity: 1 }, { option_id: ids.algerian.id, price_delta: 0 }] }]
  const items = sanitizeOrderItems(raw)
  assert.deepEqual(items, [{ menu_item_id: 1, quantity: 1, notes: undefined, modifiers: [{ option_id: ids.cheese.id, quantity: 1 }, { option_id: ids.algerian.id, quantity: 1 }] }])
  assert.equal(sanitizeCatalogFields({ modifiers: [{ option_id: -1 }] }), null)
  assert.deepEqual(sanitizeOrderItems([{ menu_item_id: 1, quantity: 1, modifiers: 'x' }]), [])

  const service = createOrderService({ db })
  for (const source of ['tablet', 'remote']) {
    const result = service.createOrder({
      source, sourceRequestId: requestId(), orderType: 'takeout', applyAutoPromotions: false,
      lines: [{ menuItemId: 1, quantity: 1, unitPriceOverride: 1, modifiers: raw[0].modifiers }]
    })
    assert.equal(result.ok, true, result.message)
    assert.equal(result.subtotal, 570, `${source}: 500 + 50 + 20 from the database`)
  }
})

test('stock: option ingredients × line quantity; cancel/restore; quantity edit; option edit; line removal', () => {
  const db = freshDb()
  const ids = seedCatalog(db)
  const service = createOrderService({ db })
  const created = service.createOrder(pos([
    { menuItemId: 1, quantity: 2, modifiers: [{ option_id: ids.algerian.id }, { option_id: ids.cheese.id, quantity: 2 }] },
    { menuItemId: 2, quantity: 1 }
  ]))
  assert.equal(created.ok, true, created.message)
  near(stock(db, 2), 100 - 4, 'cheese: 2 per burger × 2 burgers')
  near(stock(db, 6), 10 - 0.02, 'sauce: 10 ml × 2')
  near(stock(db, 1), 100 - 0.3, 'beef recipe unchanged')
  const burger = lineOf(db, created.orderId)[0]
  const modRows = db.prepare('SELECT * FROM order_item_deductions WHERE order_item_id = ? AND order_item_modifier_id IS NOT NULL').all(burger.id)
  assert.equal(modRows.length, 2)

  assert.equal(service.updateOrderStatus(created.orderId, 'cancelled').ok, true)
  near(stock(db, 2), 100, 'cancel restores option stock')
  near(stock(db, 6), 10)
  assert.equal(service.updateOrderStatus(created.orderId, 'preparing').ok, true)
  near(stock(db, 2), 96, 'restore re-deducts option stock')

  // Quantity 2 -> 3 scales option deductions like recipe deductions; price unchanged per unit.
  let edited = service.updateOrderLines({ orderId: created.orderId, lines: [{ orderItemId: burger.id, menuItemId: 1, quantity: 3 }, { orderItemId: burger.id + 1, menuItemId: 2, quantity: 1 }] })
  assert.equal(edited.ok, true, edited.message)
  near(stock(db, 2), 100 - 6)
  assert.equal(lineOf(db, created.orderId)[0].unit_price, 620)

  // Option set change: drop cheese, add onions removal, Ketchup instead of Algerian -> 500.
  edited = service.updateOrderLines({ orderId: created.orderId, lines: [
    { orderItemId: burger.id, menuItemId: 1, quantity: 3, modifiers: [{ option_id: ids.ketchup.id }, { option_id: ids.onions.id }] },
    { orderItemId: burger.id + 1, menuItemId: 2, quantity: 1 }
  ] })
  assert.equal(edited.ok, true, edited.message)
  near(stock(db, 2), 100, 'cheese given back')
  near(stock(db, 6), 10, 'sauce given back')
  assert.equal(lineOf(db, created.orderId)[0].unit_price, 500)
  assert.equal(edited.subtotal, 1500 + 100)
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM audit_events WHERE event_type = 'price_override'").get().n, 0, 're-pricing is not an override')
  assert.deepEqual(ordersRepo.getById(created.orderId).items[0].modifiers.map((m) => m.name), ['Ketchup', 'Onions'])

  // Same option set sent again = no change; invalid new set is refused and nothing changes.
  const refused = service.updateOrderLines({ orderId: created.orderId, lines: [{ orderItemId: burger.id, menuItemId: 1, quantity: 3, modifiers: [] }] })
  assert.equal(refused.ok, false)
  assert.match(refused.message, /Sauce/)

  // Removing the line gives back everything, options included.
  const beefBefore = stock(db, 1)
  edited = service.updateOrderLines({ orderId: created.orderId, lines: [{ orderItemId: burger.id + 1, menuItemId: 2, quantity: 1 }] })
  assert.equal(edited.ok, true, edited.message)
  near(stock(db, 1), beefBefore + 0.45)
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM order_item_modifiers').get().n, 0)

  // New line added during an edit gets its options (+ stock) too.
  edited = service.updateOrderLines({ orderId: created.orderId, lines: [
    { orderItemId: burger.id + 1, menuItemId: 2, quantity: 1 },
    { menuItemId: 1, quantity: 1, modifiers: [{ option_id: ids.algerian.id }, { option_id: ids.cheese.id }] }
  ] })
  assert.equal(edited.ok, true, edited.message)
  assert.equal(edited.subtotal, 100 + 570)
  near(stock(db, 2), 99)
  assert.deepEqual(db.pragma('foreign_key_check'), [])
})

test('kitchen UPDATED ticket: an option change is a change; tickets and receipts print options', () => {
  const db = freshDb()
  const ids = seedCatalog(db)
  seedStationPrinters(db)
  const service = createOrderService({ db })
  const created = service.createOrder(pos([
    { menuItemId: 1, quantity: 2, modifiers: [{ option_id: ids.algerian.id }, { option_id: ids.cheese.id, quantity: 2 }, { option_id: ids.onions.id }] },
    { menuItemId: 2, quantity: 1 }
  ]))
  const [burger, cola] = lineOf(db, created.orderId)
  const edited = service.updateOrderLines({ orderId: created.orderId, lines: [
    { orderItemId: burger.id, menuItemId: 1, quantity: 2, modifiers: [{ option_id: ids.algerian.id }, { option_id: ids.cheese.id, quantity: 2 }] },
    { orderItemId: cola.id, menuItemId: 2, quantity: 1 }
  ] })
  assert.equal(edited.ok, true, edited.message)
  const jobs = db.prepare("SELECT * FROM print_jobs WHERE order_id = ? AND event_type = 'updated'").all(created.orderId)
  assert.deepEqual(jobs.map((j) => j.printer_name), ['GRILL'], 'only the station whose line changed')
  const change = JSON.parse(jobs[0].detail).changes[0]
  assert.equal(change.kind, 'changed')
  assert.equal(change.modifiersChanged, true)

  const order = ordersRepo.getById(created.orderId)
  const kitchen = printDocuments.buildKitchenHTML(order, order.items, settings, {
    paperWidth: '80', kitchenFontSize: null, eventType: 'updated', workerName: 'Grill', changes: [change], removedNames: {}
  })
  assert.match(kitchen, /OPTIONS CHANGED/)
  assert.match(kitchen, /EXTRA CHEESE x2/)
  assert.doesNotMatch(kitchen, /NO ONIONS/)

  // Fresh ticket for an order with a "no" option: bold, prefixed, not doubled.
  const other = service.createOrder(pos([{ menuItemId: 1, quantity: 1, modifiers: [{ option_id: ids.ketchup.id }, { option_id: ids.onions.id }] }]))
  const plain = ordersRepo.getById(other.orderId)
  const ticket = printDocuments.buildKitchenHTML(plain, plain.items, settings, {
    paperWidth: '80', kitchenFontSize: null, eventType: 'new', workerName: null, changes: [], removedNames: {}
  })
  assert.match(ticket, /class="mod mod-no">✕ NO ONIONS</)
  assert.match(ticket, /\+ Ketchup/)

  const receipt = printDocuments.buildDefaultReceiptHTML(order, settings, { logoDataUrl: null, paperWidth: '80', receiptFontSize: null })
  assert.match(receipt, /EXTRA Cheese x2/)
  assert.match(receipt, /\+200\.00/, 'cheese 50 × 2 × 2 burgers')
  assert.match(receipt, /\+40\.00/, 'algerian 20 × 2 burgers')
  return buildFromTemplate({ blocks: [{ type: 'items_table', enabled: true, config: {} }] }, order, settings, { logoDataUrl: null, paperWidth: '80', receiptFontSize: null })
    .then((html) => {
      assert.match(html, /EXTRA Cheese x2/)
      assert.match(html, /\+200 DA/)
    })
})

test('sold out: manual 86 blocks ordering; auto rule follows stock and clears on restock', () => {
  const db = freshDb()
  seedCatalog(db)
  const service = createOrderService({ db })
  const soldOut = createSoldOutService(db)
  soldOut.set(2, true)
  let result = service.createOrder(pos([{ menuItemId: 2, quantity: 1 }]))
  assert.equal(result.ok, false)
  assert.equal(result.code, 'inactive_item')
  assert.match(result.message, /"Cola" is sold out/)
  assert.equal(menuRepo.getAll().find((i) => i.id === 2).sold_out, 1)
  assert.deepEqual(soldOut.list(), [{ id: 2, name: 'Cola', manual: true, auto: false }])
  soldOut.set(2, false)
  assert.equal(service.createOrder(pos([{ menuItemId: 2, quantity: 1 }])).ok, true)

  db.prepare('UPDATE stock_items SET quantity = 0 WHERE id = 5').run()
  assert.equal(service.createOrder(pos([{ menuItemId: 2, quantity: 1 }])).ok, true, 'auto rule is off by default')
  soldOut.setAuto(true)
  assert.equal(soldOut.getAuto(), true)
  result = service.createOrder(pos([{ menuItemId: 2, quantity: 1 }]))
  assert.equal(result.ok, false)
  assert.deepEqual(soldOut.list().map((row) => [row.id, row.auto]), [[2, true]])
  db.prepare('UPDATE stock_items SET quantity = 24 WHERE id = 5').run()
  assert.equal(service.createOrder(pos([{ menuItemId: 2, quantity: 1 }])).ok, true, 'restocking clears it')
  assert.equal(menuRepo.getById(2).sold_out, 0)
})

test('migration 021 on a pre-021 database keeps old orders readable and editable', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'ffm-m021-'))
  const legacy = new Database(path.join(dir, 'legacy.db'))
  try {
    legacy.pragma('foreign_keys = ON')
    legacy.exec("CREATE TABLE _migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL DEFAULT (datetime('now')))")
    {
      const files = readdirSync(path.join(rootDir, 'src/main/database/migrations'))
        .filter((file) => /^\d{3}_.*\.ts$/.test(file) && Number(file.slice(0, 3)) < 21).sort()
      for (const file of files) {
        const module = await load(`src/main/database/migrations/${file}`)
        const migration = Object.values(module).find((value) => value && typeof value.up === 'function')
        migration.up(legacy)
        legacy.prepare('INSERT INTO _migrations (version, name) VALUES (?, ?)').run(migration.version, migration.name)
      }
      legacy.exec(`INSERT INTO categories (id, name) VALUES (1, 'Burgers');
        INSERT INTO stock_items (id, name, unit_type, quantity) VALUES (1, 'Beef', 'kg', 10);
        INSERT INTO menu_items (id, name, price, category_id) VALUES (1, 'Burger', 500, 1);
        INSERT INTO menu_item_ingredients (menu_item_id, stock_item_id, quantity, unit) VALUES (1, 1, 100, 'g')`)
      const today = new Date(Date.now() + 3600_000).toISOString().slice(0, 10)
      legacy.prepare(`INSERT INTO orders (id, daily_number, order_date, order_type, status, subtotal, total, source) VALUES (1, 1, ?, 'local', 'preparing', 1000, 1000, 'pos')`).run(today)
      legacy.exec(`INSERT INTO order_items (id, order_id, menu_item_id, quantity, unit_price, total_price, item_name) VALUES (1, 1, 1, 2, 500, 1000, 'Burger');
        INSERT INTO order_item_deductions (order_item_id, stock_item_id, quantity_deducted, cost_per_unit) VALUES (1, 1, 0.2, 0)`)

      runMigrations(legacy)
      migration021.up(legacy) // idempotent
      assert.equal(legacy.prepare('SELECT COUNT(*) AS n FROM _migrations WHERE version = 21').get().n, 1)
      const row = legacy.prepare('SELECT line_kind, parent_order_item_id, allocated_revenue, combo_upcharge FROM order_items WHERE id = 1').get()
      assert.deepEqual({ ...row }, { line_kind: 'item', parent_order_item_id: null, allocated_revenue: null, combo_upcharge: 0 })
      assert.equal(legacy.prepare('SELECT order_item_modifier_id FROM order_item_deductions').get().order_item_modifier_id, null)
      assert.deepEqual({ ...legacy.prepare('SELECT is_combo, is_sold_out FROM menu_items WHERE id = 1').get() }, { is_combo: 0, is_sold_out: 0 })

      const service = createOrderService({ db: legacy })
      const edited = service.updateOrderLines({ orderId: 1, lines: [{ orderItemId: 1, menuItemId: 1, quantity: 3 }] })
      assert.equal(edited.ok, true, edited.message)
      near(legacy.prepare('SELECT quantity FROM stock_items WHERE id = 1').get().quantity, 9.9)
      assert.deepEqual(legacy.pragma('foreign_key_check'), [])
    }
  } finally {
    legacy.close()
    rmSync(dir, { recursive: true, force: true })
  }
})
