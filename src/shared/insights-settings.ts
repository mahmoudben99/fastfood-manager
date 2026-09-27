/**
 * Insights settings — keys, defaults, read-side parsing and write-side validation.
 * Pure: no imports, no side effects. Re-exported by src/shared/insights.ts.
 */

// ─── Settings ─────────────────────────────────────────────────────────────────

/** Settings keys used by insights. All values are stored as strings in the `settings` table. */
export const INSIGHTS_SETTING_KEYS = {
  /** 'true' | 'false' (default 'true') — Telegram morning prep plan + shopping list. */
  morningPrep: 'telegram_morning_prep',
  /** 'HH:MM' local time (default '09:00'). */
  morningPrepTime: 'telegram_morning_prep_time',
  /** Integer percent (default 30): a menu item below this gross margin is flagged. */
  profitMarginWarnPct: 'profit_margin_warn_pct',
  /** 'true' | 'false' (default 'true') — unusual cancellations alert. */
  alertCancellations: 'telegram_alert_cancellations',
  /** 'true' | 'false' (default 'true') — unusual discounts alert. */
  alertDiscounts: 'telegram_alert_discounts',
  /** 'true' | 'false' (default 'true') — slow-day alert. */
  alertSlowDay: 'telegram_alert_slow_day',
  /** 'HH:MM' local time (default '14:00') from which the slow-day check runs. */
  slowDayCheckTime: 'telegram_slow_day_time',
  /** Integer percent (default 70): today below this share of the usual revenue-so-far is slow. */
  slowDayThresholdPct: 'telegram_slow_day_threshold_pct',
  /** 'true' | 'false' (default 'true') — stock too low for today's forecast. */
  alertLowStock: 'telegram_alert_low_stock',
  /** 'true' | 'false' (default 'true') — a purchase pushed items under the margin threshold. */
  alertMargin: 'telegram_alert_margin',
  /** Internal (do not edit): JSON {date, sent[]} — per-day dedupe of sent Telegram messages. */
  alertLog: 'insights_alert_log'
} as const

export interface InsightsSettings {
  morningPrep: boolean
  morningPrepTime: string
  profitMarginWarnPct: number
  alertCancellations: boolean
  alertDiscounts: boolean
  alertSlowDay: boolean
  slowDayCheckTime: string
  slowDayThresholdPct: number
  alertLowStock: boolean
  alertMargin: boolean
}

export const DEFAULT_INSIGHTS_SETTINGS: InsightsSettings = {
  morningPrep: true,
  morningPrepTime: '09:00',
  profitMarginWarnPct: 30,
  alertCancellations: true,
  alertDiscounts: true,
  alertSlowDay: true,
  slowDayCheckTime: '14:00',
  slowDayThresholdPct: 70,
  alertLowStock: true,
  alertMargin: true
}

/** 'HH:MM' (00:00–23:59) or null. Accepts 'H:MM'. */
export function normalizeTimeOfDay(raw: unknown): string | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(raw ?? '').trim())
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) return null
  return `${String(hours).padStart(2, '0')}:${match[2]}`
}

/** Whole percent within [min, max] or null. */
export function normalizePercent(raw: unknown, min = 0, max = 100): number | null {
  const text = String(raw ?? '').trim()
  if (!/^-?\d+(\.\d+)?$/.test(text)) return null
  const value = Math.round(Number(text))
  return value >= min && value <= max ? value : null
}

function flag(raw: string | null | undefined, fallback: boolean): boolean {
  if (raw === 'true' || raw === '1') return true
  if (raw === 'false' || raw === '0') return false
  return fallback
}

/** Read side: stored strings → typed settings; missing/invalid values fall back to defaults. */
export function parseInsightsSettings(stored: Record<string, string | null | undefined>): InsightsSettings {
  const k = INSIGHTS_SETTING_KEYS
  const d = DEFAULT_INSIGHTS_SETTINGS
  return {
    morningPrep: flag(stored[k.morningPrep], d.morningPrep),
    morningPrepTime: normalizeTimeOfDay(stored[k.morningPrepTime]) ?? d.morningPrepTime,
    profitMarginWarnPct: normalizePercent(stored[k.profitMarginWarnPct], 0, 95) ?? d.profitMarginWarnPct,
    alertCancellations: flag(stored[k.alertCancellations], d.alertCancellations),
    alertDiscounts: flag(stored[k.alertDiscounts], d.alertDiscounts),
    alertSlowDay: flag(stored[k.alertSlowDay], d.alertSlowDay),
    slowDayCheckTime: normalizeTimeOfDay(stored[k.slowDayCheckTime]) ?? d.slowDayCheckTime,
    slowDayThresholdPct: normalizePercent(stored[k.slowDayThresholdPct], 10, 95) ?? d.slowDayThresholdPct,
    alertLowStock: flag(stored[k.alertLowStock], d.alertLowStock),
    alertMargin: flag(stored[k.alertMargin], d.alertMargin)
  }
}

/**
 * Write side: a partial typed patch → settings rows to store. Throws on an invalid value
 * (bad time, percent out of range) so the UI can show the message.
 */
export function serializeInsightsSettings(patch: Partial<InsightsSettings>): Record<string, string> {
  const k = INSIGHTS_SETTING_KEYS
  const out: Record<string, string> = {}
  const bool = (key: string, value: unknown): void => {
    if (value === undefined) return
    if (typeof value !== 'boolean') throw new Error(`${key} must be true or false`)
    out[key] = value ? 'true' : 'false'
  }
  const time = (key: string, value: unknown): void => {
    if (value === undefined) return
    const clean = normalizeTimeOfDay(value)
    if (!clean) throw new Error(`${key} must be a time like 09:00`)
    out[key] = clean
  }
  const pct = (key: string, value: unknown, min: number, max: number): void => {
    if (value === undefined) return
    const clean = normalizePercent(value, min, max)
    if (clean === null) throw new Error(`${key} must be a whole percent between ${min} and ${max}`)
    out[key] = String(clean)
  }
  bool(k.morningPrep, patch.morningPrep)
  time(k.morningPrepTime, patch.morningPrepTime)
  pct(k.profitMarginWarnPct, patch.profitMarginWarnPct, 0, 95)
  bool(k.alertCancellations, patch.alertCancellations)
  bool(k.alertDiscounts, patch.alertDiscounts)
  bool(k.alertSlowDay, patch.alertSlowDay)
  time(k.slowDayCheckTime, patch.slowDayCheckTime)
  pct(k.slowDayThresholdPct, patch.slowDayThresholdPct, 10, 95)
  bool(k.alertLowStock, patch.alertLowStock)
  bool(k.alertMargin, patch.alertMargin)
  return out
}
