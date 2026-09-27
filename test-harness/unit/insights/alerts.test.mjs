// Insights — owner alert thresholds (cancellations, discounts, slow day, low stock, margin).
import test from 'node:test'
import assert from 'node:assert/strict'
import { addDays, freshDb, localInstant, seedMenu, seedOrder, seedPurchase, seedRecipes, seedStock, src, weekdayOf } from './helpers.mjs'

const { evaluateAlerts } = await src('main/services/insights/alerts.ts')
const { DEFAULT_INSIGHTS_SETTINGS } = await src('shared/insights.ts')

const TODAY = '2026-09-26'
const ctx = (now, extra = {}) => ({ now, settings: { ...DEFAULT_INSIGHTS_SETTINGS }, lang: 'en', currency: 'DA', ...extra })

function menu(db) {
  seedMenu(db, [
    { id: 1, name: 'Burger', price: 500, category: 1 },
    { id: 2, name: 'Big Burger', price: 1200, category: 1 }
  ])
}

test('cancellations: ≥ 3, above mean + 2·sd and ≥ 2 × mean of the last 28 days; operator lines from audit_events', () => {
  const { db, done } = freshDb()
  try {
    menu(db)
    for (let back = 1; back <= 28; back++) {
      seedOrder(db, { date: addDays(TODAY, -back), lines: [[1, 1, 500]] })
      seedOrder(db, { date: addDays(TODAY, -back), status: 'cancelled', lines: [[1, 1, 500]] })
    }
    const now = localInstant(TODAY, '15:00')
    const kinds = ['cancellations']
    seedOrder(db, { date: TODAY, lines: [[1, 1, 500]] })
    const c1 = seedOrder(db, { date: TODAY, status: 'cancelled', lines: [[1, 2, 500]] })
    seedOrder(db, { date: TODAY, status: 'cancelled', lines: [[1, 2, 500]] })
    assert.deepEqual(evaluateAlerts(db, ctx(now, { kinds })), [], '2 cancellations is below the minimum of 3')

    seedOrder(db, { date: TODAY, status: 'cancelled', lines: [[1, 2, 500]] })
    db.prepare(
      `INSERT INTO audit_events (event_type, order_id, original_value, new_value, operator, created_at)
       VALUES ('void', ?, 'preparing', 'cancelled', 'Amine', '2026-09-26 12:00:00')`
    ).run(c1)
    const [alert] = evaluateAlerts(db, ctx(now, { kinds, sentKeys: new Set(['cancellations']) }))
    assert.equal(alert.kind, 'cancellations')
    assert.equal(alert.key, 'cancellations')
    assert.equal(alert.sent, true)
    assert.equal(alert.data.count, 3)
    assert.equal(alert.data.baselineMean, 1)
    assert.equal(alert.data.cancelledValue, 3000)
    assert.match(alert.message, /3 orders cancelled today \(usually ~1 a day\)\. Cancelled value: 3 000 DA\./)
    assert.match(alert.message, /Amine: 1 cancelled, 0 price changes/)
  } finally {
    done()
  }
})

test('cancellations: a restaurant that usually cancels 3 a day is not alerted at 4', () => {
  const { db, done } = freshDb()
  try {
    menu(db)
    for (let back = 1; back <= 28; back++) {
      for (let n = 0; n < 3; n++) seedOrder(db, { date: addDays(TODAY, -back), status: 'cancelled', lines: [[1, 1, 500]] })
    }
    for (let n = 0; n < 4; n++) seedOrder(db, { date: TODAY, status: 'cancelled', lines: [[1, 1, 500]] })
    assert.deepEqual(evaluateAlerts(db, ctx(localInstant(TODAY, '20:00'), { kinds: ['cancellations'] })), [])
  } finally {
    done()
  }
})

test('discounts: above mean + 2·sd, ≥ 1.5 × mean, ≥ 2 discounted orders, ≥ 5 % of sales', () => {
  const { db, done } = freshDb()
  try {
    menu(db)
    for (let back = 1; back <= 28; back++) {
      for (let n = 0; n < 2; n++) seedOrder(db, { date: addDays(TODAY, -back), discount: 100, lines: [[1, 2, 500]] })
    }
    const now = localInstant(TODAY, '15:00')
    seedOrder(db, { date: TODAY, discount: 120, lines: [[1, 2, 500]] })
    seedOrder(db, { date: TODAY, discount: 120, lines: [[1, 2, 500]] })
    assert.deepEqual(evaluateAlerts(db, ctx(now, { kinds: ['discounts'] })), [], '240 DA < 1.5 × 200')
    seedOrder(db, { date: TODAY, discount: 160, lines: [[1, 2, 500]] })
    const [alert] = evaluateAlerts(db, ctx(now, { kinds: ['discounts'] }))
    assert.equal(alert.kind, 'discounts')
    assert.equal(alert.data.discount, 400)
    assert.equal(alert.data.discountedOrders, 3)
    assert.equal(alert.data.sharePct, 13.3)
    assert.equal(alert.sent, false)
  } finally {
    done()
  }
})

function slowDaySeed(db) {
  menu(db)
  for (let w = 1; w <= 6; w++) {
    seedOrder(db, { date: addDays(TODAY, -7 * w), time: '12:00', lines: [[1, 20, 500]] }) // 10 000 by noon
    seedOrder(db, { date: addDays(TODAY, -7 * w), time: '20:00', lines: [[1, 10, 500]] }) // not "so far" at 15:00
  }
}

test('slow day: after the check time, revenue so far < 70 % of the same-weekday revenue by that time', () => {
  const { db, done } = freshDb()
  try {
    slowDaySeed(db)
    seedOrder(db, { date: TODAY, time: '12:30', lines: [[1, 6, 500]] }) // 3 000
    assert.deepEqual(evaluateAlerts(db, ctx(localInstant(TODAY, '13:59'), { kinds: ['slow_day'] })), [], 'before 14:00')
    const [alert] = evaluateAlerts(db, ctx(localInstant(TODAY, '15:00'), { kinds: ['slow_day'] }))
    assert.equal(alert.kind, 'slow_day')
    assert.deepEqual([alert.data.revenue, alert.data.expected, alert.data.pct, alert.data.asOf], [3000, 10000, 30, '15:00'])
    assert.match(alert.message, /Revenue so far: 3 000 DA at 15:00 — usually ~10 000 DA by this time/)

    // Closed today per the work schedule → no slow-day alert.
    db.prepare("UPDATE work_schedule SET status = 'closed' WHERE day_of_week = ?").run(weekdayOf(TODAY))
    assert.deepEqual(evaluateAlerts(db, ctx(localInstant(TODAY, '15:00'), { kinds: ['slow_day'] })), [])
  } finally {
    done()
  }
})

test('slow day: 80 % of usual is fine; the threshold is configurable', () => {
  const { db, done } = freshDb()
  try {
    slowDaySeed(db)
    seedOrder(db, { date: TODAY, time: '11:00', lines: [[1, 16, 500]] }) // 8 000
    const now = localInstant(TODAY, '15:00')
    assert.deepEqual(evaluateAlerts(db, ctx(now, { kinds: ['slow_day'] })), [])
    const strict = { ...DEFAULT_INSIGHTS_SETTINGS, slowDayThresholdPct: 90 }
    assert.equal(evaluateAlerts(db, ctx(now, { kinds: ['slow_day'], settings: strict })).length, 1)
  } finally {
    done()
  }
})

test('low stock: stock below what today\'s forecast needs, critical when nothing is left', () => {
  const { db, done } = freshDb()
  try {
    menu(db)
    seedStock(db, [
      { id: 1, name: 'Beef', unit: 'kg', quantity: 1, price: 1000 },
      { id: 2, name: 'Buns', unit: 'unit', quantity: 0, price: 30 },
      { id: 3, name: 'Salt', unit: 'kg', quantity: 5, price: 50 }
    ])
    seedRecipes(db, [[1, 1, 150, 'g'], [1, 2, 1, 'unit'], [1, 3, 1, 'g']])
    for (let w = 1; w <= 3; w++) seedOrder(db, { date: addDays(TODAY, -7 * w), lines: [[1, 10, 500]] })
    const alerts = evaluateAlerts(db, ctx(localInstant(TODAY, '09:00'), { kinds: ['low_stock'] }))
    assert.deepEqual(alerts.map((a) => [a.key, a.severity]).sort(), [['low_stock:1', 'warning'], ['low_stock:2', 'critical']])
    assert.match(alerts.find((a) => a.key === 'low_stock:1').message, /Beef: have 1 kg, today needs ~1.5 kg/)
  } finally {
    done()
  }
})

test('margin alarm: a purchase today that pushes an item from ≥ threshold to below it', () => {
  const { db, done } = freshDb()
  try {
    menu(db)
    seedStock(db, [{ id: 1, name: 'Beef', unit: 'kg', quantity: 5, price: 1000 }, { id: 2, name: 'Buns', unit: 'unit', quantity: 50, price: 30 }])
    seedRecipes(db, [[1, 1, 150, 'g'], [1, 2, 1, 'unit'], [2, 1, 150, 'g'], [2, 2, 1, 'unit']])
    seedPurchase(db, { stockItemId: 1, price: 1000, at: '2026-09-10 09:00:00' })
    const now = localInstant(TODAY, '15:00')

    // 1000 → 2000: burger cost 330, margin 34 % — still above 30 %.
    seedPurchase(db, { stockItemId: 1, price: 2000, at: '2026-09-26 08:00:00' })
    assert.deepEqual(evaluateAlerts(db, ctx(now, { kinds: ['margin'] })), [])

    // 2000 → 2500: cost 405, margin 19 %; the big burger (66 %) stays fine.
    seedPurchase(db, { stockItemId: 1, price: 2500, at: '2026-09-26 09:00:00' })
    const alerts = evaluateAlerts(db, ctx(now, { kinds: ['margin'] }))
    assert.equal(alerts.length, 1)
    assert.equal(alerts[0].key, 'margin:1')
    assert.deepEqual([alerts[0].data.marginBeforePct, alerts[0].data.marginAfterPct, alerts[0].data.fromPrice, alerts[0].data.toPrice], [34, 19, 2000, 2500])
    assert.match(alerts[0].message, /Burger: margin 19% \(below 30%\) after Beef went from 2 000 to 2 500 DA\/kg/)

    // The same purchases seen tomorrow are no longer "today".
    assert.deepEqual(evaluateAlerts(db, ctx(localInstant(addDays(TODAY, 1), '15:00'), { kinds: ['margin'] })), [])
  } finally {
    done()
  }
})

test('margin alarm: the first ever purchase of an ingredient has nothing to compare with', () => {
  const { db, done } = freshDb()
  try {
    menu(db)
    seedStock(db, [{ id: 1, name: 'Beef', unit: 'kg', quantity: 5, price: 1000 }])
    seedRecipes(db, [[1, 1, 150, 'g']])
    seedPurchase(db, { stockItemId: 1, price: 3000, at: '2026-09-26 08:00:00' })
    assert.deepEqual(evaluateAlerts(db, ctx(localInstant(TODAY, '15:00'), { kinds: ['margin'] })), [])
  } finally {
    done()
  }
})

test('alerts: French and Arabic wording follow the app language', () => {
  const { db, done } = freshDb()
  try {
    slowDaySeed(db)
    const now = localInstant(TODAY, '15:00')
    const [fr] = evaluateAlerts(db, ctx(now, { kinds: ['slow_day'], lang: 'fr' }))
    assert.equal(fr.title, 'Journée calme')
    const [ar] = evaluateAlerts(db, ctx(now, { kinds: ['slow_day'], lang: 'ar' }))
    assert.equal(ar.title, 'يوم هادئ')
  } finally {
    done()
  }
})
