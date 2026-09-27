/**
 * Small pure helpers shared by the dashboard and the insights pages: localized names, local
 * calendar maths (restaurant-local YYYY-MM-DD, same as orders.order_date), quantities and percents.
 */
import { useCallback } from 'react'
import type { TFunction } from 'i18next'
import { useAppStore } from '../../../store/appStore'
import { localToday } from '../../../utils/localDate'

export interface Named {
  name: string
  name_ar?: string | null
  name_fr?: string | null
}

/** Name in the food language (menu / stock names are entered per language). */
export function pickName(item: Named, lang: string): string {
  if (lang === 'ar' && item.name_ar) return item.name_ar
  if (lang === 'fr' && item.name_fr) return item.name_fr
  return item.name
}

export function useLocalName(): (item: Named) => string {
  const lang = useAppStore((s) => s.foodLanguage)
  return useCallback((item: Named) => pickName(item, lang), [lang])
}

export function today(): string {
  return localToday()
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** 0 = Sunday … 6 = Saturday. */
export function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay()
}

/** Algerian week order for weekday rows: Saturday first (Friday is the weekend). */
export const WEEK_ORDER = [6, 0, 1, 2, 3, 4, 5]

const LOCALES: Record<string, string> = { en: 'en-GB', fr: 'fr-FR', ar: 'ar-DZ' }

/** "Saturday 27 September" in the UI language (Latin digits everywhere). */
export function longDate(date: string, lang: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString(`${LOCALES[lang] ?? 'en-GB'}-u-nu-latn`, {
    weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC'
  })
}

/** "27 Sep" in the UI language. */
export function shortDate(date: string, lang: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString(`${LOCALES[lang] ?? 'en-GB'}-u-nu-latn`, {
    day: 'numeric', month: 'short', timeZone: 'UTC'
  })
}

/** "19:00" for an hour 0–23. */
export function hourLabel(hour: number): string {
  return `${String(hour % 24).padStart(2, '0')}:00`
}

/** "19–22h" style range, end exclusive. */
export function hourRange(from: number, to: number): string {
  return `${hourLabel(from)}–${hourLabel(to)}`
}

/** Up to `decimals` decimals, trailing zeros trimmed, Latin digits. */
export function formatNumber(value: number, decimals = 1): string {
  if (!Number.isFinite(value)) return '0'
  const fixed = value.toFixed(decimals)
  return decimals > 0 ? fixed.replace(/\.?0+$/, '') : fixed
}

/** "12.5 kg", "350 g", "3 pcs" — below 1 kg / 1 L the kitchen reads grams / millilitres. */
export function formatQty(value: number, unit: string, t: TFunction): string {
  const key = unit === 'kg' || unit === 'liter' || unit === 'unit' ? unit : 'unit'
  if (key !== 'unit' && value !== 0 && Math.abs(value) < 1) {
    const small = value * 1000
    return `${formatNumber(small, Math.abs(small) < 10 ? 1 : 0)} ${t(`insights.units.${key === 'kg' ? 'g' : 'ml'}`)}`
  }
  const decimals = key === 'unit' ? (Math.abs(value) < 10 ? 1 : 0) : 2
  return `${formatNumber(value, decimals)} ${t(`insights.units.${key}`)}`
}

/**
 * "+12%" / "−4%" (true minus sign), wrapped in a left-to-right isolate so the sign stays in front
 * inside Arabic sentences.
 */
const LRI = '\u2066'
const PDI = '\u2069'

export function signedPct(value: number, decimals = 0): string {
  const rounded = Number(value.toFixed(decimals))
  if (rounded === 0) return `${LRI}0%${PDI}`
  return `${LRI}${rounded > 0 ? '+' : '\u2212'}${formatNumber(Math.abs(rounded), decimals)}%${PDI}`
}
