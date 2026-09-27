/** Date / time for the Compliance page: restaurant time (Algiers), Latin digits in every language. */
export function formatDateTime(iso: string | null | undefined, lang: string, withTime = true): string {
  if (!iso) return '—'
  const date = new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso)
  if (Number.isNaN(date.getTime())) return '—'
  const locale = lang === 'ar' ? 'ar-DZ-u-nu-latn' : lang === 'fr' ? 'fr-DZ' : 'en-GB'
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    ...(withTime ? { timeStyle: 'short', hourCycle: 'h23' } : {}),
    timeZone: 'Africa/Algiers'
  }).format(date)
}
