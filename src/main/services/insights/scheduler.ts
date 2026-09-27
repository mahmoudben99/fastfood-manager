/**
 * Insights scheduler — pure tick logic. Dependencies (database, clock, Telegram sender) are
 * injected so tests drive `tick()` directly; runtime.ts wires the production ones and owns the
 * timer. Nothing here starts on import.
 *
 * Every tick (the runtime calls it once a minute):
 *   • keeps the upsell cache warm (rebuilt when older than 30 min)
 *   • morning prep: once per day, between telegram_morning_prep_time and +6 h, on days the work
 *     schedule does not mark closed → prep plan + shopping list. Critical stock lines it contains
 *     are marked as sent for the low-stock alert so the owner is not told twice.
 *   • alerts: evaluated at most every 5 minutes; each enabled, not-yet-sent alert kind is sent
 *     as one grouped message. Low-stock alerts start at the morning prep time (start of day).
 * Dedupe is per local day and persisted in settings (`insights_alert_log` = {date, sent[]}), so a
 * restart never re-sends. A failed send is retried after 10 minutes (kept in memory).
 */
import type Database from 'better-sqlite3'
import { INSIGHTS_SETTING_KEYS, parseInsightsSettings, type InsightAlertKind, type InsightsSettings } from '../../../shared/insights'
import { currencySymbol } from '../print-format'
import { localDateOf, localMinutesOf, minutesOfTime } from './dates'
import { evaluateAlerts, isOpenOn } from './alerts'
import { buildShoppingList } from './shopping-list'
import { composeAlertMessages, composeMorningPrepMessage } from './reports'
import { insightsLang, type InsightsLang } from './messages'
import { upsellCache } from './upsell'

export const ALERT_EVAL_INTERVAL_MS = 5 * 60_000
export const RETRY_BACKOFF_MS = 10 * 60_000
export const MORNING_WINDOW_MINUTES = 6 * 60
export const MORNING_PREP_KEY = 'morning_prep'

export interface SchedulerDeps {
  db: () => Database.Database
  now?: () => Date
  /** Sends one Telegram HTML message; resolves true when Telegram accepted it. */
  send: (html: string) => Promise<boolean>
  /** Bot token and owner chat id are configured. */
  telegramConfigured: () => boolean
  log?: (message: string) => void
}

export interface TickReport {
  /** Dedupe keys sent during this tick. */
  sent: string[]
  failed: string[]
  skipped?: 'telegram_not_configured'
}

// ─── Persisted per-day dedupe log ──────────────────────────────────────────────

export function readSentKeys(db: Database.Database, today: string): Set<string> {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(INSIGHTS_SETTING_KEYS.alertLog) as
    | { value: string }
    | undefined
  try {
    const parsed = JSON.parse(row?.value ?? '{}') as { date?: string; sent?: unknown }
    return parsed.date === today && Array.isArray(parsed.sent) ? new Set(parsed.sent.map(String)) : new Set()
  } catch {
    return new Set()
  }
}

export function markSent(db: Database.Database, today: string, keys: string[]): void {
  const sent = readSentKeys(db, today)
  for (const key of keys) sent.add(key)
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
    .run(INSIGHTS_SETTING_KEYS.alertLog, JSON.stringify({ date: today, sent: [...sent] }))
}

// ─── Settings snapshot ────────────────────────────────────────────────────────

export interface InsightsEnv {
  settings: InsightsSettings
  lang: InsightsLang
  currency: string
}

export function readInsightsEnv(db: Database.Database): InsightsEnv {
  const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[]
  const stored: Record<string, string> = {}
  for (const row of rows) stored[row.key] = row.value
  return { settings: parseInsightsSettings(stored), lang: insightsLang(stored), currency: currencySymbol(stored) }
}

export function enabledAlertKinds(settings: InsightsSettings): InsightAlertKind[] {
  const kinds: InsightAlertKind[] = []
  if (settings.alertCancellations) kinds.push('cancellations')
  if (settings.alertDiscounts) kinds.push('discounts')
  if (settings.alertSlowDay) kinds.push('slow_day')
  if (settings.alertLowStock) kinds.push('low_stock')
  if (settings.alertMargin) kinds.push('margin')
  return kinds
}

/** now is within [time, time + windowMinutes) local. */
export function inWindow(now: Date, time: string, windowMinutes: number): boolean {
  const offset = localMinutesOf(now) - minutesOfTime(time)
  return offset >= 0 && offset < windowMinutes
}

// ─── Scheduler ────────────────────────────────────────────────────────────────

export function createInsightsScheduler(deps: SchedulerDeps) {
  const clock = deps.now ?? (() => new Date())
  const log = deps.log ?? ((message: string) => console.log(`[Insights] ${message}`))
  const retryAfter = new Map<string, number>()
  let lastAlertEval = Number.NEGATIVE_INFINITY
  let running: Promise<TickReport> | null = null

  const backingOff = (key: string, nowMs: number): boolean => (retryAfter.get(key) ?? 0) > nowMs

  async function send(key: string, html: string, nowMs: number, report: TickReport): Promise<boolean> {
    let ok = false
    try {
      ok = await deps.send(html)
    } catch (error) {
      log(`send ${key} failed: ${error instanceof Error ? error.message : String(error)}`)
    }
    if (ok) {
      retryAfter.delete(key)
      report.sent.push(key)
    } else {
      retryAfter.set(key, nowMs + RETRY_BACKOFF_MS)
      report.failed.push(key)
    }
    return ok
  }

  async function runTick(): Promise<TickReport> {
    const now = clock()
    const nowMs = now.getTime()
    const db = deps.db()
    const report: TickReport = { sent: [], failed: [] }
    try {
      if (upsellCache.isStale(db, now)) upsellCache.model(db, now)
    } catch (error) {
      log(`upsell cache rebuild failed: ${error instanceof Error ? error.message : String(error)}`)
    }
    if (!deps.telegramConfigured()) return { ...report, skipped: 'telegram_not_configured' }

    const env = readInsightsEnv(db)
    const today = localDateOf(now)
    const sent = readSentKeys(db, today)

    if (
      env.settings.morningPrep && !sent.has(MORNING_PREP_KEY) && !backingOff(MORNING_PREP_KEY, nowMs) &&
      inWindow(now, env.settings.morningPrepTime, MORNING_WINDOW_MINUTES) && isOpenOn(db, today)
    ) {
      const list = buildShoppingList(db, today)
      if (await send(MORNING_PREP_KEY, composeMorningPrepMessage(list, env), nowMs, report)) {
        const covered = list.items.filter((item) => item.critical).map((item) => `low_stock:${item.stockItemId}`)
        markSent(db, today, [MORNING_PREP_KEY, ...covered])
        covered.forEach((key) => sent.add(key))
      }
    }

    // "Needed today" only makes sense once the day has started: no low-stock alert at midnight.
    const dayStarted = localMinutesOf(now) >= minutesOfTime(env.settings.morningPrepTime)
    const kinds = enabledAlertKinds(env.settings).filter((kind) => kind !== 'low_stock' || dayStarted)
    if (kinds.length > 0 && nowMs - lastAlertEval >= ALERT_EVAL_INTERVAL_MS) {
      lastAlertEval = nowMs
      const pending = evaluateAlerts(db, { now, ...env, kinds, sentKeys: sent }).filter((alert) => !alert.sent)
      for (const message of composeAlertMessages(pending)) {
        if (backingOff(message.kind, nowMs)) continue
        if (await send(message.kind, message.text, nowMs, report)) markSent(db, today, message.keys)
      }
    }
    return report
  }

  return {
    /** One scheduler pass; concurrent calls share the pass already running. */
    tick(): Promise<TickReport> {
      if (!running) running = runTick().finally(() => { running = null })
      return running
    },
    /** Forget in-memory backoff / evaluation timers (persisted dedupe is kept). */
    reset(): void {
      retryAfter.clear()
      lastAlertEval = Number.NEGATIVE_INFINITY
    }
  }
}
