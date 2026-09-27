/**
 * v4 time-based availability (lunch-only items, a Ramadan iftar menu…). Pure logic shared by the
 * main process (order-service enforcement, menu reads) and the AvailabilityEditor preview.
 *
 * A menu item or category with NO active rule is always available. With rules, it is available
 * while ANY rule matches (the windows add up). An item is sellable when its own rules AND its
 * category's rules allow it. Times are restaurant time: Algeria is UTC+1 all year (no DST).
 *
 * A window whose end is before its start runs overnight: "Fri 20:00 → 02:00" also covers
 * Saturday 00:00–02:00, and its weekday / date range are checked on the day it STARTED (so the
 * last Ramadan evening still runs past midnight). Equal start and end, or no times, = all day.
 */

export type AvailabilityTargetKind = 'menu_item' | 'category'
export type AvailabilityEnforce = 'warn' | 'block'

export interface AvailabilityTarget {
  kind: AvailabilityTargetKind
  id: number | null
}

export interface AvailabilityRule {
  id?: number
  label: string | null
  /** 0 = Sunday … 6 = Saturday. Empty = every day. */
  weekdays: number[]
  /** 'HH:MM' (24 h) or null. */
  start_time: string | null
  end_time: string | null
  /** 'YYYY-MM-DD' (inclusive) or null. */
  start_date: string | null
  end_date: string | null
  is_active: boolean
}

export interface AvailabilityState {
  rules: AvailabilityRule[]
  /** This target's own rules only (a category's rules also apply to its items). */
  available_now: boolean
  enforce: AvailabilityEnforce
}

export interface AlgiersClock {
  date: string
  weekday: number
  minutes: number
}

export const ALL_WEEKDAYS = [0, 1, 2, 3, 4, 5, 6]
const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/
const DATE = /^\d{4}-\d{2}-\d{2}$/

export function algiersClock(now: Date): AlgiersClock {
  const shifted = new Date(now.getTime() + 60 * 60_000)
  return {
    date: shifted.toISOString().slice(0, 10),
    weekday: shifted.getUTCDay(),
    minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes()
  }
}

export function timeToMinutes(value: string | null | undefined): number | null {
  if (!value) return null
  const match = TIME.exec(value)
  return match ? Number(match[1]) * 60 + Number(match[2]) : null
}

function previousDate(date: string): string {
  const day = new Date(`${date}T00:00:00Z`)
  day.setUTCDate(day.getUTCDate() - 1)
  return day.toISOString().slice(0, 10)
}

/** Does this one rule allow a sale at `clock`? */
export function ruleMatches(rule: AvailabilityRule, clock: AlgiersClock): boolean {
  if (!rule.is_active) return false
  const days = rule.weekdays.length ? rule.weekdays : ALL_WEEKDAYS
  const dayOk = (date: string, weekday: number): boolean =>
    days.includes(weekday) && (!rule.start_date || date >= rule.start_date) && (!rule.end_date || date <= rule.end_date)
  const start = timeToMinutes(rule.start_time) ?? 0
  const end = timeToMinutes(rule.end_time) ?? 24 * 60
  if (start === end) return dayOk(clock.date, clock.weekday)
  if (start < end) return clock.minutes >= start && clock.minutes < end && dayOk(clock.date, clock.weekday)
  // Overnight window: the evening part belongs to today, the early-morning part to yesterday.
  if (clock.minutes >= start) return dayOk(clock.date, clock.weekday)
  if (clock.minutes < end) return dayOk(previousDate(clock.date), (clock.weekday + 6) % 7)
  return false
}

/** No active rule = always available; otherwise any matching rule makes it available. */
export function rulesAllow(rules: AvailabilityRule[], now: Date): boolean {
  const active = rules.filter((rule) => rule.is_active)
  if (active.length === 0) return true
  const clock = algiersClock(now)
  return active.some((rule) => ruleMatches(rule, clock))
}

export type RuleProblem = 'bad_time' | 'bad_date' | 'date_order' | 'bad_weekday' | 'label_too_long'

/** Shape check for one rule (the main process refuses a list with any problem). */
export function ruleProblem(rule: AvailabilityRule): RuleProblem | null {
  if (!Array.isArray(rule.weekdays) || rule.weekdays.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) {
    return 'bad_weekday'
  }
  for (const time of [rule.start_time, rule.end_time]) {
    if (time !== null && timeToMinutes(time) === null) return 'bad_time'
  }
  for (const date of [rule.start_date, rule.end_date]) {
    if (date !== null && (!DATE.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`)))) return 'bad_date'
  }
  if (rule.start_date && rule.end_date && rule.end_date < rule.start_date) return 'date_order'
  if (rule.label && rule.label.length > 60) return 'label_too_long'
  return null
}

/** Weekday list ↔ bitmask (bit n = weekday n) as stored in availability_rules.weekdays. */
export function weekdaysToMask(days: number[]): number {
  return (days.length ? days : ALL_WEEKDAYS).reduce((mask, day) => mask | (1 << day), 0)
}

export function maskToWeekdays(mask: number): number[] {
  return ALL_WEEKDAYS.filter((day) => (mask & (1 << day)) !== 0)
}
