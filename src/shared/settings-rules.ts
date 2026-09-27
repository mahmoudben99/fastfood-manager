/**
 * Pure settings/receipt rules shared by the main process and the renderer.
 * No imports, no side effects — unit-tested directly under Node (test-harness/unit/settings-rules.test.mjs).
 */

/** Currency symbol used whenever `settings.currency_symbol` is empty (contract C4). */
export const DEFAULT_CURRENCY_SYMBOL = 'DA'

/** Default "order is late" threshold, in minutes. */
export const DEFAULT_ORDER_ALERT_MINUTES = 20
export const MAX_ORDER_ALERT_MINUTES = 1440

/**
 * Validate an `order_alert_minutes` value. Returns a whole number of minutes in
 * [1, MAX_ORDER_ALERT_MINUTES], or null when the value is missing/zero/negative/non-numeric.
 * (0 or a negative value made every order on the order screen show as late.)
 */
export function normalizeOrderAlertMinutes(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null
  const text = String(raw).trim()
  if (!/^\d+(\.\d+)?$/.test(text)) return null
  const n = Math.floor(Number(text))
  if (!Number.isFinite(n) || n < 1) return null
  return Math.min(n, MAX_ORDER_ALERT_MINUTES)
}

/** Read-side clamp: always a usable value (invalid stored values fall back to the default). */
export function orderAlertMinutesOrDefault(raw: unknown): number {
  return normalizeOrderAlertMinutes(raw) ?? DEFAULT_ORDER_ALERT_MINUTES
}

export interface SocialMediaEntry {
  platform: string
  handle: string
}

export const SOCIAL_PLATFORMS: { value: string; label: string }[] = [
  { value: 'facebook', label: 'Facebook' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'snapchat', label: 'Snapchat' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'twitter', label: 'X / Twitter' },
  { value: 'youtube', label: 'YouTube' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'threads', label: 'Threads' },
  { value: 'telegram', label: 'Telegram' }
]

function toEntries(value: unknown): SocialMediaEntry[] {
  if (!Array.isArray(value)) return []
  const out: SocialMediaEntry[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const platform = String((item as { platform?: unknown }).platform ?? '').trim()
    const handle = String((item as { handle?: unknown }).handle ?? '')
    if (!platform) continue
    out.push({ platform, handle })
  }
  return out
}

/**
 * Parse the `settings.social_media` JSON (the single source of truth read by the receipt printer,
 * the tablet/TV server and cloud sync). Never throws; corrupt JSON reads as an empty list.
 */
export function parseSocialMedia(raw: unknown): SocialMediaEntry[] {
  if (typeof raw !== 'string' || !raw.trim()) return []
  try {
    return toEntries(JSON.parse(raw))
  } catch {
    return []
  }
}

/** Serialize for `settings.social_media`: trims handles and drops blank rows. */
export function serializeSocialMedia(items: unknown): string {
  const clean = toEntries(items)
    .map((s) => ({ platform: s.platform, handle: s.handle.trim() }))
    .filter((s) => s.handle.length > 0)
  return JSON.stringify(clean)
}

/**
 * One-time migration of the legacy `social_media` SQL table (written only by the old Receipt
 * Editor, never printed) into `settings.social_media`. Returns the JSON to store, or null when
 * nothing should change (the setting already has entries, or the table is empty).
 */
export function migrateLegacySocialRows(settingRaw: unknown, rows: unknown): string | null {
  if (parseSocialMedia(settingRaw).length > 0) return null
  const legacy = toEntries(rows).filter((s) => s.handle.trim().length > 0)
  if (legacy.length === 0) return null
  return serializeSocialMedia(legacy)
}

/**
 * Give every receipt block a unique, non-empty id. Templates saved by older versions could
 * contain duplicate ids (a module-level counter restarted at 100 after every app restart), which
 * made editing one block change another. Returns a new array; blocks with good ids keep them.
 */
export function healBlockIds<T extends { id?: unknown }>(blocks: T[], makeId: () => string): (T & { id: string })[] {
  const seen = new Set<string>()
  return blocks.map((block) => {
    let id = typeof block.id === 'string' || typeof block.id === 'number' ? String(block.id) : ''
    while (!id || seen.has(id)) id = makeId()
    seen.add(id)
    return { ...block, id }
  })
}
