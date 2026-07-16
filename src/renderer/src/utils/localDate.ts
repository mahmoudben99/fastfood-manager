/**
 * Restaurant-LOCAL calendar date (YYYY-MM-DD) for the machine's timezone.
 *
 * Mirrors localDate() in src/main/database/repositories/orders.repo.ts, which stores every
 * order's order_date on the LOCAL day. Defaulting date pickers to `new Date().toISOString()`
 * (UTC) meant that between local midnight and 01:00 in UTC+1 (Algeria) the UI defaulted to the
 * previous day and hid the late-night orders that had already rolled to the new local day —
 * exactly the busiest window for a fast-food shop.
 */
export function localToday(d = new Date()): string {
  const off = d.getTimezoneOffset() * 60000
  return new Date(d.getTime() - off).toISOString().split('T')[0]
}

/**
 * Render a stored UTC ISO timestamp (orders.created_at) in the restaurant's local time.
 * Printing the raw ISO string showed staff "2026-07-02T18:23:45.123Z" — unformatted, and an
 * hour behind the clock on the wall.
 */
export function formatDateTime(iso: string | null | undefined, locale?: string): string {
  if (!iso) return ''
  const d = new Date(normalizeStoredTimestamp(iso))
  if (Number.isNaN(d.getTime())) return String(iso)
  return d.toLocaleString(locale, {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit'
  })
}

/**
 * The DB holds two timestamp shapes: ISO-8601 with a trailing `Z` (written by `new Date()
 * .toISOString()`), and SQLite's `datetime('now')` — "YYYY-MM-DD HH:MM:SS", which is UTC but
 * carries no zone marker. V8 parses that second shape as LOCAL time, so it would be shifted by
 * the UTC offset. Tag it explicitly as UTC before parsing.
 */
function normalizeStoredTimestamp(value: string): string {
  const s = value.trim()
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s)) return s.replace(' ', 'T') + 'Z'
  return s
}
