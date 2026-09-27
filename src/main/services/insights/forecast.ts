/**
 * Prep forecast: expected units per menu item for one date.
 *
 * 1. Same weekday over the last 6 weeks (D−7 … D−42). Only OPEN days count (≥ 1 non-cancelled
 *    order) so a closed holiday or pre-install week does not drag the average to zero. Week k
 *    back gets weight (7 − k): 6, 5, 4, 3, 2, 1 — recent weeks weigh more. Needs ≥ 2 open samples.
 * 2. Otherwise (new install, irregular weekday): plain average of the open days in the last
 *    28 days ('daily_average'). No history at all → 'none' with an empty list.
 * 3. Optional trend factor: average orders per open day over the last 14 days ÷ days 15–56,
 *    clamped to [0.85, 1.15]; only with ≥ 5 recent and ≥ 10 older open days.
 * Cancelled orders never count. Only active menu items are returned.
 *
 * v4 catalog: `items` are PHYSICAL items — combo children count as their own menu item (their line
 * quantity already equals the combo quantity) and combo parent lines are reported apart in `combos`
 * (only their own recipe, e.g. packaging, matters for stock). `options` forecasts every stock-using
 * modifier option the same way (option quantity × line quantity per day), so the shopping list can
 * add "Extra cheese" etc. Revenue is net of delivery fees (sql.ts).
 */
import type Database from 'better-sqlite3'
import type { ForecastMethod, ForecastItem, ForecastOption, PrepForecast } from '../../../shared/insights'
import { addDays, assertIsoDate, weekdayOf } from './dates'
import { round1, round2 } from './costs'
import { netTotal, placeholders } from './sql'

export const FORECAST_WEEKS = 6
export const FALLBACK_DAYS = 28
export const TREND_CLAMP: [number, number] = [0.85, 1.15]

export interface ForecastOptions {
  /** Apply the recent-trend multiplier (default true). */
  trend?: boolean
}

interface DayTotals { date: string; orders: number; revenue: number }

function dayTotals(db: Database.Database, dates: string[]): Map<string, DayTotals> {
  if (dates.length === 0) return new Map()
  const rows = db.prepare(
    `SELECT order_date AS date, COUNT(*) AS orders, COALESCE(SUM(${netTotal()}), 0) AS revenue
     FROM orders WHERE order_date IN (${placeholders(dates.length)}) AND status != 'cancelled'
     GROUP BY order_date`
  ).all(...dates) as DayTotals[]
  return new Map(rows.map((row) => [row.date, row]))
}

function openDaysBetween(db: Database.Database, start: string, end: string): DayTotals[] {
  return db.prepare(
    `SELECT order_date AS date, COUNT(*) AS orders, COALESCE(SUM(${netTotal()}), 0) AS revenue
     FROM orders WHERE order_date BETWEEN ? AND ? AND status != 'cancelled'
     GROUP BY order_date`
  ).all(start, end) as DayTotals[]
}

interface QtyRow { date: string; id: number; qty: number; combo: number }

/** Units per day and menu item; `combo` = 1 for combo parent lines. */
function itemQuantities(db: Database.Database, dates: string[]): QtyRow[] {
  if (dates.length === 0) return []
  return db.prepare(
    `SELECT o.order_date AS date, oi.menu_item_id AS id, SUM(oi.quantity) AS qty,
            (oi.line_kind = 'combo') AS combo
     FROM orders o JOIN order_items oi ON oi.order_id = o.id
     WHERE o.order_date IN (${placeholders(dates.length)}) AND o.status != 'cancelled'
     GROUP BY o.order_date, oi.menu_item_id, combo`
  ).all(...dates) as QtyRow[]
}

/** Option units per day (option quantity × line quantity); kind 'no' uses no stock. */
function optionQuantities(db: Database.Database, dates: string[]): QtyRow[] {
  if (dates.length === 0) return []
  return db.prepare(
    `SELECT o.order_date AS date, oim.option_id AS id, SUM(oim.quantity * oi.quantity) AS qty, 0 AS combo
     FROM orders o
     JOIN order_items oi ON oi.order_id = o.id
     JOIN order_item_modifiers oim ON oim.order_item_id = oi.id
     WHERE o.order_date IN (${placeholders(dates.length)}) AND o.status != 'cancelled'
       AND oim.option_id IS NOT NULL AND oim.kind <> 'no'
     GROUP BY o.order_date, oim.option_id`
  ).all(...dates) as QtyRow[]
}

type NameRow = { id: number; name: string; name_ar: string | null; name_fr: string | null; category_id: number }

/** Weighted expected units per id, one decimal, > 0 only, highest first. */
function expectedPerId(
  rows: QtyRow[], weights: Map<string, number>, weightSum: number, factor: number
): Map<number, number> {
  const sums = new Map<number, number>()
  for (const row of rows) sums.set(row.id, (sums.get(row.id) ?? 0) + row.qty * (weights.get(row.date) ?? 0))
  const out = new Map<number, number>()
  if (!(weightSum > 0)) return out
  for (const [id, sum] of sums) {
    const expected = round1((sum / weightSum) * factor)
    if (expected > 0) out.set(id, expected)
  }
  return out
}

function forecastItems(db: Database.Database, expected: Map<number, number>): ForecastItem[] {
  if (expected.size === 0) return []
  const ids = [...expected.keys()]
  const rows = db.prepare(
    `SELECT id, name, name_ar, name_fr, category_id FROM menu_items
     WHERE is_active = 1 AND id IN (${placeholders(ids.length)})`
  ).all(...ids) as NameRow[]
  return rows
    .map((row) => {
      const value = expected.get(row.id) as number
      return {
        menuItemId: row.id, name: row.name, name_ar: row.name_ar, name_fr: row.name_fr,
        categoryId: row.category_id, expected: value, rounded: Math.round(value)
      }
    })
    .sort((a, b) => b.expected - a.expected || a.name.localeCompare(b.name))
}

function forecastOptions(db: Database.Database, expected: Map<number, number>): ForecastOption[] {
  if (expected.size === 0) return []
  const ids = [...expected.keys()]
  const rows = db.prepare(
    `SELECT id, name, name_ar, name_fr, 0 AS category_id FROM modifier_options
     WHERE is_active = 1 AND id IN (${placeholders(ids.length)})`
  ).all(...ids) as NameRow[]
  return rows
    .map((row) => ({ optionId: row.id, name: row.name, name_ar: row.name_ar, name_fr: row.name_fr, expected: expected.get(row.id) as number }))
    .sort((a, b) => b.expected - a.expected || a.name.localeCompare(b.name))
}

/** Recent-vs-older orders-per-open-day ratio, clamped; 1 when there is not enough history. */
export function trendFactor(db: Database.Database, date: string): number {
  const recent = openDaysBetween(db, addDays(date, -14), addDays(date, -1))
  const older = openDaysBetween(db, addDays(date, -56), addDays(date, -15))
  if (recent.length < 5 || older.length < 10) return 1
  const avg = (days: DayTotals[]): number => days.reduce((sum, d) => sum + d.orders, 0) / days.length
  const olderAvg = avg(older)
  if (!(olderAvg > 0)) return 1
  const ratio = avg(recent) / olderAvg
  return round2(Math.min(TREND_CLAMP[1], Math.max(TREND_CLAMP[0], ratio)))
}

/** Picks the sample days and their weights (see the header). */
function chooseSamples(db: Database.Database, date: string): { method: ForecastMethod; weights: Map<string, number>; totals: DayTotals[] } {
  const weekdayDates = Array.from({ length: FORECAST_WEEKS }, (_, i) => addDays(date, -7 * (i + 1)))
  const weekdayTotals = dayTotals(db, weekdayDates)
  const open = weekdayDates.filter((d) => (weekdayTotals.get(d)?.orders ?? 0) > 0)
  if (open.length >= 2) {
    const weights = new Map<string, number>()
    weekdayDates.forEach((d, i) => { if (open.includes(d)) weights.set(d, FORECAST_WEEKS - i) })
    return { method: 'weekday', weights, totals: open.map((d) => weekdayTotals.get(d)!) }
  }
  const recent = openDaysBetween(db, addDays(date, -FALLBACK_DAYS), addDays(date, -1))
  if (recent.length === 0) return { method: 'none', weights: new Map(), totals: [] }
  return { method: 'daily_average', weights: new Map(recent.map((d) => [d.date, 1])), totals: recent }
}

export function buildForecast(db: Database.Database, dateInput: string, options: ForecastOptions = {}): PrepForecast {
  const date = assertIsoDate(dateInput)
  const { method, weights, totals } = chooseSamples(db, date)
  const sampleDays = [...weights.keys()].sort()
  const weightSum = [...weights.values()].reduce((a, b) => a + b, 0)
  const factor = method !== 'none' && options.trend !== false ? trendFactor(db, date) : 1

  const weighted = (valueOf: (d: DayTotals) => number): number =>
    weightSum > 0 ? totals.reduce((sum, d) => sum + valueOf(d) * (weights.get(d.date) ?? 0), 0) / weightSum : 0

  const quantities = itemQuantities(db, sampleDays)
  const items = forecastItems(db, expectedPerId(quantities.filter((row) => !row.combo), weights, weightSum, factor))
  const combos = forecastItems(db, expectedPerId(quantities.filter((row) => row.combo), weights, weightSum, factor))
  const optionForecast = forecastOptions(db, expectedPerId(optionQuantities(db, sampleDays), weights, weightSum, factor))

  return {
    date,
    weekday: weekdayOf(date),
    method,
    sampleDays,
    confidence: method === 'weekday' ? (sampleDays.length >= 4 ? 'high' : 'medium') : 'low',
    trendFactor: factor,
    expectedOrders: Math.round(weighted((d) => d.orders) * factor),
    expectedRevenue: Math.round(weighted((d) => d.revenue) * factor),
    items,
    combos,
    options: optionForecast
  }
}
