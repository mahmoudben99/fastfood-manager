// Insights — dashboard summary, printable prep list, settings parse/validate.
import test from 'node:test'
import assert from 'node:assert/strict'
import { addDays, freshDb, localInstant, seedMenu, seedOrder, seedRecipes, seedStock, src } from './helpers.mjs'

const { buildDashboardSummary } = await src('main/services/insights/dashboard.ts')
const { buildPrepListHtml, composeAlertMessages, composeMorningPrepMessage } = await src('main/services/insights/reports.ts')
const { buildShoppingList } = await src('main/services/insights/shopping-list.ts')
const { DEFAULT_INSIGHTS_SETTINGS, parseInsightsSettings, serializeInsightsSettings } = await src('shared/insights.ts')

const TODAY = '2026-09-26'

test('dashboard: today so far vs same weekday last week up to the same time, sparkline, top items', () => {
  const { db, done } = freshDb()
  try {
    seedMenu(db, [{ id: 1, name: 'Burger', price: 500 }, { id: 2, name: 'Fries', price: 200, category: 2 }])
    seedStock(db, [{ id: 1, name: 'Beef', unit: 'kg', quantity: 0, price: 1000, threshold: 1 }])
    seedRecipes(db, [[1, 1, 150, 'g']])
    const lastWeek = addDays(TODAY, -7)
    seedOrder(db, { date: lastWeek, time: '11:00', lines: [[1, 2, 500]] })      // 1000 before 13:00
    seedOrder(db, { date: lastWeek, time: '20:00', lines: [[1, 10, 500]] })     // later in the day
    seedOrder(db, { date: addDays(TODAY, -3), time: '12:00', lines: [[2, 1, 200]] })
    seedOrder(db, { date: TODAY, time: '11:30', lines: [[1, 2, 500], [2, 3, 200]] })
    seedOrder(db, { date: TODAY, time: '12:15', lines: [[2, 1, 200]] })
    seedOrder(db, { date: TODAY, time: '12:20', status: 'cancelled', lines: [[1, 9, 500]] })

    const s = buildDashboardSummary(db, {
      now: localInstant(TODAY, '13:00'), settings: DEFAULT_INSIGHTS_SETTINGS, lang: 'en', currency: 'DA', sentKeys: new Set(['low_stock:1'])
    })
    assert.equal(s.date, TODAY)
    assert.equal(s.asOf, '13:00')
    assert.deepEqual(s.today, { revenue: 1800, orders: 2, avgTicket: 900 })
    assert.deepEqual(s.lastWeekSameTime, { revenue: 1000, orders: 1, avgTicket: 1000 })
    assert.deepEqual(s.lastWeekFullDay, { revenue: 6000, orders: 2, avgTicket: 3000 })
    assert.deepEqual(s.deltaPct, { revenue: 80, orders: 100, avgTicket: -10 })
    assert.equal(s.sparkline.length, 14)
    assert.equal(s.sparkline[0].date, addDays(TODAY, -13))
    assert.equal(s.sparkline[13].date, TODAY)
    assert.equal(s.sparkline[13].revenue, 1800)
    assert.equal(s.sparkline.find((d) => d.date === addDays(TODAY, -5)).orders, 0, 'zero-filled')
    assert.deepEqual(s.topItemsToday.map((i) => [i.name, i.quantity, i.revenue]), [['Fries', 4, 800], ['Burger', 2, 1000]])
    assert.equal(s.lowStockCount, 1)
    assert.equal(s.forecastToday.method, 'daily_average')
    const low = s.pendingAlerts.find((a) => a.key === 'low_stock:1')
    assert.ok(low, 'beef is needed by the forecast and there is none')
    assert.equal(low.sent, true)
  } finally {
    done()
  }
})

test('prep list print: receipt-width HTML, RTL + Arabic names in Arabic, names escaped', () => {
  const { db, done } = freshDb()
  try {
    seedMenu(db, [{ id: 1, name: 'Burger <b>', price: 500 }])
    db.prepare("UPDATE menu_items SET name_ar = 'برغر' WHERE id = 1").run()
    seedStock(db, [{ id: 1, name: 'Beef', unit: 'kg', quantity: 0, price: 1000, threshold: 0 }])
    seedRecipes(db, [[1, 1, 150, 'g']])
    for (let w = 1; w <= 3; w++) seedOrder(db, { date: addDays(TODAY, -7 * w), lines: [[1, 10, 500]] })
    const list = buildShoppingList(db, TODAY)

    const en = buildPrepListHtml(list, { lang: 'en', currency: 'DA', paperWidth: '58', restaurantName: 'La Zone' })
    assert.match(en, /dir="ltr"/)
    assert.match(en, /width: 48mm/)
    assert.match(en, /PREP LIST/)
    assert.match(en, /Burger &lt;b&gt;/)
    assert.ok(!en.includes('Burger <b>'))
    assert.match(en, /1\.5 kg/)
    assert.match(en, /1 500 DA/)

    const ar = buildPrepListHtml(list, { lang: 'ar', currency: 'DA', paperWidth: '80' })
    assert.match(ar, /dir="rtl"/)
    assert.match(ar, /قائمة التحضير/)
    assert.match(ar, /برغر/)
    assert.match(ar, /1\.5 كغ/)

    const telegram = composeMorningPrepMessage(list, { lang: 'en', currency: 'DA' })
    assert.match(telegram, /Burger &lt;b&gt; × 10/)
    assert.match(telegram, /🔴 Beef: 1\.5 kg/)
    assert.match(telegram, /Not enough for today: Beef/)
  } finally {
    done()
  }
})

test('prep message: no history yet is explained, not an empty list', () => {
  const { db, done } = freshDb()
  try {
    const list = buildShoppingList(db, TODAY)
    const text = composeMorningPrepMessage(list, { lang: 'fr', currency: 'DA' })
    assert.match(text, /Pas encore d'historique/)
    assert.match(text, /rien à acheter/)
  } finally {
    done()
  }
})

test('settings: defaults for missing/invalid values, validated writes', () => {
  assert.deepEqual(parseInsightsSettings({}), DEFAULT_INSIGHTS_SETTINGS)
  const parsed = parseInsightsSettings({
    telegram_morning_prep: 'false', telegram_morning_prep_time: '7:05', profit_margin_warn_pct: '35',
    telegram_slow_day_time: '25:00', telegram_slow_day_threshold_pct: '5', telegram_alert_margin: '0'
  })
  assert.equal(parsed.morningPrep, false)
  assert.equal(parsed.morningPrepTime, '07:05')
  assert.equal(parsed.profitMarginWarnPct, 35)
  assert.equal(parsed.slowDayCheckTime, '14:00', 'invalid time → default')
  assert.equal(parsed.slowDayThresholdPct, 70, 'out of range → default')
  assert.equal(parsed.alertMargin, false)

  assert.deepEqual(serializeInsightsSettings({ morningPrepTime: '6:30', alertDiscounts: false, profitMarginWarnPct: 25 }), {
    telegram_morning_prep_time: '06:30', telegram_alert_discounts: 'false', profit_margin_warn_pct: '25'
  })
  assert.throws(() => serializeInsightsSettings({ morningPrepTime: 'nine' }), /time like 09:00/)
  assert.throws(() => serializeInsightsSettings({ profitMarginWarnPct: 120 }), /between 0 and 95/)
  assert.throws(() => serializeInsightsSettings({ alertSlowDay: 'yes' }), /true or false/)
})

test('telegram messages stay under the 4096-character limit, cut on a line boundary', () => {
  const alerts = Array.from({ length: 80 }, (_, i) => ({
    kind: 'low_stock', key: `low_stock:${i}`, severity: 'warning', title: 'Stock too low for today',
    message: `Stock item with a rather long descriptive name number ${i}: have 0.5 kg, today needs ~12.25 kg`, data: {}, sent: false
  }))
  const [message] = composeAlertMessages(alerts)
  assert.equal(message.keys.length, 80)
  assert.ok(message.text.length <= 4000, `length ${message.text.length}`)
  assert.ok(message.text.endsWith('\n…'))
  assert.ok(message.text.startsWith('📦 <b>Stock too low for today</b>\n'))
})
