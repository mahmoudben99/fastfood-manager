// Insights — scheduler: morning prep timing, per-day dedupe (persisted), backoff, toggles,
// grouped alerts, language. Telegram send is mocked.
import test from 'node:test'
import assert from 'node:assert/strict'
import { addDays, freshDb, localInstant, seedMenu, seedOrder, seedRecipes, seedStock, setSettings, src, weekdayOf } from './helpers.mjs'

const { createInsightsScheduler, readSentKeys, ALERT_EVAL_INTERVAL_MS } = await src('main/services/insights/scheduler.ts')

const TODAY = '2026-09-26'

function seed(db) {
  seedMenu(db, [{ id: 1, name: 'Burger', name_fr: 'Burger maison', price: 500, category: 1 }])
  seedStock(db, [{ id: 1, name: 'Beef', unit: 'kg', quantity: 0.5, price: 1000, threshold: 1 }])
  seedRecipes(db, [[1, 1, 150, 'g']])
  for (let w = 1; w <= 4; w++) {
    seedOrder(db, { date: addDays(TODAY, -7 * w), lines: [[1, 10, 500]] })
    seedOrder(db, { date: addDays(addDays(TODAY, 1), -7 * w), lines: [[1, 10, 500]] }) // history for tomorrow too
  }
}

function harness(db, { configured = true, sendResult = () => true } = {}) {
  const sent = []
  let now = localInstant(TODAY, '08:00')
  const scheduler = createInsightsScheduler({
    db: () => db,
    now: () => now,
    send: async (html) => { const ok = sendResult(html); if (ok) sent.push(html); return ok },
    telegramConfigured: () => configured,
    log: () => {}
  })
  return { sent, scheduler, at: (date, time) => { now = localInstant(date, time) }, tick: () => scheduler.tick() }
}

test('morning prep: sent once after the configured time, never twice the same day (even after restart)', async () => {
  const { db, done } = freshDb()
  try {
    seed(db)
    const h = harness(db)
    h.at(TODAY, '08:59')
    assert.deepEqual((await h.tick()).sent.filter((k) => k === 'morning_prep'), [])
    h.at(TODAY, '09:01')
    const report = await h.tick()
    assert.ok(report.sent.includes('morning_prep'))
    const message = h.sent.find((m) => m.includes('Prep plan'))
    assert.match(message, /Burger × 10/)
    assert.match(message, /Beef: 2 kg \(have 0\.5 kg, today needs 1\.5 kg\)/)
    assert.ok(readSentKeys(db, TODAY).has('morning_prep'))
    // The critical beef line was in the morning message → no separate low-stock alert today.
    assert.ok(readSentKeys(db, TODAY).has('low_stock:1'))
    assert.ok(!h.sent.some((m) => m.includes('Stock too low')))

    h.at(TODAY, '09:02')
    assert.deepEqual((await h.tick()).sent, [])
    // A restart (new scheduler, same database) does not resend.
    const restarted = harness(db)
    restarted.at(TODAY, '10:00')
    assert.deepEqual((await restarted.tick()).sent, [])
    // Next day it goes out again.
    restarted.at(addDays(TODAY, 1), '09:05')
    assert.ok((await restarted.tick()).sent.includes('morning_prep'))
  } finally {
    done()
  }
})

test('morning prep: custom time, 6-hour catch-up window, toggle and closed day respected', async () => {
  const { db, done } = freshDb()
  try {
    seed(db)
    setSettings(db, { telegram_morning_prep_time: '07:30' })
    const h = harness(db)
    h.at(TODAY, '13:31') // 6 h 1 min after 07:30 → too late
    assert.ok(!(await h.tick()).sent.includes('morning_prep'))
    h.at(TODAY, '13:29')
    h.scheduler.reset()
    assert.ok((await h.tick()).sent.includes('morning_prep'))

    setSettings(db, { telegram_morning_prep: 'false' })
    h.at(addDays(TODAY, 1), '08:00')
    assert.ok(!(await h.tick()).sent.includes('morning_prep'))

    setSettings(db, { telegram_morning_prep: 'true' })
    db.prepare("UPDATE work_schedule SET status = 'closed' WHERE day_of_week = ?").run(weekdayOf(addDays(TODAY, 1)))
    assert.ok(!(await h.tick()).sent.includes('morning_prep'))
  } finally {
    done()
  }
})

test('scheduler: a failed send backs off 10 minutes, then retries; nothing without Telegram config', async () => {
  const { db, done } = freshDb()
  try {
    seed(db)
    let online = false
    const h = harness(db, { sendResult: () => online })
    h.at(TODAY, '09:00')
    assert.ok((await h.tick()).failed.includes('morning_prep'))
    assert.ok(!readSentKeys(db, TODAY).has('morning_prep'))
    online = true
    h.at(TODAY, '09:05')
    assert.ok(!(await h.tick()).sent.includes('morning_prep'), 'still backing off')
    h.at(TODAY, '09:11')
    assert.ok((await h.tick()).sent.includes('morning_prep'))

    const off = harness(db, { configured: false })
    off.at(addDays(TODAY, 1), '09:30')
    const report = await off.tick()
    assert.equal(report.skipped, 'telegram_not_configured')
    assert.deepEqual(off.sent, [])
  } finally {
    done()
  }
})

test('alerts: one grouped message per kind, deduped per day, evaluated every 5 minutes, toggles honoured', async () => {
  const { db, done } = freshDb()
  try {
    seed(db)
    setSettings(db, { telegram_morning_prep: 'false' })
    for (let n = 0; n < 4; n++) seedOrder(db, { date: TODAY, status: 'cancelled', lines: [[1, 1, 500]] })
    const h = harness(db)
    h.at(TODAY, '15:00')
    const first = await h.tick()
    assert.ok(first.sent.includes('cancellations'))
    assert.equal(h.sent.filter((m) => m.includes('Unusual cancellations')).length, 1)
    // Low stock was not covered by a morning message today → its own grouped alert.
    assert.ok(first.sent.includes('low_stock'))
    assert.match(h.sent.find((m) => m.includes('Stock too low')), /📦 <b>Stock too low for today<\/b>\nBeef: have 0\.5 kg/)

    seedOrder(db, { date: TODAY, status: 'cancelled', lines: [[1, 1, 500]] })
    h.at(TODAY, '15:01')
    assert.deepEqual((await h.tick()).sent, [], 'not re-evaluated within 5 minutes')
    h.at(TODAY, '15:10') // ≥ ALERT_EVAL_INTERVAL_MS later: evaluated again, but already sent today
    assert.ok(ALERT_EVAL_INTERVAL_MS <= 10 * 60_000)
    assert.deepEqual((await h.tick()).sent, [], 'already sent today')

    // Toggle off: tomorrow's cancellations are not sent.
    setSettings(db, { telegram_alert_cancellations: 'false' })
    for (let n = 0; n < 4; n++) seedOrder(db, { date: addDays(TODAY, 1), status: 'cancelled', lines: [[1, 1, 500]] })
    h.at(addDays(TODAY, 1), '15:00')
    assert.ok(!(await h.tick()).sent.includes('cancellations'))
  } finally {
    done()
  }
})

test('scheduler: messages follow the app language (fr)', async () => {
  const { db, done } = freshDb()
  try {
    seed(db)
    setSettings(db, { language: 'fr', currency_symbol: 'DA' })
    const h = harness(db)
    h.at(TODAY, '09:00')
    await h.tick()
    const message = h.sent.find((m) => m.includes('Plan de préparation'))
    assert.ok(message, 'French title')
    assert.match(message, /Burger maison × 10/)
    assert.match(message, /À acheter/)
  } finally {
    done()
  }
})
