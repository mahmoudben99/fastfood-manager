/**
 * Restaurant-local calendar helpers. Algeria is permanently UTC+1 with no DST, so local wall
 * time is computed by shifting UTC by one hour — independent of the PC's own timezone setting
 * (same rule as businessDateInAlgiers in src/shared/order-edit.ts).
 *
 * SQL side: orders.created_at is an ISO UTC timestamp (legacy rows: 'YYYY-MM-DD HH:MM:SS' UTC),
 * so the local hour is strftime('%H', created_at, '+1 hour').
 */

export const LOCAL_OFFSET_MS = 60 * 60_000
/** SQLite modifier that turns a stored UTC timestamp into local wall time. */
export const SQL_LOCAL = "'+1 hour'"

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return false
  const d = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value
}

/** Throws a readable error unless `value` is a real YYYY-MM-DD date. */
export function assertIsoDate(value: unknown, label = 'date'): string {
  if (!isIsoDate(value)) throw new Error(`Invalid ${label}: expected YYYY-MM-DD`)
  return value
}

export function localDateOf(now: Date): string {
  return new Date(now.getTime() + LOCAL_OFFSET_MS).toISOString().slice(0, 10)
}

/** Local 'HH:MM'. */
export function localTimeOf(now: Date): string {
  return new Date(now.getTime() + LOCAL_OFFSET_MS).toISOString().slice(11, 16)
}

/** Minutes since local midnight. */
export function localMinutesOf(now: Date): number {
  const shifted = new Date(now.getTime() + LOCAL_OFFSET_MS)
  return shifted.getUTCHours() * 60 + shifted.getUTCMinutes()
}

/** 'HH:MM' → minutes since midnight. */
export function minutesOfTime(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** 0 = Sunday … 6 = Saturday (same numbering as work_schedule.day_of_week and SQLite %w). */
export function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay()
}

/** Whole days from `from` to `to` (to − from). */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)
}

/** Every date from start to end inclusive. */
export function dateRange(start: string, end: string): string[] {
  const out: string[] = []
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d)
  return out
}

/** Validates a reporting range (start ≤ end, at most `maxDays` long). */
export function assertRange(start: unknown, end: unknown, maxDays = 366): { start: string; end: string } {
  const s = assertIsoDate(start, 'start date')
  const e = assertIsoDate(end, 'end date')
  if (s > e) throw new Error('Start date must be on or before the end date')
  if (daysBetween(s, e) > maxDays) throw new Error(`Date range is limited to ${maxDays} days`)
  return { start: s, end: e }
}

/** SQLite-comparable UTC timestamp ('YYYY-MM-DD HH:MM:SS') for `now − days`. */
export function utcSqlTimestamp(date: Date): string {
  return date.toISOString().slice(0, 19).replace('T', ' ')
}
