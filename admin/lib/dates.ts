const ALGIERS_TIME_ZONE = 'Africa/Algiers'

export function formatAlgiersDate(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: ALGIERS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date)
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${value.year}-${value.month}-${value.day}`
}

export function algiersDaysAgo(days: number): string {
  return formatAlgiersDate(new Date(Date.now() - days * 24 * 60 * 60 * 1000))
}
