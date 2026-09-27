/**
 * Owner alerts — pure evaluation (no sending, no persistence). The scheduler decides which
 * enabled, not-yet-sent alerts go to Telegram; the dashboard lists them as "pending".
 *
 * cancellations  today's cancelled orders ≥ 3 AND > mean + 2·sd AND ≥ 2 × mean of the open days
 *                in the previous 28 days (baseline "4 weeks")
 * discounts      today's discount total (non-cancelled) > mean + 2·sd AND ≥ 1.5 × mean, on ≥ 2
 *                discounted orders, and ≥ 5 % of today's subtotal
 *                Both list per-operator voids / price reductions from audit_events when an
 *                operator other than 'system' is recorded.
 * slow_day       after telegram_slow_day_time: today's revenue so far < threshold % of the
 *                weighted same-weekday revenue up to the same local time (last 6 weeks, ≥ 2 samples)
 * low_stock      a stock item has less than today's REMAINING forecast need (need − already
 *                consumed by today's orders; one alert per stock item)
 * margin         a purchase made today raised a unit price and pushed a menu item from ≥ the
 *                margin threshold to below it (one alert per menu item)
 * slow_day / low_stock are skipped on days the work schedule marks as closed.
 */
import type Database from 'better-sqlite3'
import type { InsightAlert, InsightAlertKind, InsightsSettings, PrepForecast } from '../../../shared/insights'
import { addDays, localDateOf, localMinutesOf, localTimeOf, minutesOfTime, SQL_LOCAL, weekdayOf } from './dates'
import { loadRecipes, loadStock, recipeCost, round1 } from './costs'
import { loadPriceBook } from './profit'
import { buildForecast, FORECAST_WEEKS } from './forecast'
import { ingredientNeeds } from './shopping-list'
import { formatMoney, localName, qtyWithUnit, t, unitLabel, weekdayName, type InsightsLang } from './messages'

export const MIN_CANCELLATIONS = 3
export const MIN_DISCOUNT_SHARE = 0.05
export const BASELINE_DAYS = 28
export const ALL_ALERT_KINDS: InsightAlertKind[] = ['cancellations', 'discounts', 'slow_day', 'low_stock', 'margin']

export interface AlertContext {
  now: Date
  settings: InsightsSettings
  lang: InsightsLang
  currency: string
  /** Keys already sent today (marks `sent`). */
  sentKeys?: Set<string>
  /** Kinds to evaluate (default all). */
  kinds?: InsightAlertKind[]
  /** Reuse an already computed forecast for today. */
  forecast?: PrepForecast
}

type Draft = Omit<InsightAlert, 'sent'>

export function meanAndSd(values: number[]): { mean: number; sd: number } {
  if (values.length === 0) return { mean: 0, sd: 0 }
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length
  return { mean, sd: Math.sqrt(variance) }
}

/** False only when the work schedule marks that weekday as closed. */
export function isOpenOn(db: Database.Database, date: string): boolean {
  const row = db.prepare('SELECT status FROM work_schedule WHERE day_of_week = ?').get(weekdayOf(date)) as
    | { status: string }
    | undefined
  return row?.status !== 'closed'
}

interface DayStats { cancelled: number; cancelledValue: number; discount: number; discountedOrders: number; subtotal: number }

function todayStats(db: Database.Database, date: string): DayStats {
  return db.prepare(
    `SELECT COALESCE(SUM(status = 'cancelled'), 0) AS cancelled,
            COALESCE(SUM(CASE WHEN status = 'cancelled' THEN total ELSE 0 END), 0) AS cancelledValue,
            COALESCE(SUM(CASE WHEN status != 'cancelled' THEN discount_amount ELSE 0 END), 0) AS discount,
            COALESCE(SUM(status != 'cancelled' AND discount_amount > 0), 0) AS discountedOrders,
            COALESCE(SUM(CASE WHEN status != 'cancelled' THEN subtotal ELSE 0 END), 0) AS subtotal
     FROM orders WHERE order_date = ?`
  ).get(date) as DayStats
}

function baselineStats(db: Database.Database, today: string): DayStats[] {
  return db.prepare(
    `SELECT COALESCE(SUM(status = 'cancelled'), 0) AS cancelled, 0 AS cancelledValue,
            COALESCE(SUM(CASE WHEN status != 'cancelled' THEN discount_amount ELSE 0 END), 0) AS discount,
            0 AS discountedOrders, 0 AS subtotal
     FROM orders WHERE order_date BETWEEN ? AND ? GROUP BY order_date`
  ).all(addDays(today, -BASELINE_DAYS), addDays(today, -1)) as DayStats[]
}

function operatorLines(db: Database.Database, today: string, lang: InsightsLang, field: 'voids' | 'overrides'): string[] {
  const rows = db.prepare(
    `SELECT operator,
            SUM(event_type = 'void') AS voids,
            SUM(event_type = 'price_override' AND CAST(new_value AS REAL) < CAST(original_value AS REAL)) AS overrides
     FROM audit_events
     WHERE date(created_at, ${SQL_LOCAL}) = ? AND operator != 'system'
     GROUP BY operator ORDER BY operator`
  ).all(today) as { operator: string; voids: number; overrides: number }[]
  return rows.filter((row) => row[field] > 0).map((row) => t(lang, 'operatorLine', row))
}

function cancellationAlerts(db: Database.Database, ctx: AlertContext, today: string): Draft[] {
  const stats = todayStats(db, today)
  const { mean, sd } = meanAndSd(baselineStats(db, today).map((d) => d.cancelled))
  if (stats.cancelled < MIN_CANCELLATIONS || stats.cancelled <= mean + 2 * sd || stats.cancelled < 2 * mean) return []
  const vars = { count: stats.cancelled, avg: round1(mean), amount: formatMoney(stats.cancelledValue), cur: ctx.currency }
  return [{
    kind: 'cancellations',
    key: 'cancellations',
    severity: 'warning',
    title: t(ctx.lang, 'cancellationsTitle'),
    message: [t(ctx.lang, 'cancellationsBody', vars), ...operatorLines(db, today, ctx.lang, 'voids')].join('\n'),
    data: { count: stats.cancelled, baselineMean: round1(mean), baselineSd: round1(sd), cancelledValue: Math.round(stats.cancelledValue) }
  }]
}

function discountAlerts(db: Database.Database, ctx: AlertContext, today: string): Draft[] {
  const stats = todayStats(db, today)
  const { mean, sd } = meanAndSd(baselineStats(db, today).map((d) => d.discount))
  const share = stats.subtotal > 0 ? stats.discount / stats.subtotal : 0
  if (stats.discountedOrders < 2 || !(stats.discount > mean + 2 * sd) || stats.discount < 1.5 * mean || share < MIN_DISCOUNT_SHARE) return []
  const vars = {
    amount: formatMoney(stats.discount), orders: stats.discountedOrders, pct: Math.round(share * 100),
    avg: formatMoney(mean), cur: ctx.currency
  }
  return [{
    kind: 'discounts',
    key: 'discounts',
    severity: 'warning',
    title: t(ctx.lang, 'discountsTitle'),
    message: [t(ctx.lang, 'discountsBody', vars), ...operatorLines(db, today, ctx.lang, 'overrides')].join('\n'),
    data: { discount: Math.round(stats.discount), discountedOrders: stats.discountedOrders, sharePct: round1(share * 100), baselineMean: Math.round(mean) }
  }]
}

/** Weighted same-weekday revenue up to local time `cutoff` ('HH:MM'); null with < 2 samples. */
export function expectedRevenueSoFar(db: Database.Database, today: string, cutoff: string): { expected: number; samples: number } | null {
  let weighted = 0
  let weights = 0
  let samples = 0
  const stmt = db.prepare(
    `SELECT COUNT(*) AS orders,
            COALESCE(SUM(CASE WHEN strftime('%H:%M', created_at, ${SQL_LOCAL}) <= ? THEN total ELSE 0 END), 0) AS revenue
     FROM orders WHERE order_date = ? AND status != 'cancelled'`
  )
  for (let week = 1; week <= FORECAST_WEEKS; week++) {
    const row = stmt.get(cutoff, addDays(today, -7 * week)) as { orders: number; revenue: number }
    if (row.orders === 0) continue
    const weight = FORECAST_WEEKS + 1 - week
    weighted += row.revenue * weight
    weights += weight
    samples++
  }
  return samples >= 2 ? { expected: weighted / weights, samples } : null
}

function slowDayAlerts(db: Database.Database, ctx: AlertContext, today: string): Draft[] {
  if (localMinutesOf(ctx.now) < minutesOfTime(ctx.settings.slowDayCheckTime) || !isOpenOn(db, today)) return []
  const cutoff = localTimeOf(ctx.now)
  const base = expectedRevenueSoFar(db, today, cutoff)
  if (!base || !(base.expected > 0)) return []
  const revenue = (db.prepare(
    `SELECT COALESCE(SUM(total), 0) AS revenue FROM orders WHERE order_date = ? AND status != 'cancelled'`
  ).get(today) as { revenue: number }).revenue
  const pct = Math.round((revenue / base.expected) * 100)
  if (pct >= ctx.settings.slowDayThresholdPct) return []
  const vars = {
    today: formatMoney(revenue), expected: formatMoney(base.expected), time: cutoff,
    weekday: weekdayName(ctx.lang, weekdayOf(today)), pct, cur: ctx.currency
  }
  return [{
    kind: 'slow_day',
    key: 'slow_day',
    severity: 'info',
    title: t(ctx.lang, 'slowTitle'),
    message: t(ctx.lang, 'slowBody', vars),
    data: { revenue: Math.round(revenue), expected: Math.round(base.expected), pct, asOf: cutoff, samples: base.samples }
  }]
}

function lowStockAlerts(db: Database.Database, ctx: AlertContext, today: string): Draft[] {
  if (!isOpenOn(db, today)) return []
  const forecast = ctx.forecast ?? buildForecast(db, today)
  const { needs } = ingredientNeeds(db, forecast)
  const stock = loadStock(db)
  const out: Draft[] = []
  for (const [id, entry] of needs) {
    const info = stock.get(id)
    if (!info?.isActive || entry.need <= 0 || info.quantity >= entry.need) continue
    out.push({
      kind: 'low_stock',
      key: `low_stock:${id}`,
      severity: info.quantity <= 0 ? 'critical' : 'warning',
      title: t(ctx.lang, 'lowStockTitle'),
      message: t(ctx.lang, 'lowStockLine', {
        name: localName(info, ctx.lang),
        have: qtyWithUnit(ctx.lang, info.quantity, info.unit),
        need: qtyWithUnit(ctx.lang, entry.need, info.unit)
      }),
      data: { stockItemId: id, have: info.quantity, need: Math.round(entry.need * 1000) / 1000, unit: info.unit }
    })
  }
  return out
}

function marginAlerts(db: Database.Database, ctx: AlertContext, today: string): Draft[] {
  const purchases = db.prepare(
    `SELECT p.id, p.stock_item_id AS stockItemId, p.price_per_unit AS price,
            (SELECT prev.price_per_unit FROM stock_purchases prev
             WHERE prev.stock_item_id = p.stock_item_id AND prev.quantity > 0
               AND (prev.purchased_at < p.purchased_at OR (prev.purchased_at = p.purchased_at AND prev.id < p.id))
             ORDER BY prev.purchased_at DESC, prev.id DESC LIMIT 1) AS previousPrice
     FROM stock_purchases p
     WHERE p.quantity > 0 AND date(p.purchased_at, ${SQL_LOCAL}) = ?
     ORDER BY p.purchased_at, p.id`
  ).all(today) as { id: number; stockItemId: number; price: number; previousPrice: number | null }[]
  const rising = purchases.filter((p) => p.previousPrice !== null && p.price > p.previousPrice)
  if (rising.length === 0) return []

  const recipes = loadRecipes(db)
  const book = loadPriceBook(db, ctx.now)
  const stock = loadStock(db)
  const menu = new Map((db.prepare('SELECT id, name, name_ar, name_fr, price FROM menu_items WHERE is_active = 1').all() as
    { id: number; name: string; name_ar: string | null; name_fr: string | null; price: number }[]).map((row) => [row.id, row]))
  const threshold = ctx.settings.profitMarginWarnPct
  const out = new Map<string, Draft>()
  for (const purchase of rising) {
    for (const [menuItemId, lines] of recipes) {
      const item = menu.get(menuItemId)
      if (!item || !(item.price > 0) || out.has(`margin:${menuItemId}`)) continue
      if (!lines.some((line) => line.stockItemId === purchase.stockItemId)) continue
      const priceWith = (price: number) => (id: number) => (id === purchase.stockItemId ? price : book.current.get(id))
      const before = ((item.price - recipeCost(lines, priceWith(purchase.previousPrice as number)).cost) / item.price) * 100
      const after = ((item.price - recipeCost(lines, priceWith(purchase.price)).cost) / item.price) * 100
      if (before < threshold || after >= threshold) continue
      const info = stock.get(purchase.stockItemId)
      out.set(`margin:${menuItemId}`, {
        kind: 'margin',
        key: `margin:${menuItemId}`,
        severity: 'warning',
        title: t(ctx.lang, 'marginTitle'),
        message: t(ctx.lang, 'marginLine', {
          item: localName(item, ctx.lang), margin: round1(after), threshold,
          ingredient: info ? localName(info, ctx.lang) : '?',
          from: formatMoney(purchase.previousPrice as number), to: formatMoney(purchase.price), cur: ctx.currency,
          unit: unitLabel(ctx.lang, info?.unit ?? '')
        }),
        data: {
          menuItemId, stockItemId: purchase.stockItemId, purchaseId: purchase.id,
          marginBeforePct: round1(before), marginAfterPct: round1(after), thresholdPct: threshold,
          fromPrice: purchase.previousPrice, toPrice: purchase.price
        }
      })
    }
  }
  return [...out.values()]
}

export function evaluateAlerts(db: Database.Database, ctx: AlertContext): InsightAlert[] {
  const today = localDateOf(ctx.now)
  const kinds = new Set(ctx.kinds ?? ALL_ALERT_KINDS)
  const sent = ctx.sentKeys ?? new Set<string>()
  const drafts: Draft[] = []
  if (kinds.has('cancellations')) drafts.push(...cancellationAlerts(db, ctx, today))
  if (kinds.has('discounts')) drafts.push(...discountAlerts(db, ctx, today))
  if (kinds.has('slow_day')) drafts.push(...slowDayAlerts(db, ctx, today))
  if (kinds.has('low_stock')) drafts.push(...lowStockAlerts(db, ctx, today))
  if (kinds.has('margin')) drafts.push(...marginAlerts(db, ctx, today))
  return drafts.map((draft) => ({ ...draft, sent: sent.has(draft.key) }))
}
