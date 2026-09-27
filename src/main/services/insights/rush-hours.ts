/**
 * Rush hours: weekday × local-hour heatmap of non-cancelled orders over a date range.
 *
 * avgOrders      = orders in the cell ÷ open days of that weekday (days with ≥ 1 order)
 * regular hour   = a cell with orders on MORE than half of that weekday's open days (filters one-off
 *                  late orders out of "worst hours" and of the staffing baseline)
 * best / worst   = top / bottom 3 cells by avgOrders (worst among regular hours only)
 * staffing       = per weekday, runs of consecutive regular hours whose load factor
 *                  (avgOrders ÷ mean avgOrders of all regular hours) is ≥ 1.5 ('peak': plan
 *                  extra hands) or ≤ 0.5 ('quiet': breaks, prep, cleaning)
 * Revenue is net of delivery fees (sql.ts).
 */
import type Database from 'better-sqlite3'
import type { RushHourCell, RushHoursReport, StaffingBlock } from '../../../shared/insights'
import { assertRange, SQL_LOCAL } from './dates'
import { round2 } from './costs'
import { netTotal } from './sql'

export const PEAK_FACTOR = 1.5
export const QUIET_FACTOR = 0.5
export const REGULAR_SHARE = 0.5

export function buildRushHours(db: Database.Database, startDate: string, endDate: string): RushHoursReport {
  const range = assertRange(startDate, endDate)
  const rows = db.prepare(
    `SELECT CAST(strftime('%w', order_date) AS INTEGER) AS weekday,
            CAST(strftime('%H', created_at, ${SQL_LOCAL}) AS INTEGER) AS hour,
            COUNT(*) AS orders, COALESCE(SUM(${netTotal()}), 0) AS revenue,
            COUNT(DISTINCT order_date) AS activeDays
     FROM orders
     WHERE order_date BETWEEN ? AND ? AND status != 'cancelled'
     GROUP BY weekday, hour
     HAVING hour IS NOT NULL`
  ).all(range.start, range.end) as { weekday: number; hour: number; orders: number; revenue: number; activeDays: number }[]

  const openDays = [0, 0, 0, 0, 0, 0, 0]
  for (const row of db.prepare(
    `SELECT CAST(strftime('%w', order_date) AS INTEGER) AS weekday, COUNT(DISTINCT order_date) AS days
     FROM orders WHERE order_date BETWEEN ? AND ? AND status != 'cancelled'
     GROUP BY weekday`
  ).all(range.start, range.end) as { weekday: number; days: number }[]) {
    openDays[row.weekday] = row.days
  }

  const cells: RushHourCell[] = rows.map((row) => ({
    weekday: row.weekday,
    hour: row.hour,
    orders: row.orders,
    revenue: Math.round(row.revenue),
    avgTicket: row.orders > 0 ? Math.round(row.revenue / row.orders) : 0,
    avgOrders: round2(row.orders / Math.max(1, openDays[row.weekday])),
    activeDays: row.activeDays
  }))
  cells.sort((a, b) => a.weekday - b.weekday || a.hour - b.hour)

  const totalOpenDays = openDays.reduce((a, b) => a + b, 0)
  const hourly = new Map<number, { orders: number; revenue: number }>()
  for (const cell of cells) {
    const entry = hourly.get(cell.hour) ?? { orders: 0, revenue: 0 }
    entry.orders += cell.orders
    entry.revenue += cell.revenue
    hourly.set(cell.hour, entry)
  }
  const byHour = [...hourly.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([hour, v]) => ({ hour, orders: v.orders, revenue: v.revenue, avgOrdersPerDay: round2(v.orders / Math.max(1, totalOpenDays)) }))

  const regular = cells.filter((cell) => cell.activeDays > REGULAR_SHARE * openDays[cell.weekday])
  const byLoad = (a: RushHourCell, b: RushHourCell): number => b.avgOrders - a.avgOrders || b.revenue - a.revenue
  const best = [...cells].sort(byLoad).slice(0, 3)
  const worst = [...regular].sort((a, b) => byLoad(b, a)).slice(0, 3)

  return { startDate: range.start, endDate: range.end, cells, openDays, byHour, best, worst, staffing: staffingBlocks(regular) }
}

/** Contiguous peak/quiet hour runs per weekday (see header). */
export function staffingBlocks(regular: RushHourCell[]): StaffingBlock[] {
  if (regular.length === 0) return []
  const baseline = regular.reduce((sum, cell) => sum + cell.avgOrders, 0) / regular.length
  if (!(baseline > 0)) return []
  const blocks: StaffingBlock[] = []
  for (let weekday = 0; weekday < 7; weekday++) {
    const day = regular.filter((cell) => cell.weekday === weekday).sort((a, b) => a.hour - b.hour)
    let run: RushHourCell[] = []
    let level: 'peak' | 'quiet' | null = null
    const close = (): void => {
      if (level && run.length > 0) {
        const avg = run.reduce((sum, cell) => sum + cell.avgOrders, 0) / run.length
        blocks.push({
          weekday,
          fromHour: run[0].hour,
          toHour: run[run.length - 1].hour + 1,
          level,
          avgOrders: round2(avg),
          loadFactor: round2(avg / baseline)
        })
      }
      run = []
      level = null
    }
    for (const cell of day) {
      const factor = cell.avgOrders / baseline
      const cellLevel = factor >= PEAK_FACTOR ? 'peak' : factor <= QUIET_FACTOR ? 'quiet' : null
      const contiguous = run.length > 0 && run[run.length - 1].hour + 1 === cell.hour
      if (cellLevel !== level || !contiguous) close()
      if (cellLevel) {
        level = cellLevel
        run.push(cell)
      }
    }
    close()
  }
  return blocks
}
