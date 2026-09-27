// Insights — upsell co-occurrence probabilities, filters, cache and lookup speed.
import test from 'node:test'
import assert from 'node:assert/strict'
import { performance } from 'node:perf_hooks'
import { addDays, freshDb, seedMenu, seedOrder, src } from './helpers.mjs'

const { buildUpsellModel, suggestFromModel, createUpsellCache } = await src('main/services/insights/upsell.ts')

const NOW = new Date('2026-09-26T10:00:00Z')
const TODAY = '2026-09-26'

function seed(db) {
  seedMenu(db, [
    { id: 1, name: 'Burger', price: 500, category: 1 },
    { id: 2, name: 'Double', price: 700, category: 1 },
    { id: 3, name: 'Fries', price: 200, category: 2 },
    { id: 4, name: 'Coke', price: 100, category: 3 },
    { id: 5, name: 'Pepsi', price: 100, category: 3 },
    { id: 6, name: 'Old Nuggets', price: 300, category: 2, active: false },
    { id: 7, name: 'Salad', price: 300, category: 2 }
  ])
  // 10 burger orders: 6 with fries, 3 with coke, 4 with a double, 2 with salad, 3 with (inactive) nuggets.
  for (let i = 0; i < 10; i++) {
    const lines = [[1, 1, 500]]
    if (i < 6) lines.push([3, 1, 200])
    if (i < 3) lines.push([4, 1, 100])
    if (i >= 6) lines.push([2, 1, 700])
    if (i === 8 || i === 9) lines.push([7, 1, 300])
    if (i >= 7) lines.push([6, 1, 300])
    seedOrder(db, { date: addDays(TODAY, -(i + 1)), lines })
  }
  // Coke orders: with fries 4 of 5 → P(fries|coke)=0.8.
  for (let i = 0; i < 5; i++) seedOrder(db, { date: addDays(TODAY, -2), lines: i < 4 ? [[4, 1, 100], [3, 1, 200]] : [[4, 1, 100]] })
  // Cancelled and too-old orders never count.
  for (let i = 0; i < 5; i++) seedOrder(db, { date: addDays(TODAY, -3), status: 'cancelled', lines: [[1, 1, 500], [5, 1, 100]] })
  for (let i = 0; i < 5; i++) seedOrder(db, { date: addDays(TODAY, -61), lines: [[1, 1, 500], [5, 1, 100]] })
}

test('upsell: P(B|A) with min support, same-category / in-cart / inactive items excluded', () => {
  const { db, done } = freshDb()
  try {
    seed(db)
    const model = buildUpsellModel(db, NOW)
    assert.equal(model.counts.get(1), 10, 'cancelled and > 60-day-old orders are ignored')
    const s = suggestFromModel(model, [1], 5)
    assert.deepEqual(s.map((x) => [x.name, x.percent, x.supportOrders]), [['Fries', 60, 6], ['Coke', 30, 3]])
    assert.equal(s[0].probability, 0.6)
    assert.equal(s[0].anchorMenuItemId, 1)
    assert.equal(s[0].anchorName, 'Burger')
    // Double (same category as the burger), Salad (support 2 < 3), nuggets (inactive), Pepsi
    // (only in cancelled/old orders) are never suggested.
    assert.ok(!s.some((x) => ['Double', 'Salad', 'Old Nuggets', 'Pepsi'].includes(x.name)))
  } finally {
    done()
  }
})

test('upsell: each suggestion keeps its best anchor; categories already in the cart are skipped', () => {
  const { db, done } = freshDb()
  try {
    seed(db)
    const model = buildUpsellModel(db, NOW)
    // Fries: 0.6 via burger, 10/8 orders via coke → P(fries|coke) = 7/8 (4 coke+fries, 3 burger+coke+fries).
    const s = suggestFromModel(model, [1, 4], 3)
    assert.equal(s.length, 1, 'drinks are in the cart already, so only fries remain')
    assert.equal(s[0].name, 'Fries')
    assert.equal(s[0].anchorName, 'Coke')
    assert.equal(s[0].percent, Math.round((7 / 8) * 100))
    assert.deepEqual(suggestFromModel(model, [1, 3, 4], 3), [], 'fries already in cart')
    assert.deepEqual(suggestFromModel(model, [], 3), [])
    assert.deepEqual(suggestFromModel(model, ['x', -1, 1.5], 3), [], 'junk ids are ignored')
    assert.equal(suggestFromModel(model, [1], 1).length, 1, 'limit respected')
  } finally {
    done()
  }
})

test('upsell cache: rebuilt only after the TTL (default 30 min) or on another database', () => {
  const { db, done } = freshDb()
  try {
    seed(db)
    const cache = createUpsellCache(30 * 60_000)
    const first = cache.suggestions(db, [1], 3, NOW)
    for (let i = 0; i < 10; i++) seedOrder(db, { date: TODAY, lines: [[1, 1, 500], [7, 1, 300]] })
    const cached = cache.suggestions(db, [1], 3, new Date(NOW.getTime() + 29 * 60_000))
    assert.deepEqual(cached, first, 'no rebuild inside the TTL')
    assert.equal(cache.isStale(db, new Date(NOW.getTime() + 30 * 60_000)), true)
    const rebuilt = cache.suggestions(db, [1], 3, new Date(NOW.getTime() + 31 * 60_000))
    assert.ok(rebuilt.some((x) => x.name === 'Salad'), 'new orders visible after the TTL')
  } finally {
    done()
  }
})

test('upsell speed: 60 days × 200 orders — cached lookups far under 20 ms', () => {
  const { db, done } = freshDb()
  try {
    const items = Array.from({ length: 40 }, (_, i) => ({ id: i + 1, name: `Item ${i + 1}`, price: 100 + i, category: (i % 3) + 1 }))
    seedMenu(db, items)
    let seedState = 42
    const rand = () => ((seedState = (seedState * 1103515245 + 12345) % 2 ** 31) / 2 ** 31)
    db.transaction(() => {
      for (let day = 1; day <= 60; day++) {
        for (let n = 0; n < 200; n++) {
          const count = 1 + Math.floor(rand() * 4)
          const lines = []
          const used = new Set()
          for (let k = 0; k < count; k++) {
            const id = 1 + Math.floor(rand() ** 2 * 40)
            if (!used.has(id)) { used.add(id); lines.push([id, 1, 100]) }
          }
          seedOrder(db, { date: addDays(TODAY, -day), lines })
        }
      }
    })()
    const cache = createUpsellCache()
    const buildStart = performance.now()
    cache.model(db, NOW)
    const buildMs = performance.now() - buildStart
    const times = []
    for (let i = 0; i < 500; i++) {
      const cart = [1 + (i % 40), 1 + ((i * 7) % 40), 1 + ((i * 13) % 40)]
      const start = performance.now()
      cache.suggestions(db, cart, 3, NOW)
      times.push(performance.now() - start)
    }
    times.sort((a, b) => a - b)
    const p99 = times[Math.floor(times.length * 0.99)]
    console.log(`# upsell model build ${buildMs.toFixed(1)} ms (12k orders); lookup p99 ${p99.toFixed(3)} ms`)
    assert.ok(p99 < 20, `cached lookup p99 ${p99} ms`)
    assert.ok(cache.suggestions(db, [1], 3, NOW).length > 0)
  } finally {
    done()
  }
})
