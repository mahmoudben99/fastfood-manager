import type Database from 'better-sqlite3'
import { createHash, randomInt, timingSafeEqual } from 'crypto'
import { KDS_EXPO_STATION, type KdsDisplaySettings, type KdsSettings } from '../../../shared/kds'

/**
 * KDS settings live in the plain `settings` key/value table. Deliberately free of Electron and
 * repository imports (read straight from the injected db) so the LAN handler and the unit tests
 * can use it under Electron-as-node.
 */
export const KDS_KEYS = {
  warnMinutes: 'kds_warn_minutes',
  lateMinutes: 'kds_late_minutes',
  sound: 'kds_sound',
  flash: 'kds_flash',
  boardClearMinutes: 'ready_board_clear_minutes',
  pin: 'kds_pin',
  pinVersion: 'kds_pin_version',
  kdsDisplay: 'kds_display_id',
  boardDisplay: 'board_display_id'
} as const

/** `kds_replaces_paper_<workerId>` / `kds_replaces_paper_expo` = 'true' → no automatic paper. */
export const KDS_PAPER_PREFIX = 'kds_replaces_paper_'

export const KDS_DEFAULTS = { warnMinutes: 5, lateMinutes: 8, boardClearMinutes: 5 }

function get(db: Database.Database, key: string): string | undefined {
  return (db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined)?.value
}

function put(db: Database.Database, key: string, value: string): void {
  db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(key, value)
}

function minutes(raw: string | undefined, fallback: number, max: number): number {
  const value = Number(raw)
  return Number.isFinite(value) && value >= 1 && value <= max ? Math.round(value) : fallback
}

export function paperKeyFor(station: number): string {
  return KDS_PAPER_PREFIX + (station === KDS_EXPO_STATION ? 'expo' : String(station))
}

export function readPaperlessStations(db: Database.Database): number[] {
  const rows = db.prepare(
    "SELECT key FROM settings WHERE substr(key, 1, 19) = 'kds_replaces_paper_' AND value = 'true'"
  ).all() as { key: string }[]
  const stations = new Set<number>()
  for (const row of rows) {
    const suffix = row.key.slice(KDS_PAPER_PREFIX.length)
    if (suffix === 'expo') stations.add(KDS_EXPO_STATION)
    else if (/^\d+$/.test(suffix) && Number(suffix) > 0) stations.add(Number(suffix))
  }
  return [...stations].sort((a, b) => a - b)
}

/** The KDS pairing PIN; generated on first use so a kitchen screen is never unprotected. */
export function ensureKdsPin(db: Database.Database): string {
  const existing = get(db, KDS_KEYS.pin)
  if (existing && /^\d{4,6}$/.test(existing)) return existing
  const pin = String(randomInt(0, 10_000)).padStart(4, '0')
  put(db, KDS_KEYS.pin, pin)
  put(db, KDS_KEYS.pinVersion, String(Number(get(db, KDS_KEYS.pinVersion) || '0') + 1))
  return pin
}

/** Timers, alerts and board clearing — everything a screen needs (no PIN, no writes). */
export function readKdsDisplaySettings(db: Database.Database): KdsDisplaySettings & { boardClearMinutes: number } {
  const warnMinutes = minutes(get(db, KDS_KEYS.warnMinutes), KDS_DEFAULTS.warnMinutes, 240)
  let lateMinutes = minutes(get(db, KDS_KEYS.lateMinutes), KDS_DEFAULTS.lateMinutes, 480)
  if (lateMinutes <= warnMinutes) lateMinutes = warnMinutes + 1
  return {
    warnMinutes,
    lateMinutes,
    sound: get(db, KDS_KEYS.sound) !== 'false',
    flash: get(db, KDS_KEYS.flash) !== 'false',
    boardClearMinutes: minutes(get(db, KDS_KEYS.boardClearMinutes), KDS_DEFAULTS.boardClearMinutes, 240)
  }
}

export function readKdsSettings(db: Database.Database): KdsSettings {
  return { ...readKdsDisplaySettings(db), paperlessStations: readPaperlessStations(db), pin: ensureKdsPin(db) }
}

export interface KdsSettingsPatch {
  warnMinutes?: number
  lateMinutes?: number
  sound?: boolean
  flash?: boolean
  boardClearMinutes?: number
  paperlessStations?: number[]
}

/** Validates at the boundary: unknown fields are ignored, bad values are refused. */
export function saveKdsSettings(db: Database.Database, patch: KdsSettingsPatch): { ok: true } | { ok: false; error: string } {
  if (!patch || typeof patch !== 'object') return { ok: false, error: 'invalid_settings' }
  const whole = (value: unknown, max: number): value is number =>
    typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= max
  const current = { ...readKdsDisplaySettings(db), paperlessStations: readPaperlessStations(db) }
  const warn = patch.warnMinutes ?? current.warnMinutes
  const late = patch.lateMinutes ?? current.lateMinutes
  if (!whole(warn, 240) || !whole(late, 480) || late <= warn) return { ok: false, error: 'invalid_timers' }
  if (patch.boardClearMinutes !== undefined && !whole(patch.boardClearMinutes, 240)) {
    return { ok: false, error: 'invalid_board_clear' }
  }
  if (patch.paperlessStations !== undefined &&
      (!Array.isArray(patch.paperlessStations) ||
       patch.paperlessStations.some((id) => !Number.isInteger(id) || id < 0))) {
    return { ok: false, error: 'invalid_stations' }
  }
  db.transaction(() => {
    put(db, KDS_KEYS.warnMinutes, String(warn))
    put(db, KDS_KEYS.lateMinutes, String(late))
    if (typeof patch.sound === 'boolean') put(db, KDS_KEYS.sound, String(patch.sound))
    if (typeof patch.flash === 'boolean') put(db, KDS_KEYS.flash, String(patch.flash))
    if (patch.boardClearMinutes !== undefined) put(db, KDS_KEYS.boardClearMinutes, String(patch.boardClearMinutes))
    if (patch.paperlessStations !== undefined) {
      const wanted = new Set(patch.paperlessStations)
      for (const station of current.paperlessStations) {
        if (!wanted.has(station)) put(db, paperKeyFor(station), 'false')
      }
      for (const station of wanted) put(db, paperKeyFor(station), 'true')
    }
  })()
  return { ok: true }
}

/** Changing the PIN bumps the version, which invalidates every paired kitchen screen. */
export function setKdsPin(db: Database.Database, pin: string): { ok: true } | { ok: false; error: string } {
  if (typeof pin !== 'string' || !/^\d{4,6}$/.test(pin)) return { ok: false, error: 'invalid_pin' }
  db.transaction(() => {
    put(db, KDS_KEYS.pin, pin)
    put(db, KDS_KEYS.pinVersion, String(Number(get(db, KDS_KEYS.pinVersion) || '0') + 1))
  })()
  return { ok: true }
}

/** Stateless session token (same model as the tablet PIN): derived from PIN + version. */
export function kdsToken(db: Database.Database): string {
  const pin = ensureKdsPin(db)
  const version = get(db, KDS_KEYS.pinVersion) || '1'
  return createHash('sha256').update(`kds:${pin}:${version}`).digest('hex')
}

export function checkKdsPin(db: Database.Database, pin: unknown): boolean {
  const expected = Buffer.from(ensureKdsPin(db))
  const given = Buffer.from(typeof pin === 'string' ? pin : String(pin ?? ''))
  return given.length === expected.length && timingSafeEqual(given, expected)
}

export function verifyKdsToken(db: Database.Database, token: string | null | undefined): boolean {
  if (!token || typeof token !== 'string' || token.length !== 64) return false
  const expected = Buffer.from(kdsToken(db))
  const given = Buffer.from(token)
  return given.length === expected.length && timingSafeEqual(given, expected)
}

export function readDisplayChoice(db: Database.Database, kind: 'kds' | 'board'): number | null {
  const raw = get(db, kind === 'kds' ? KDS_KEYS.kdsDisplay : KDS_KEYS.boardDisplay)
  const id = Number(raw)
  return raw && Number.isFinite(id) ? id : null
}

export function saveDisplayChoice(db: Database.Database, kind: 'kds' | 'board', displayId: number): void {
  put(db, kind === 'kds' ? KDS_KEYS.kdsDisplay : KDS_KEYS.boardDisplay, String(displayId))
}

export function restaurantName(db: Database.Database): string {
  return get(db, 'restaurant_name') || ''
}

export function uiLanguage(db: Database.Database): string {
  const lang = get(db, 'language')
  return lang === 'fr' || lang === 'ar' ? lang : 'en'
}
