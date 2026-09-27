import type Database from 'better-sqlite3'

/**
 * Domain error for the v4 cash modules (payments, shifts, delivery). The order service turns it
 * into an `{ ok: false, code, message }` result; IPC handlers let it reject with its message.
 * Messages that a UI must recognise start with a stable token (NO_OPEN_SHIFT:, SHIFT_ALREADY_OPEN:,
 * BELOW_MIN_ORDER:) because Electron only forwards an error's message to the renderer.
 */
export type CashErrorCode = 'invalid_input' | 'no_open_shift' | 'shift_open' | 'not_found' | 'not_allowed'

export class CashError extends Error {
  constructor(public code: CashErrorCode, message: string) {
    super(message)
    this.name = 'CashError'
  }
}

export const MAX_CASH_AMOUNT = 1_000_000_000

/** Whole-dinar amount in [min, MAX_CASH_AMOUNT], else a CashError naming `field`. */
export function wholeDinars(value: unknown, field: string, min = 0): number {
  const amount = Number(value)
  if (value === null || value === undefined || value === '' || !Number.isFinite(amount) ||
      !Number.isInteger(amount) || amount < min || amount > MAX_CASH_AMOUNT) {
    throw new CashError('invalid_input', `${field} must be a whole number of dinars${min > 0 ? ` of at least ${min}` : ''}`)
  }
  return amount
}

/** Trimmed, control-character-free text of at most `max` characters (null when empty). */
export function cleanText(value: unknown, max: number): string | null {
  if (value === null || value === undefined) return null
  const text = String(value).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim()
  return text ? text.slice(0, max) : null
}

export function settingValue(db: Database.Database, key: string): string | undefined {
  return (db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined)?.value
}
