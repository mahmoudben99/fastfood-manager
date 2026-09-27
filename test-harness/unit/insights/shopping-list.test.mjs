// Insights — shopping list: recipe unit conversion, thresholds, rounding, latest purchase price.
import test from 'node:test'
import assert from 'node:assert/strict'
import { addDays, freshDb, seedMenu, seedOrder, seedPurchase, seedRecipes, seedStock, src } from './helpers.mjs'

const { buildShoppingList, roundPurchase } = await src('main/services/insights/shopping-list.ts')

const D = '2026-09-26'

function syntheticForecast(items) {
  return {
    date: D, weekday: 6, method: 'weekday', sampleDays: [], confidence: 'high', trendFactor: 1,
    expectedOrders: 0, expectedRevenue: 0,
    items: items.map(([menuItemId, expected, name]) => ({
      menuItemId, name, name_ar: null, name_fr: null, categoryId: 1, expected, rounded: Math.round(expected)
    }))
  }
}

function seed(db) {
  seedMenu(db, [
    { id: 1, name: 'Burger', price: 500, category: 1 },
    { id: 2, name: 'Wrap', price: 400, category: 1 }
  ])
  seedStock(db, [
    { id: 1, name: 'Beef', unit: 'kg', quantity: 1, price: 1100, threshold: 2 },
    { id: 2, name: 'Buns', unit: 'unit', quantity: 5, price: 25, threshold: 10 },
    { id: 3, name: 'Sauce', unit: 'liter', quantity: 0, price: 300, threshold: 0 },
    { id: 4, name: 'Oil', unit: 'liter', quantity: 1, price: 250, threshold: 5 },
    { id: 5, name: 'Cheese', unit: 'kg', quantity: 50, price: 900, threshold: 1 },
    { id: 6, name: 'Tortilla', unit: 'unit', quantity: 30, price: 15, threshold: 5 }
  ])
  seedRecipes(db, [
    [1, 1, 150, 'g'],      // 150 g beef per burger → 0.15 kg
    [1, 2, 1, 'unit'],
    [1, 3, 20, 'ml'],      // 20 ml sauce → 0.02 L
    [1, 5, 20, 'g'],
    [2, 6, 1, 'pcs'],
    [2, 1, 100, 'ml']      // unit mismatch: ml on a kg stock item → warning, skipped
  ])
  seedPurchase(db, { stockItemId: 1, price: 1000, at: '2026-09-01 08:00:00' })
  seedPurchase(db, { stockItemId: 1, price: 1200, at: '2026-09-20 08:00:00' })
  // A negative correction row from stockRepo.fix() is not a purchase price.
  seedPurchase(db, { stockItemId: 1, quantity: -2, price: 900, at: '2026-09-25 08:00:00' })
}

test('shopping list: needs via unit conversion, threshold top-up, rounding, latest purchase price', () => {
  const { db, done } = freshDb()
  try {
    seed(db)
    const list = buildShoppingList(db, D, { forecast: syntheticForecast([[1, 20, 'Burger'], [2, 10, 'Wrap']]) })
    const byName = Object.fromEntries(list.items.map((i) => [i.name, i]))

    // Beef: need 20 × 0.15 = 3 kg, have 1, threshold 2 → 4 kg to buy @ 1200 (latest real purchase).
    assert.equal(byName.Beef.need, 3)
    assert.equal(byName.Beef.toBuyExact, 4)
    assert.equal(byName.Beef.toBuy, 4)
    assert.equal(byName.Beef.unitCost, 1200)
    assert.equal(byName.Beef.estCost, 4800)
    assert.equal(byName.Beef.critical, true)
    assert.equal(byName.Beef.reason, 'both')
    assert.deepEqual(byName.Beef.usedBy.map((u) => u.name), ['Burger'])

    // Buns: need 20, have 5, threshold 10 → 25 whole units; no purchase → stock item price.
    assert.equal(byName.Buns.toBuy, 25)
    assert.equal(byName.Buns.unitCost, 25)
    assert.equal(byName.Buns.estCost, 625)

    // Sauce: 20 ml × 20 = 0.4 L, nothing on hand → 0.4 L.
    assert.equal(byName.Sauce.need, 0.4)
    assert.equal(byName.Sauce.toBuy, 0.4)
    assert.equal(byName.Sauce.estCost, 120)

    // Oil is not in any recipe but is below its threshold → low_stock top-up to 5 L.
    assert.equal(byName.Oil.reason, 'low_stock')
    assert.equal(byName.Oil.toBuy, 4)
    assert.equal(byName.Oil.critical, false)

    // Cheese (plenty) and Tortilla (10 needed, 30 on hand) need nothing.
    assert.equal(byName.Cheese, undefined)
    assert.equal(byName.Tortilla, undefined)

    // The ml-on-kg recipe line is skipped and reported, not silently mis-converted.
    assert.equal(list.warnings.length, 1)
    assert.match(list.warnings[0], /Wrap: recipe unit ml does not match Beef \(kg\)/)

    assert.equal(list.items[0].critical, true, 'critical rows first')
    assert.equal(list.criticalCount, 3) // beef, buns, sauce all short of today's need
    assert.equal(list.totalEstCost, list.items.reduce((s, i) => s + i.estCost, 0))
  } finally {
    done()
  }
})

test('shopping list: built from the real forecast when none is passed', () => {
  const { db, done } = freshDb()
  try {
    seed(db)
    for (let w = 1; w <= 3; w++) seedOrder(db, { date: addDays(D, -7 * w), lines: [[1, 10, 500]] })
    const list = buildShoppingList(db, D, { trend: false })
    assert.equal(list.forecast.method, 'weekday')
    const beef = list.items.find((i) => i.name === 'Beef')
    assert.equal(beef.need, 1.5) // 10 burgers × 0.15 kg
    assert.equal(beef.toBuy, 2.5) // 1.5 + 2 − 1
  } finally {
    done()
  }
})

test('roundPurchase: 0.1 below 1, 0.5 below 10, 1 above, whole units for pieces', () => {
  assert.equal(roundPurchase(0.33, 'kg'), 0.4)
  assert.equal(roundPurchase(1, 'kg'), 1)
  assert.equal(roundPurchase(3.2, 'kg'), 3.5)
  assert.equal(roundPurchase(3.5, 'liter'), 3.5)
  assert.equal(roundPurchase(12.1, 'liter'), 13)
  assert.equal(roundPurchase(2.1, 'unit'), 3)
  assert.equal(roundPurchase(2, 'pcs'), 2)
  assert.equal(roundPurchase(0, 'kg'), 0)
  assert.equal(roundPurchase(-1, 'kg'), 0)
})

test('shopping list: mid-day, what today\'s orders already consumed is not needed again', () => {
  const { db, done } = freshDb()
  try {
    seed(db)
    // Today 8 burgers sold so far: 1.2 kg beef already deducted from stock (cancelled orders do not count).
    const sold = seedOrder(db, { date: D, lines: [[1, 8, 500]] })
    const cancelled = seedOrder(db, { date: D, status: 'cancelled', lines: [[1, 8, 500]] })
    for (const orderId of [sold, cancelled]) {
      const line = db.prepare('SELECT id FROM order_items WHERE order_id = ?').get(orderId)
      db.prepare('INSERT INTO order_item_deductions (order_item_id, stock_item_id, quantity_deducted, cost_per_unit) VALUES (?, 1, 1.2, 1200)').run(line.id)
    }
    db.prepare('UPDATE stock_items SET quantity = 3 WHERE id = 1').run()
    const list = buildShoppingList(db, D, { forecast: syntheticForecast([[1, 20, 'Burger']]) })
    const beef = list.items.find((i) => i.name === 'Beef')
    // Forecast 3 kg − 1.2 kg already used = 1.8 kg still needed; 3 kg on hand covers it.
    assert.equal(beef.consumedToday, 1.2)
    assert.equal(beef.need, 1.8)
    assert.equal(beef.critical, false)
    assert.equal(beef.toBuy, 0.8) // 1.8 + 2 (threshold) − 3 = 0.8 kg (0.1 steps below 1)
  } finally {
    done()
  }
})
