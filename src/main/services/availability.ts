import type Database from 'better-sqlite3'
import {
  maskToWeekdays, ruleProblem, rulesAllow, weekdaysToMask,
  type AvailabilityEnforce, type AvailabilityRule, type AvailabilityState, type AvailabilityTargetKind
} from '../../shared/availability'
import { catalogLang } from './catalog-common'

/**
 * v4 time-based availability (migration 025). Rules per menu item / category; the pure matching
 * logic lives in src/shared/availability.ts. Setting `availability_enforce`: 'warn' (default:
 * menu reads flag `available_now`, screens warn) or 'block' (order-service refuses the item).
 */

const MAX_RULES = 20

interface RuleRow {
  id: number
  target_kind: AvailabilityTargetKind
  target_id: number
  label: string | null
  weekdays: number
  start_time: string | null
  end_time: string | null
  start_date: string | null
  end_date: string | null
  is_active: number
}

export class AvailabilityError extends Error {
  constructor(public code: string, message: string) {
    super(`AVAILABILITY_${code.toUpperCase()}: ${message}`)
  }
}

const readyDbs = new WeakSet<Database.Database>()
export function availabilityReady(db: Database.Database): boolean {
  if (readyDbs.has(db)) return true
  const ok = Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'availability_rules'").get())
  if (ok) readyDbs.add(db)
  return ok
}

const toRule = (row: RuleRow): AvailabilityRule => ({
  id: row.id,
  label: row.label,
  weekdays: maskToWeekdays(row.weekdays),
  start_time: row.start_time,
  end_time: row.end_time,
  start_date: row.start_date,
  end_date: row.end_date,
  is_active: row.is_active === 1
})

export function getEnforce(db: Database.Database): AvailabilityEnforce {
  const value = (db.prepare("SELECT value FROM settings WHERE key = 'availability_enforce'").get() as { value: string } | undefined)?.value
  return value === 'block' ? 'block' : 'warn'
}

export function setEnforce(db: Database.Database, mode: unknown): AvailabilityEnforce {
  if (mode !== 'warn' && mode !== 'block') throw new AvailabilityError('invalid_mode', 'Mode must be warn or block')
  db.prepare("INSERT INTO settings (key, value) VALUES ('availability_enforce', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .run(mode)
  return mode
}

export function getRules(db: Database.Database, kind: AvailabilityTargetKind, id: number): AvailabilityRule[] {
  if (!availabilityReady(db)) return []
  return (db.prepare(
    'SELECT * FROM availability_rules WHERE target_kind = ? AND target_id = ? ORDER BY sort_order, id'
  ).all(kind, id) as RuleRow[]).map(toRule)
}

function cleanRule(raw: Partial<AvailabilityRule> | null | undefined): AvailabilityRule {
  const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value.trim() : null)
  const rule: AvailabilityRule = {
    label: text(raw?.label),
    weekdays: Array.isArray(raw?.weekdays) ? [...new Set(raw!.weekdays.map(Number))].sort() : [],
    start_time: text(raw?.start_time),
    end_time: text(raw?.end_time),
    start_date: text(raw?.start_date),
    end_date: text(raw?.end_date),
    is_active: raw?.is_active !== false
  }
  const problem = ruleProblem(rule)
  if (problem) throw new AvailabilityError(problem, `Invalid availability rule (${problem})`)
  return rule
}

/** Replaces the target's rules (an empty list = always available). */
export function setRules(
  db: Database.Database,
  kind: AvailabilityTargetKind,
  id: number,
  rules: Partial<AvailabilityRule>[]
): AvailabilityRule[] {
  if (kind !== 'menu_item' && kind !== 'category') throw new AvailabilityError('invalid_target', 'Invalid target')
  const table = kind === 'menu_item' ? 'menu_items' : 'categories'
  if (!db.prepare(`SELECT 1 FROM ${table} WHERE id = ?`).get(id)) throw new AvailabilityError('not_found', 'Target not found')
  if (!Array.isArray(rules) || rules.length > MAX_RULES) throw new AvailabilityError('too_many', `At most ${MAX_RULES} rules`)
  const clean = rules.map(cleanRule)
  db.transaction(() => {
    db.prepare('DELETE FROM availability_rules WHERE target_kind = ? AND target_id = ?').run(kind, id)
    const insert = db.prepare(
      `INSERT INTO availability_rules
       (target_kind, target_id, label, weekdays, start_time, end_time, start_date, end_date, is_active, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    clean.forEach((rule, index) => insert.run(
      kind, id, rule.label, weekdaysToMask(rule.weekdays), rule.start_time, rule.end_time, rule.start_date, rule.end_date,
      rule.is_active ? 1 : 0, index
    ))
  })()
  return getRules(db, kind, id)
}

export function availabilityState(db: Database.Database, kind: AvailabilityTargetKind, id: number, now: Date): AvailabilityState {
  const rules = getRules(db, kind, id)
  return { rules, available_now: rulesAllow(rules, now), enforce: getEnforce(db) }
}

/** An item is sellable now when its own rules AND its category's rules allow it. */
export function itemAvailableNow(db: Database.Database, menu: { id: number; category_id: number }, now: Date): boolean {
  if (!availabilityReady(db)) return true
  return rulesAllow(getRules(db, 'menu_item', menu.id), now) && rulesAllow(getRules(db, 'category', menu.category_id), now)
}

/** All rules grouped by target, for bulk menu reads. */
export function availabilityIndex(db: Database.Database): { items: Map<number, AvailabilityRule[]>; categories: Map<number, AvailabilityRule[]> } {
  const items = new Map<number, AvailabilityRule[]>()
  const categories = new Map<number, AvailabilityRule[]>()
  if (!availabilityReady(db)) return { items, categories }
  for (const row of db.prepare('SELECT * FROM availability_rules WHERE is_active = 1 ORDER BY sort_order, id').all() as RuleRow[]) {
    const map = row.target_kind === 'menu_item' ? items : categories
    map.set(row.target_id, [...(map.get(row.target_id) ?? []), toRule(row)])
  }
  return { items, categories }
}

const MESSAGES = {
  en: (name: string) => `"${name}" is not available at this time`,
  fr: (name: string) => `« ${name} » n'est pas disponible à cette heure`,
  ar: (name: string) => `«${name}» غير متوفر في هذا الوقت`
}

/**
 * order-service hook: the translated refusal when enforcement is 'block' and the item is outside
 * its hours; null when it may be sold ('warn' mode never refuses).
 */
export function availabilityRejection(
  db: Database.Database,
  menu: { id: number; category_id: number; name: string; name_ar?: string | null; name_fr?: string | null },
  now: Date
): string | null {
  if (!availabilityReady(db) || getEnforce(db) !== 'block' || itemAvailableNow(db, menu, now)) return null
  const lang = catalogLang(db)
  const name = (lang === 'ar' ? menu.name_ar : lang === 'fr' ? menu.name_fr : null) || menu.name
  return MESSAGES[lang](name)
}
