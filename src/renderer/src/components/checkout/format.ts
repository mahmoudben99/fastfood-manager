import type { TFunction } from 'i18next'
import { elapsedParts, parseDbDate } from './tender'

/** Intl locale with Latin digits (Algeria writes Latin digits in Arabic too). */
export function intlLocale(language: string): string {
  if (language === 'ar') return 'ar-DZ-u-nu-latn'
  if (language === 'fr') return 'fr-DZ'
  return 'en-GB'
}

/** "3 days ago" / "il y a 3 jours" / "قبل 3 أيام" (today / yesterday wording from Intl). */
export function relativeDay(value: string | null | undefined, language: string, now: Date = new Date()): string {
  const date = parseDbDate(value)
  if (!date) return ''
  const startOf = (d: Date): number => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const days = Math.round((startOf(date) - startOf(now)) / 86_400_000)
  const format = new Intl.RelativeTimeFormat(intlLocale(language), { numeric: 'auto' })
  if (Math.abs(days) < 31) return format.format(days, 'day')
  const months = Math.round(days / 30)
  if (Math.abs(months) < 12) return format.format(months, 'month')
  return format.format(Math.round(days / 365), 'year')
}

/** "14:05" in local time. */
export function timeOf(value: string | null | undefined, language: string): string {
  const date = parseDbDate(value)
  if (!date) return ''
  return date.toLocaleTimeString(intlLocale(language), { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
}

/** "2 h 05 min" / "2 سا 05 د" since `iso`. */
export function elapsedText(t: TFunction, iso: string, now: Date = new Date()): string {
  const parts = elapsedParts(iso, now)
  if (!parts) return ''
  return parts.h > 0
    ? t('checkout.shift.elapsedHM', { h: parts.h, m: String(parts.m).padStart(2, '0') })
    : t('checkout.shift.elapsedM', { m: parts.m })
}

/** "27/09/2026". */
export function shortDate(value: string | null | undefined, language: string): string {
  const date = parseDbDate(value)
  if (!date) return ''
  return date.toLocaleDateString(intlLocale(language), { day: '2-digit', month: '2-digit', year: 'numeric' })
}

/** Localised catalog name snapshot (name_ar / name_fr fall back to the base name). */
export function localName(item: { name: string; name_ar?: string | null; name_fr?: string | null }, language: string): string {
  if (language === 'ar' && item.name_ar) return item.name_ar
  if (language === 'fr' && item.name_fr) return item.name_fr
  return item.name
}
