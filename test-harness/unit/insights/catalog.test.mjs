// Insights × v4 catalog: modifier option ingredients and combo children in the forecast, the
// shopping list, the menu profit check and the dashboard (net of delivery fees, telegram flag).
import test from 'node:test'
import assert from 'node:assert/strict'
import { addDays, freshDb, localInstant, seedMenu, seedRecipes, seedStock, src } from './helpers.mjs'

const { buildForecast } = await src('main/services/insights/forecast.ts')
const { buildShoppingList } = await src('main/services/insights/shopping-list.ts')
const { buildMenuProfit } = await src('main/services/insights/profit.ts')
const { buildDashboardSummary } = await src('main/services/insights/dashboard.ts')
const { evaluateAlerts } = await src('main/services/insights/alerts.ts')
const { DEFAULT_INSIGHTS_SETTINGS } = await src('shared/insights.ts')

const D = '2026-09-26'

/**
 * Burger 500 (beef 150 g + bun), Fries 200 (potato 200 g), Cola 100 (can), Menu Maxi 700 = combo
 * (own recipe: 1 box) with default picks Burger / Fries / Cola.
 * Options on Burgers: "Ketchup" (default, 10 ml ketchup), "Extra cheese" (+80, 20 g cheese),
 * "No onions" (kind 'no', 15 g onion — must never count).
 */
function seedCatalog(db) {
  seedMenu(db, [
    { id: 1, name: 'Burger', price: 500, category: 1 },
    { id: 2, name: 'Fries', price: 200, category: 2 },
    { id: 3, name: 'Cola', price: 100, category: 3 },
    { id: 4, name: 'Menu Maxi', price: 700, category: 1 }
  ])
  db.exec('UPDATE menu_items SET is_combo = 1 WHERE id = 4')
  seedStock(db, [
    { id: 1, name: 'Beef', unit: 'kg', quantity: 50, price: 1000 },
    { id: 2, name: 'Buns', unit: 'unit', quantity: 500, price: 20 },
    { id: 3, name: 'Potato', unit: 'kg', quantity: 50, price: 100 },
    { id: 4, name: 'Cans', unit: 'unit', quantity: 500, price: 50 },
    { id: 5, name: 'Box', unit: 'unit', quantity: 1, price: 10 },
    { id: 6, name: 'Ketchup', unit: 'liter', quantity: 10, price: 300 },
    { id: 7, name: 'Cheese', unit: 'kg', quantity: 0, price: 1500 },
    { id: 8, name: 'Onion', unit: 'kg', quantity: 0, price: 80 }
  ])
  seedRecipes(db, [[1, 1, 150, 'g'], [1, 2, 1, 'unit'], [2, 3, 200, 'g'], [3, 4, 1, 'unit'], [4, 5, 1, 'unit']])
  db.exec(`
    INSERT INTO modifier_groups (id, name, min_select, max_select) VALUES (1, 'Sauce', 0, 1), (2, 'Extras', 0, NULL);
    INSERT INTO modifier_options (id, group_id, name, name_fr, kind, price_delta, is_default) VALUES
      (1, 1, 'Ketchup', 'Ketchup', 'none', 0, 1),
      (2, 2, 'Extra cheese', 'Fromage en plus', 'extra', 80, 0),
      (3, 2, 'No onions', 'Sans oignons', 'no', 0, 0);
    INSERT INTO modifier_option_ingredients (option_id, stock_item_id, quantity, unit) VALUES
      (1, 6, 10, 'ml'), (2, 7, 20, 'g'), (3, 8, 15, 'g');
    INSERT INTO category_modifier_groups (category_id, group_id) VALUES (1, 1), (1, 2);
    -- the combo itself gets no options (it is in category 1: exclude both groups on it)
    INSERT INTO menu_item_modifier_groups (menu_item_id, group_id, is_excluded) VALUES (4, 1, 1), (4, 2, 1);
    INSERT INTO combo_slots (id, combo_item_id, name, sort_order) VALUES (1, 4, 'Main', 0), (2, 4, 'Side', 1), (3, 4, 'Drink', 2);
    INSERT INTO combo_slot_choices (slot_id, menu_item_id, is_default) VALUES (1, 1, 1), (2, 2, 1), (3, 3, 1);
  `)
}

const counters = new Map()

/** Raw order with catalog lines. line: { id, qty, total, kind?, parent?, allocated?, mods?: [[optionId, qty, kind]] } */
function order(db, { date, time = '12:00', lines, deliveryFee = 0, status = 'completed' }) {
  const number = (counters.get(date) ?? 0) + 1
  counters.set(date, number)
  const subtotal = lines.filter((l) => l.kind !== 'combo_child').reduce((sum, l) => sum + l.total, 0)
  const orderId = Number(db.prepare(
    `INSERT INTO orders (daily_number, order_date, order_type, status, subtotal, discount_amount, delivery_fee, total, created_at)
     VALUES (?, ?, 'local', ?, ?, 0, ?, ?, ?)`
  ).run(number, date, status, subtotal, deliveryFee, subtotal + deliveryFee, localInstant(date, time).toISOString()).lastInsertRowid)
  const ids = []
  for (const line of lines) {
    const parent = line.parent === undefined ? null : ids[line.parent]
    const id = Number(db.prepare(
      `INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price, total_price, line_kind, parent_order_item_id, allocated_revenue)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(orderId, line.id, line.qty, line.total / line.qty, line.total, line.kind ?? 'item', parent, line.allocated ?? null).lastInsertRowid)
    ids.push(id)
    for (const [optionId, qty, kind] of line.mods ?? []) {
      db.prepare(
        `INSERT INTO order_item_modifiers (order_item_id, option_id, name, kind, quantity) VALUES (?, ?, ?, ?, ?)`
      ).run(id, optionId, `opt ${optionId}`, kind, qty)
    }
  }
  return orderId
}

/** One "day" of sales: 2 combos (children: burger w/ extra cheese ×1 + no onions, fries, cola) + 3 plain burgers w/ cheese ×2. */
function daySales(db, date, extra = {}) {
  order(db, {
    date, time: '12:10', ...extra,
    lines: [
      { id: 4, qty: 2, total: 1400, kind: 'combo' },
      { id: 1, qty: 2, total: 0, kind: 'combo_child', parent: 0, allocated: 875, mods: [[2, 1, 'extra'], [3, 1, 'no']] },
      { id: 2, qty: 2, total: 0, kind: 'combo_child', parent: 0, allocated: 350 },
      { id: 3, qty: 2, total: 0, kind: 'combo_child', parent: 0, allocated: 175 }
    ]
  })
  order(db, { date, time: '19:30', lines: [{ id: 1, qty: 3, total: 1980, mods: [[1, 1, 'none'], [2, 2, 'extra']] }] })
}

test('forecast: combo children count as items, combo parents apart, stock-using options forecast', () => {
  const { db, done } = freshDb()
  try {
    seedCatalog(db)
    for (let w = 1; w <= 3; w++) daySales(db, addDays(D, -7 * w))
    const f = buildForecast(db, D, { trend: false })
    assert.equal(f.method, 'weekday')
    assert.deepEqual(f.items.map((i) => [i.name, i.expected]), [['Burger', 5], ['Cola', 2], ['Fries', 2]])
    assert.deepEqual(f.combos.map((i) => [i.name, i.expected]), [['Menu Maxi', 2]])
    // Extra cheese: 2 combo burgers × 1 + 3 burgers × 2 = 8; Ketchup 3; "No onions" never.
    assert.deepEqual(f.options.map((o) => [o.name, o.expected]), [['Extra cheese', 8], ['Ketchup', 3]])
    assert.equal(f.expectedRevenue, 3380, 'net order totals (no delivery fees here)')

    const list = buildShoppingList(db, D, { forecast: f })
    const byName = Object.fromEntries(list.items.map((i) => [i.name, i]))
    assert.equal(byName.Cheese.need, 0.16, '8 × 20 g')
    assert.equal(byName.Cheese.toBuy, 0.2)
    assert.equal(byName.Cheese.critical, true)
    assert.ok(byName.Cheese.usedBy.some((u) => u.name === 'Extra cheese' && u.menuItemId === 0))
    assert.equal(byName.Box.need, 2, 'combo own recipe (packaging) from the combo forecast')
    assert.equal(byName.Box.toBuy, 1, 'have 1, need 2')
    assert.equal(byName.Onion, undefined, "kind 'no' options never use stock")
    assert.equal(list.warnings.length, 0)
  } finally {
    done()
  }
})

test('menu profit: standard build (default options), combos from default picks, allocated child revenue', () => {
  const { db, done } = freshDb()
  try {
    seedCatalog(db)
    daySales(db, addDays(D, -2))
    const report = buildMenuProfit(db, addDays(D, -7), D, { marginWarnPct: 30, now: localInstant(D, '10:00') })
    const burger = report.items.find((i) => i.name === 'Burger')
    // 0.15 kg × 1000 + 1 bun × 20 + default Ketchup 0.01 L × 300 = 173
    assert.equal(burger.cost, 173)
    assert.equal(burger.isCombo, false)
    const ketchup = burger.ingredients.find((i) => i.name === 'Ketchup')
    assert.equal(ketchup.via.name, 'Ketchup')
    assert.equal(ketchup.cost, 3)
    assert.ok(!burger.ingredients.some((i) => i.name === 'Cheese'), 'non-default options are not in the standard build')
    assert.equal(burger.qtySold, 5, '2 in combos + 3 alone')
    assert.equal(burger.revenue, 875 + 1980, 'combo share at allocated revenue')

    const combo = report.items.find((i) => i.name === 'Menu Maxi')
    assert.equal(combo.isCombo, true)
    // box 10 + burger 173 + fries 0.2 × 100 = 20 + cola 50 = 253
    assert.equal(combo.cost, 253)
    assert.equal(combo.marginDa, 447)
    assert.equal(combo.qtySold, 2)
    assert.equal(combo.revenue, 1400)
    assert.equal(combo.quadrant, null, 'combos stay out of the quadrants')
    assert.ok(combo.ingredients.some((i) => i.name === 'Ketchup' && i.via.name === 'Burger · Ketchup'))
    assert.ok(combo.ingredients.some((i) => i.name === 'Potato' && i.via.name === 'Fries'))
    assert.ok(burger.quadrant, 'items with a recipe still get a quadrant')
  } finally {
    done()
  }
})

test('dashboard: revenue net of delivery fees, top items skip combo parents, hourly vs usual, telegram flag', () => {
  const { db, done } = freshDb()
  try {
    seedCatalog(db)
    for (let w = 1; w <= 2; w++) daySales(db, addDays(D, -7 * w))
    daySales(db, D, { deliveryFee: 150 })
    const settings = { ...DEFAULT_INSIGHTS_SETTINGS, alertLowStock: false }
    const s = buildDashboardSummary(db, { now: localInstant(D, '21:00'), settings, lang: 'en', currency: 'DA' })
    assert.equal(s.today.revenue, 3380, 'delivery fee is not revenue')
    assert.equal(s.deliveryFeesToday, 150)
    assert.equal(s.today.orders, 2)
    assert.deepEqual(s.topItemsToday.map((i) => [i.name, i.quantity, i.revenue]), [
      ['Burger', 5, 2855], ['Fries', 2, 350], ['Cola', 2, 175]
    ])
    assert.equal(s.topItemsToday[0].categoryId, 1)
    assert.equal(s.hourly.length, 24)
    assert.deepEqual([s.hourly[12].orders, s.hourly[12].revenue], [1, 1400])
    assert.deepEqual([s.hourly[19].usualOrders, s.hourly[19].usualRevenue], [1, 1980])
    assert.equal(s.hourly[15].usualOrders, 0)

    const low = s.pendingAlerts.find((a) => a.kind === 'low_stock')
    assert.ok(low, 'still shown in the app with its Telegram toggle off')
    assert.equal(low.telegramEnabled, false)
    const all = evaluateAlerts(db, { now: localInstant(D, '21:00'), settings: DEFAULT_INSIGHTS_SETTINGS, lang: 'en', currency: 'DA' })
    assert.ok(all.filter((a) => a.kind === 'low_stock').every((a) => a.telegramEnabled === true))
  } finally {
    done()
  }
})
