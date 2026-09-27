// Insights — prep forecast math (weekday weighting, little-history fallback, trend factor).
import test from 'node:test'
import assert from 'node:assert/strict'
import { addDays, freshDb, seedMenu, seedOrder, src } from './helpers.mjs'

const { buildForecast } = await src('main/services/insights/forecast.ts')

const D = '2026-09-26'

function menu(db) {
  seedMenu(db, [
    { id: 1, name: 'Burger', price: 500, category: 1 },
    { id: 2, name: 'Fries', price: 200, category: 2 },
    { id: 3, name: 'Retired', price: 100, category: 1, active: false }
  ])
}

test('forecast: same weekday, recent weeks weigh more (6,5,4…), closed weeks and cancelled orders ignored', () => {
  const { db, done } = freshDb()
  try {
    menu(db)
    seedOrder(db, { date: addDays(D, -7), lines: [[1, 10, 500], [2, 6, 200]] })
    seedOrder(db, { date: addDays(D, -7), lines: [[3, 5, 100]] })
    seedOrder(db, { date: addDays(D, -7), status: 'cancelled', lines: [[1, 50, 500]] })
    seedOrder(db, { date: addDays(D, -14), lines: [[1, 20, 500]] })
    seedOrder(db, { date: addDays(D, -21), lines: [[1, 30, 500]] })
    // Another weekday must not leak into a weekday forecast.
    seedOrder(db, { date: addDays(D, -1), lines: [[1, 100, 500]] })

    const f = buildForecast(db, D, { trend: false })
    assert.equal(f.method, 'weekday')
    assert.deepEqual(f.sampleDays, [addDays(D, -21), addDays(D, -14), addDays(D, -7)])
    assert.equal(f.confidence, 'medium')
    assert.equal(f.trendFactor, 1)
    const burger = f.items.find((i) => i.menuItemId === 1)
    const fries = f.items.find((i) => i.menuItemId === 2)
    // (10·6 + 20·5 + 30·4) / 15 = 18.67 — not the plain mean (20).
    assert.equal(burger.expected, 18.7)
    assert.equal(burger.rounded, 19)
    // Fries sold on one of the three open days only: 6·6 / 15.
    assert.equal(fries.expected, 2.4)
    assert.equal(fries.rounded, 2)
    assert.ok(!f.items.some((i) => i.menuItemId === 3), 'inactive menu items are not forecast')
    assert.equal(f.items[0].menuItemId, 1, 'highest expected first')
    // Orders (2,1,1) and revenue (6700,10000,15000) weighted the same way.
    assert.equal(f.expectedOrders, Math.round((2 * 6 + 5 + 4) / 15))
    assert.equal(f.expectedRevenue, Math.round((6700 * 6 + 10000 * 5 + 15000 * 4) / 15))
  } finally {
    done()
  }
})

test('forecast: ≥ 4 open same-weekday samples → high confidence', () => {
  const { db, done } = freshDb()
  try {
    menu(db)
    for (let w = 1; w <= 4; w++) seedOrder(db, { date: addDays(D, -7 * w), lines: [[1, 4, 500]] })
    const f = buildForecast(db, D, { trend: false })
    assert.equal(f.confidence, 'high')
    assert.equal(f.items[0].expected, 4)
  } finally {
    done()
  }
})

test('forecast: one same-weekday sample → falls back to the daily average of the last 28 days', () => {
  const { db, done } = freshDb()
  try {
    menu(db)
    seedOrder(db, { date: addDays(D, -7), lines: [[1, 10, 500]] })
    seedOrder(db, { date: addDays(D, -3), lines: [[1, 4, 500]] })
    seedOrder(db, { date: addDays(D, -2), lines: [[1, 7, 500], [2, 3, 200]] })
    seedOrder(db, { date: addDays(D, -40), lines: [[1, 99, 500]] }) // outside the 28-day window
    const f = buildForecast(db, D, { trend: false })
    assert.equal(f.method, 'daily_average')
    assert.equal(f.confidence, 'low')
    assert.equal(f.sampleDays.length, 3)
    assert.equal(f.items.find((i) => i.menuItemId === 1).expected, 7) // (10+4+7)/3
    assert.equal(f.items.find((i) => i.menuItemId === 2).expected, 1) // 3/3
  } finally {
    done()
  }
})

test('forecast: no history at all → method none, empty list, zero volume', () => {
  const { db, done } = freshDb()
  try {
    menu(db)
    const f = buildForecast(db, D)
    assert.equal(f.method, 'none')
    assert.deepEqual(f.items, [])
    assert.equal(f.expectedOrders, 0)
    assert.equal(f.expectedRevenue, 0)
  } finally {
    done()
  }
})

test('forecast: trend factor = recent vs older orders per open day, clamped to 1.15', () => {
  const { db, done } = freshDb()
  try {
    menu(db)
    for (let back = 1; back <= 56; back++) {
      const orders = back <= 14 ? 2 : 1
      for (let n = 0; n < orders; n++) seedOrder(db, { date: addDays(D, -back), lines: [[1, 1, 500]] })
    }
    const withTrend = buildForecast(db, D)
    assert.equal(withTrend.trendFactor, 1.15)
    // Weekday samples: 2,2 (recent) then 1,1,1,1 → 32/21, × 1.15.
    assert.equal(withTrend.items[0].expected, Math.round((32 / 21) * 1.15 * 10) / 10)
    const flat = buildForecast(db, D, { trend: false })
    assert.equal(flat.trendFactor, 1)
    assert.equal(flat.items[0].expected, Math.round((32 / 21) * 10) / 10)
  } finally {
    done()
  }
})

test('forecast: rejects an invalid date', () => {
  const { db, done } = freshDb()
  try {
    assert.throws(() => buildForecast(db, '2026-02-30'), /YYYY-MM-DD/)
    assert.throws(() => buildForecast(db, 'tomorrow'), /YYYY-MM-DD/)
  } finally {
    done()
  }
})
