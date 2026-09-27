// Insights — rush-hours heatmap buckets (weekday × local hour), best/worst, staffing blocks.
import test from 'node:test'
import assert from 'node:assert/strict'
import { addDays, freshDb, seedMenu, seedOrder, src, weekdayOf } from './helpers.mjs'

const { buildRushHours } = await src('main/services/insights/rush-hours.ts')

const START = '2026-09-06'

test('rush hours: UTC timestamps bucket into LOCAL hours (UTC+1), weekday from order_date', () => {
  const { db, done } = freshDb()
  try {
    seedMenu(db, [{ id: 1, name: 'Burger', price: 500 }])
    const day = START
    seedOrder(db, { date: day, time: '12:30', lines: [[1, 2, 500]] })                         // ISO, local 12:30
    seedOrder(db, { date: day, createdAt: `${day} 11:45:00`, lines: [[1, 1, 500]] })         // legacy UTC format → 12
    seedOrder(db, { date: day, time: '19:05', lines: [[1, 3, 500]] })
    seedOrder(db, { date: day, time: '12:10', status: 'cancelled', lines: [[1, 9, 500]] })
    const r = buildRushHours(db, START, START)
    const wd = weekdayOf(day)
    assert.deepEqual(r.cells.map((c) => [c.weekday, c.hour, c.orders, c.revenue]), [[wd, 12, 2, 1500], [wd, 19, 1, 1500]])
    const noon = r.cells[0]
    assert.equal(noon.avgTicket, 750)
    assert.equal(noon.avgOrders, 2)
    assert.equal(r.openDays[wd], 1)
    assert.deepEqual(r.byHour.map((h) => [h.hour, h.orders]), [[12, 2], [19, 1]])
  } finally {
    done()
  }
})

test('rush hours: averages per open weekday, best/worst ignore one-off hours, peak/quiet staffing blocks', () => {
  const { db, done } = freshDb()
  try {
    seedMenu(db, [{ id: 1, name: 'Burger', price: 500 }])
    // Two weeks, same weekday: lunch rush 12–13 (8 orders/h), 11 and 14–17 steady (2/h),
    // 18 quiet (1/day). One stray 23:00 order on a single day.
    for (const day of [START, addDays(START, 7)]) {
      for (const [hour, count] of [[11, 2], [12, 8], [13, 8], [14, 2], [15, 2], [16, 2], [17, 2], [18, 1]]) {
        for (let n = 0; n < count; n++) seedOrder(db, { date: day, time: `${hour}:${String(n * 5).padStart(2, '0')}`, lines: [[1, 1, 500]] })
      }
    }
    seedOrder(db, { date: START, time: '23:10', lines: [[1, 1, 500]] })
    const r = buildRushHours(db, START, addDays(START, 7))
    const wd = weekdayOf(START)
    assert.equal(r.openDays[wd], 2)
    assert.deepEqual(r.best.slice(0, 2).map((c) => c.hour).sort(), [12, 13])
    assert.equal(r.best[0].avgOrders, 8)
    // The 23:00 cell exists (0.5 avg) but is not a regular hour, so it is not the "worst" hour.
    assert.ok(r.cells.some((c) => c.hour === 23 && c.avgOrders === 0.5))
    assert.equal(r.worst[0].hour, 18)
    // Baseline = mean of regular cells (2+8+8+2+2+2+2+1)/8 = 3.375 → 12–14 peak (2.37×), 18 quiet (0.3×).
    const peak = r.staffing.find((b) => b.level === 'peak')
    assert.deepEqual([peak.weekday, peak.fromHour, peak.toHour, peak.avgOrders], [wd, 12, 14, 8])
    assert.equal(peak.loadFactor, Math.round((8 / 3.375) * 100) / 100)
    const quiet = r.staffing.find((b) => b.level === 'quiet')
    assert.deepEqual([quiet.fromHour, quiet.toHour], [18, 19])
  } finally {
    done()
  }
})

test('rush hours: empty range and invalid input', () => {
  const { db, done } = freshDb()
  try {
    const r = buildRushHours(db, START, START)
    assert.deepEqual(r.cells, [])
    assert.deepEqual(r.staffing, [])
    assert.throws(() => buildRushHours(db, 'x', START), /YYYY-MM-DD/)
  } finally {
    done()
  }
})
