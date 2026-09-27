// Insights — menu profit: recipe cost, margins, flags, 30-day cost increase, quadrants.
import test from 'node:test'
import assert from 'node:assert/strict'
import { freshDb, seedMenu, seedOrder, seedPurchase, seedRecipes, seedStock, src } from './helpers.mjs'

const { buildMenuProfit, assignQuadrants } = await src('main/services/insights/profit.ts')

const NOW = new Date('2026-09-26T10:00:00Z')

function seed(db) {
  seedMenu(db, [
    { id: 1, name: 'Burger', price: 500, category: 1 },
    { id: 2, name: 'Cheap Burger', price: 250, category: 1 },
    { id: 3, name: 'Salad', price: 400, category: 2 },
    { id: 4, name: 'Water', price: 50, category: 3 }
  ])
  seedStock(db, [
    { id: 1, name: 'Beef', unit: 'kg', quantity: 10, price: 1100 },
    { id: 2, name: 'Buns', unit: 'unit', quantity: 100, price: 30 },
    { id: 3, name: 'Lettuce', unit: 'kg', quantity: 5, price: 200 }
  ])
  seedRecipes(db, [
    [1, 1, 150, 'g'], [1, 2, 1, 'unit'],
    [2, 1, 150, 'g'], [2, 2, 1, 'unit'],
    [3, 3, 250, 'g']
  ])
  // Beef: 1000/kg 40 days ago (the price effective 30 days ago), 1200/kg last week (+20 %).
  seedPurchase(db, { stockItemId: 1, price: 1000, at: '2026-08-17 09:00:00' })
  seedPurchase(db, { stockItemId: 1, price: 1200, at: '2026-09-19 09:00:00' })
}

test('menu profit: cost from recipe × latest unit cost, margin DA/%, food cost %', () => {
  const { db, done } = freshDb()
  try {
    seed(db)
    const report = buildMenuProfit(db, '2026-09-01', '2026-09-25', { marginWarnPct: 30, now: NOW })
    const burger = report.items.find((i) => i.menuItemId === 1)
    assert.equal(burger.cost, 210) // 0.15 kg × 1200 + 1 × 30
    assert.equal(burger.marginDa, 290)
    assert.equal(burger.marginPct, 58)
    assert.equal(burger.foodCostPct, 42)
    assert.equal(burger.ingredients.length, 2)
    assert.equal(burger.ingredients[0].stockQuantity, 0.15)
    assert.ok(!burger.flags.includes('low_margin'))

    const cheap = report.items.find((i) => i.menuItemId === 2)
    assert.equal(cheap.marginPct, 16)
    assert.ok(cheap.flags.includes('low_margin'), 'below profit_margin_warn_pct')

    const water = report.items.find((i) => i.menuItemId === 4)
    assert.equal(water.cost, null)
    assert.equal(water.quadrant, null)
    assert.deepEqual(water.flags, ['no_recipe'])
    assert.equal(report.counts.noRecipe, 1)
    assert.equal(report.counts.lowMargin, 1)
  } finally {
    done()
  }
})

test('menu profit: cost increase > 10 % over 30 days names the responsible ingredient', () => {
  const { db, done } = freshDb()
  try {
    seed(db)
    const report = buildMenuProfit(db, '2026-09-01', '2026-09-25', { marginWarnPct: 30, now: NOW })
    const burger = report.items.find((i) => i.menuItemId === 1)
    assert.ok(burger.flags.includes('cost_increase'))
    // 180 → 210 = +16.7 %; beef itself +20 %.
    assert.deepEqual(burger.costIncrease, {
      pct: 16.7, previousCost: 180, currentCost: 210, stockItemId: 1, stockItemName: 'Beef', ingredientPct: 20
    })
    const salad = report.items.find((i) => i.menuItemId === 3)
    assert.equal(salad.costIncrease, null, 'lettuce never changed price')
    assert.deepEqual(report.priceIncreases.map((p) => [p.name, p.fromPrice, p.toPrice, p.pct]), [['Beef', 1000, 1200, 20]])
  } finally {
    done()
  }
})

test('menu profit: a price change under 10 % is not flagged', () => {
  const { db, done } = freshDb()
  try {
    seed(db)
    seedPurchase(db, { stockItemId: 1, price: 1050, at: '2026-09-24 09:00:00' }) // latest: +5 % vs 1000
    const report = buildMenuProfit(db, '2026-09-01', '2026-09-25', { marginWarnPct: 30, now: NOW })
    assert.equal(report.items.find((i) => i.menuItemId === 1).costIncrease, null)
    assert.deepEqual(report.priceIncreases, [])
  } finally {
    done()
  }
})

test('menu engineering: popularity × margin → star / plowhorse / puzzle / dog', () => {
  const { db, done } = freshDb()
  try {
    seed(db)
    // Sold in range: burger 40 (high pop, margin 290), cheap 40 (high pop, margin 40),
    // salad 5 (low pop, margin 350). Outside range and cancelled orders do not count.
    seedOrder(db, { date: '2026-09-10', lines: [[1, 40, 500], [2, 40, 250], [3, 5, 400]] })
    seedOrder(db, { date: '2026-09-11', status: 'cancelled', lines: [[3, 100, 400]] })
    seedOrder(db, { date: '2026-08-01', lines: [[3, 100, 400]] })
    const report = buildMenuProfit(db, '2026-09-01', '2026-09-25', { marginWarnPct: 30, now: NOW })
    const q = Object.fromEntries(report.items.map((i) => [i.name, i.quadrant]))
    // avg item share = 85/3 = 28.3 → threshold 70 % = 19.83; weighted margin = (290·40+40·40+350·5)/85
    assert.equal(report.popularityThreshold, 19.83)
    assert.equal(report.averageMarginDa, Math.round(((290 * 40 + 40 * 40 + 350 * 5) / 85) * 100) / 100)
    assert.equal(q.Burger, 'star')
    assert.equal(q['Cheap Burger'], 'plowhorse')
    assert.equal(q.Salad, 'puzzle')
    assert.equal(q.Water, null)
    assert.equal(report.items.find((i) => i.name === 'Salad').qtySold, 5)
  } finally {
    done()
  }
})

test('assignQuadrants: dog = unpopular and below the average margin; no sales → no quadrant', () => {
  const item = (name, qtySold, marginDa) => ({ name, qtySold, marginDa, quadrant: null })
  const items = [item('A', 50, 300), item('B', 50, 100), item('C', 2, 300), item('D', 2, 50)]
  assignQuadrants(items)
  assert.deepEqual(items.map((i) => i.quadrant), ['star', 'plowhorse', 'puzzle', 'dog'])
  const none = [item('A', 0, 300)]
  assert.deepEqual(assignQuadrants(none), { averageMarginDa: 0, popularityThreshold: 0 })
  assert.equal(none[0].quadrant, null)
})

test('menu profit: rejects bad ranges', () => {
  const { db, done } = freshDb()
  try {
    assert.throws(() => buildMenuProfit(db, '2026-09-25', '2026-09-01', { marginWarnPct: 30 }), /Start date/)
    assert.throws(() => buildMenuProfit(db, '2020-01-01', '2026-09-01', { marginWarnPct: 30 }), /limited/)
  } finally {
    done()
  }
})
