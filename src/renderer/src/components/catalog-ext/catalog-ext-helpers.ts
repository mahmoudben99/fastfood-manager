import type { AvailabilityRule } from '../../../../shared/availability'

/**
 * Helpers shared by the ChannelPricesEditor / AvailabilityEditor (v4 channels + availability).
 */

/** "…Error: CHANNEL_INVALID_PRICE: …" → "invalid_price" (IPC errors keep only their message). */
export function errorCode(error: unknown, prefix: 'CHANNEL' | 'AVAILABILITY'): string {
  const text = error instanceof Error ? error.message : String(error ?? '')
  const match = new RegExp(`${prefix}_([A-Z_]+):`).exec(text)
  return match ? match[1].toLowerCase() : 'generic'
}

/** 'YYYY-MM-DD' of a Date in Algiers time (UTC+1, no DST). */
export function algiersDate(date: Date): string {
  return new Date(date.getTime() + 60 * 60_000).toISOString().slice(0, 10)
}

/**
 * The next (or current) Ramadan as Umm al-Qura dates, looked up day by day with the browser's
 * Islamic calendar. Moon sighting in Algeria can differ by a day: the owner adjusts the dates.
 */
export function nextRamadan(from: Date = new Date()): { start: string; end: string } | null {
  let format: Intl.DateTimeFormat
  try {
    format = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura-nu-latn', { month: 'numeric', timeZone: 'UTC' })
  } catch {
    return null
  }
  const month = (day: Date): number => Number(format.format(day))
  const day = new Date(`${algiersDate(from)}T12:00:00Z`)
  let start: Date | null = null
  for (let i = 0; i < 420; i++) {
    const inRamadan = month(day) === 9
    if (inRamadan && !start) start = new Date(day)
    if (!inRamadan && start) {
      day.setUTCDate(day.getUTCDate() - 1)
      return { start: start.toISOString().slice(0, 10), end: day.toISOString().slice(0, 10) }
    }
    day.setUTCDate(day.getUTCDate() + 1)
  }
  return null
}

export type RulePreset = 'lunch' | 'dinner' | 'ramadan'

export function presetRule(preset: RulePreset, label: string): AvailabilityRule {
  const base: AvailabilityRule = {
    label, weekdays: [], start_time: null, end_time: null, start_date: null, end_date: null, is_active: true
  }
  if (preset === 'lunch') return { ...base, start_time: '11:00', end_time: '15:00' }
  if (preset === 'dinner') return { ...base, start_time: '18:00', end_time: '23:00' }
  const ramadan = nextRamadan()
  return { ...base, start_time: '17:30', end_time: '02:00', start_date: ramadan?.start ?? null, end_date: ramadan?.end ?? null }
}

export const emptyRule = (): AvailabilityRule => ({
  label: null, weekdays: [], start_time: '11:00', end_time: '15:00', start_date: null, end_date: null, is_active: true
})
