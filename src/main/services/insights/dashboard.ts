/**
 * Admin home summary: today so far vs the same weekday last week (up to the same local time,
 * so a morning check is not compared with a whole day), a 14-day sparkline, today's top items,
 * low-stock count, today's forecast and the alerts currently detected (all kinds, regardless of
 * the Telegram toggles; `sent` says whether Telegram already got it today, `telegramEnabled`
 * whether that kind is ever sent).
 *
 * Money follows Analytics: revenue = totals minus delivery fees (fees reported apart), item figures
 * count combo children at their allocated revenue and skip combo parent lines (sql.ts).
 * `hourly` compares today with the usual profile of the same weekday (forecast sample days).
 */
import type Database from 'better-sqlite3'
import type { DashboardHour, DashboardKpis, DashboardSummary, InsightsSettings, PrepForecast } from '../../../shared/insights'
import { addDays, daysBetween, localDateOf, localTimeOf, SQL_LOCAL } from './dates'
import { buildForecast, FORECAST_WEEKS } from './forecast'
import { ITEM_LINE, LINE_REVENUE, netTotal, placeholders } from './sql'
import { evaluateAlerts } from './alerts'
import type { InsightsLang } from './messages'
import { round1 } from './costs'

export interface DashboardContext {
  now: Date
  settings: InsightsSettings
  lang: InsightsLang
  currency: string
  sentKeys?: Set<string>
}

function kpis(row: { orders: number; revenue: number }): DashboardKpis {
  return {
    orders: row.orders,
    revenue: Math.round(row.revenue),
    avgTicket: row.orders > 0 ? Math.round(row.revenue / row.orders) : 0
  }
}

function deltaPct(now: number, before: number): number | null {
  return before > 0 ? round1(((now - before) / before) * 100) : null
}

type HourRow = { date: string; hour: number; orders: number; revenue: number }

function hoursOf(db: Database.Database, dates: string[]): HourRow[] {
  if (dates.length === 0) return []
  return db.prepare(
    `SELECT order_date AS date, CAST(strftime('%H', created_at, ${SQL_LOCAL}) AS INTEGER) AS hour,
            COUNT(*) AS orders, COALESCE(SUM(${netTotal()}), 0) AS revenue
     FROM orders WHERE order_date IN (${placeholders(dates.length)}) AND status != 'cancelled'
     GROUP BY order_date, hour HAVING hour IS NOT NULL`
  ).all(...dates) as HourRow[]
}

/** Today per hour vs the weighted usual of the forecast's sample days (same weights, no trend). */
export function hourlyProfile(db: Database.Database, today: string, forecast: PrepForecast): DashboardHour[] {
  const hours: DashboardHour[] = Array.from({ length: 24 }, (_, hour) => ({ hour, orders: 0, revenue: 0, usualOrders: 0, usualRevenue: 0 }))
  for (const row of hoursOf(db, [today])) {
    hours[row.hour].orders = row.orders
    hours[row.hour].revenue = Math.round(row.revenue)
  }
  const weightOf = (date: string): number =>
    forecast.method === 'weekday' ? FORECAST_WEEKS + 1 - Math.round(daysBetween(date, today) / 7) : 1
  const weightSum = forecast.sampleDays.reduce((sum, date) => sum + weightOf(date), 0)
  if (weightSum > 0) {
    for (const row of hoursOf(db, forecast.sampleDays)) {
      const w = weightOf(row.date) / weightSum
      hours[row.hour].usualOrders += row.orders * w
      hours[row.hour].usualRevenue += row.revenue * w
    }
  }
  return hours.map((h) => ({ ...h, usualOrders: round1(h.usualOrders), usualRevenue: Math.round(h.usualRevenue) }))
}

export function buildDashboardSummary(db: Database.Database, ctx: DashboardContext): DashboardSummary {
  const today = localDateOf(ctx.now)
  const asOf = localTimeOf(ctx.now)
  const lastWeek = addDays(today, -7)
  const totals = db.prepare(
    `SELECT COUNT(*) AS orders, COALESCE(SUM(${netTotal()}), 0) AS revenue
     FROM orders WHERE order_date = ? AND status != 'cancelled'`
  )
  const totalsUntil = db.prepare(
    `SELECT COUNT(*) AS orders, COALESCE(SUM(${netTotal()}), 0) AS revenue
     FROM orders WHERE order_date = ? AND status != 'cancelled'
       AND strftime('%H:%M', created_at, ${SQL_LOCAL}) <= ?`
  )
  const todayKpis = kpis(totals.get(today) as { orders: number; revenue: number })
  const lastWeekSameTime = kpis(totalsUntil.get(lastWeek, asOf) as { orders: number; revenue: number })
  const lastWeekFullDay = kpis(totals.get(lastWeek) as { orders: number; revenue: number })

  const start = addDays(today, -13)
  const byDay = new Map((db.prepare(
    `SELECT order_date AS date, COUNT(*) AS orders, COALESCE(SUM(${netTotal()}), 0) AS revenue
     FROM orders WHERE order_date BETWEEN ? AND ? AND status != 'cancelled'
     GROUP BY order_date`
  ).all(start, today) as { date: string; orders: number; revenue: number }[]).map((row) => [row.date, row]))
  const sparkline = Array.from({ length: 14 }, (_, i) => {
    const date = addDays(start, i)
    const row = byDay.get(date)
    return { date, revenue: Math.round(row?.revenue ?? 0), orders: row?.orders ?? 0 }
  })

  const topItemsToday = (db.prepare(
    `SELECT oi.menu_item_id AS menuItemId, MAX(oi.id) AS lastLine, mi.category_id AS categoryId,
            COALESCE(oi.item_name, mi.name) AS name,
            CASE WHEN oi.item_name IS NOT NULL THEN oi.item_name_ar ELSE mi.name_ar END AS name_ar,
            CASE WHEN oi.item_name IS NOT NULL THEN oi.item_name_fr ELSE mi.name_fr END AS name_fr,
            SUM(oi.quantity) AS quantity, SUM(${LINE_REVENUE}) AS revenue
     FROM orders o JOIN order_items oi ON oi.order_id = o.id
     LEFT JOIN menu_items mi ON mi.id = oi.menu_item_id
     WHERE o.order_date = ? AND o.status != 'cancelled' AND ${ITEM_LINE}
     GROUP BY oi.menu_item_id ORDER BY quantity DESC, revenue DESC LIMIT 5`
  ).all(today) as {
    menuItemId: number; categoryId: number | null; name: string | null; name_ar: string | null; name_fr: string | null
    quantity: number; revenue: number
  }[])
    .map((row) => ({
      menuItemId: row.menuItemId, categoryId: row.categoryId ?? null, name: row.name ?? '', name_ar: row.name_ar,
      name_fr: row.name_fr, quantity: row.quantity, revenue: Math.round(row.revenue)
    }))

  const lowStockCount = (db.prepare(
    'SELECT COUNT(*) AS count FROM stock_items WHERE is_active = 1 AND quantity <= alert_threshold'
  ).get() as { count: number }).count

  const deliveryFeesToday = Math.round((db.prepare(
    `SELECT COALESCE(SUM(delivery_fee), 0) AS fees FROM orders WHERE order_date = ? AND status != 'cancelled'`
  ).get(today) as { fees: number }).fees)

  const forecast = buildForecast(db, today)
  const pendingAlerts = evaluateAlerts(db, { ...ctx, forecast })

  return {
    date: today,
    asOf,
    today: todayKpis,
    lastWeekSameTime,
    lastWeekFullDay,
    deltaPct: {
      revenue: deltaPct(todayKpis.revenue, lastWeekSameTime.revenue),
      orders: deltaPct(todayKpis.orders, lastWeekSameTime.orders),
      avgTicket: deltaPct(todayKpis.avgTicket, lastWeekSameTime.avgTicket)
    },
    sparkline,
    topItemsToday,
    hourly: hourlyProfile(db, today, forecast),
    deliveryFeesToday,
    lowStockCount,
    forecastToday: { expectedOrders: forecast.expectedOrders, expectedRevenue: forecast.expectedRevenue, method: forecast.method },
    pendingAlerts
  }
}
