/**
 * Pure checkout math (no React, no window.api) — unit-tested in test-harness/unit/checkout-tender.test.mjs.
 * Amounts are whole Algerian dinars (DA).
 */
import {
  DZD_DENOMINATIONS, cashBreakdown, denominationsTotal, roundCash,
  type DenominationCounts, type DenominationKey, type OrderPaymentInput
} from '../../../../shared/cash'
import type { RepeatOrderLine } from '../../../../shared/customer-lookup'
import type { RepeatLine } from './contracts'

/** Longest amount the numpad accepts (9 999 999 DA). */
export const MAX_ENTRY_DIGITS = 7

export type NumpadKey = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '00' | 'back' | 'clear'

/** Applies one numpad key to a digit string ('' = nothing typed). No leading zeros. */
export function applyKey(entry: string, key: NumpadKey | string, maxDigits = MAX_ENTRY_DIGITS): string {
  if (key === 'clear') return ''
  if (key === 'back') return entry.slice(0, -1)
  if (!/^\d{1,2}$/.test(key)) return entry
  const next = (entry + key).replace(/^0+(?=\d)/, '')
  if (next === '0' || next === '00') return entry === '' ? '' : entry
  return next.length > maxDigits ? entry : next
}

/** Digit string → number, or null when empty. */
export function entryValue(entry: string): number | null {
  if (!entry) return null
  const value = Number(entry)
  return Number.isFinite(value) ? value : null
}

/** Maps a physical key (KeyboardEvent.key) to a numpad key, else null. */
export function keyFromKeyboard(key: string): NumpadKey | null {
  if (/^[0-9]$/.test(key)) return key as NumpadKey
  if (key === 'Backspace') return 'back'
  if (key === 'Delete') return 'clear'
  return null
}

/**
 * Quick-tender suggestions above `due`: the next 100, the next 500 / 1000 / 2000 notes and a
 * couple of bigger round amounts, ascending, unique, strictly above due.
 */
export function quickTenders(due: number, max = 4): number[] {
  const amount = Math.max(0, Math.round(due))
  if (amount <= 0) return [200, 500, 1000, 2000].slice(0, max)
  const up = (step: number): number => Math.ceil(amount / step) * step
  const candidates = [up(100), up(500), up(1000), up(2000), up(500) + 500, up(1000) + 1000, up(2000) + 2000]
  return [...new Set(candidates.filter((value) => value > amount))].sort((a, b) => a - b).slice(0, max)
}

/** Largest cash amount ≤ `value` that the rounding step can take as-is (partial cash payments). */
export function partialCashAmount(value: number, step: number): number {
  const whole = Math.max(0, Math.floor(value))
  return step > 0 ? Math.floor(whole / step) * step : whole
}

export interface TenderLine {
  method: string
  amount: number
  tendered?: number
  reference?: string
}

export interface TenderState {
  /** Rounded order total (whole DA). */
  total: number
  /** Split lines already added. */
  lines: TenderLine[]
  /** Method being entered. */
  method: string
  /** Numpad digits for the current method: cash = cash handed over, others = amount charged. */
  entry: string
  reference: string
  /** Setting cash_rounding (0 | 5 | 10). */
  step: number
}

export interface TenderView {
  /** Σ amounts of the added lines. */
  paid: number
  /** Still to pay before the current method. */
  balance: number
  /** Cash: rounded amount owed for the balance; others: = balance. */
  due: number
  /** Cash rounding delta (due − balance). */
  rounding: number
  /** Cash: what was handed over (empty entry = exact). Others: amount charged now. */
  current: number
  /** Cash change to give back (0 when short). */
  change: number
  /** Cash: missing amount; others: amount left after this method. */
  short: number
  /** The current method settles the balance → Confirm is possible. */
  complete: boolean
  /** The current entry is a valid part payment → "Add & split" is possible. */
  canSplit: boolean
  /** Non-cash amount above the balance. */
  overBalance: boolean
}

export function tenderView(state: TenderState): TenderView {
  const paid = state.lines.reduce((sum, line) => sum + line.amount, 0)
  const balance = Math.max(0, state.total - paid)
  const typed = entryValue(state.entry)
  if (state.method === 'cash') {
    const due = roundCash(balance, state.step)
    const current = typed ?? due
    const cash = cashBreakdown(balance, current, state.step)
    const complete = balance === 0 || cash.sufficient
    return {
      paid,
      balance,
      due,
      rounding: cash.rounding,
      current,
      change: complete && balance > 0 ? cash.change ?? 0 : 0,
      short: complete ? 0 : due - current,
      complete,
      canSplit: !complete && partialCashAmount(current, state.step) > 0,
      overBalance: false
    }
  }
  const current = typed ?? balance
  const overBalance = current > balance
  return {
    paid,
    balance,
    due: balance,
    rounding: 0,
    current,
    change: 0,
    short: Math.max(0, balance - current),
    complete: !overBalance && current === balance,
    canSplit: !overBalance && current > 0 && current < balance,
    overBalance
  }
}

/** Adds the current entry as a part payment (split) and resets the entry. */
export function commitPart(state: TenderState): TenderState {
  const view = tenderView(state)
  if (!view.canSplit) return state
  const line: TenderLine = state.method === 'cash'
    ? { method: 'cash', amount: partialCashAmount(view.current, state.step), tendered: partialCashAmount(view.current, state.step) }
    : { method: state.method, amount: view.current, ...(state.reference.trim() ? { reference: state.reference.trim() } : {}) }
  return { ...state, lines: [...state.lines, line], entry: '', reference: '' }
}

/** Payment lines for orders.create, or null while the balance is not covered. */
export function buildPayments(state: TenderState): OrderPaymentInput[] | null {
  if (state.total <= 0) return []
  const view = tenderView(state)
  const lines: OrderPaymentInput[] = state.lines.map((line) => ({
    method: line.method,
    amount: line.amount,
    ...(line.tendered !== undefined ? { tendered: line.tendered } : {}),
    ...(line.reference ? { reference: line.reference.slice(0, 100) } : {})
  }))
  if (view.balance === 0) return lines
  if (!view.complete) return null
  if (state.method === 'cash') {
    lines.push({ method: 'cash', amount: view.balance, tendered: view.current })
  } else {
    const reference = state.reference.trim().slice(0, 100)
    lines.push({ method: state.method, amount: view.balance, ...(reference ? { reference } : {}) })
  }
  return lines
}

// ── Shift drawer ──

/** Count per denomination → total (invalid counts are ignored rather than thrown in the UI). */
export function countedTotal(counts: DenominationCounts): number {
  const clean: DenominationCounts = {}
  for (const d of DZD_DENOMINATIONS) {
    const n = Number(counts[d.key] ?? 0)
    if (Number.isInteger(n) && n > 0) clean[d.key] = n
  }
  return denominationsTotal(clean)
}

/** Only the denominations with a count (what shifts.close expects). */
export function nonZeroCounts(counts: DenominationCounts): DenominationCounts {
  const out: DenominationCounts = {}
  for (const d of DZD_DENOMINATIONS) {
    const n = Number(counts[d.key] ?? 0)
    if (Number.isInteger(n) && n > 0) out[d.key as DenominationKey] = n
  }
  return out
}

export type OverShortTone = 'balanced' | 'over' | 'short'

export function overShortTone(value: number | null | undefined): OverShortTone {
  if (!value) return 'balanced'
  return value > 0 ? 'over' : 'short'
}

/** Whole hours + minutes since `iso` (clock-safe: never negative); null for a bad date. */
export function elapsedParts(iso: string, now: Date = new Date()): { h: number; m: number } | null {
  const started = Date.parse(iso)
  if (!Number.isFinite(started)) return null
  const minutes = Math.max(0, Math.floor((now.getTime() - started) / 60_000))
  return { h: Math.floor(minutes / 60), m: minutes % 60 }
}

/** "2h 05m" / "45m" since `iso` (the UI localises the units with elapsedParts). */
export function elapsedLabel(iso: string, now: Date = new Date()): string {
  const parts = elapsedParts(iso, now)
  if (!parts) return ''
  return parts.h > 0 ? `${parts.h}h ${String(parts.m).padStart(2, '0')}m` : `${parts.m}m`
}

// ── Delivery ──

/** DA missing to reach a zone's minimum order (0 when met or no minimum). */
export function belowMinimum(subtotal: number, minOrder: number | null | undefined): number {
  if (!minOrder || minOrder <= 0) return 0
  return Math.max(0, Math.ceil(minOrder - subtotal))
}

/** Copy without undefined keys: the order service treats a present-but-empty key as "clear it". */
export function withoutUndefined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T
}

// ── Customers ──

/** Comparable national number: digits without 00 / +213 / trunk 0 (last 9 digits for DZ). */
export function phoneKey(value: string | null | undefined): string {
  let digits = String(value ?? '').replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/\D/g, '')
  if (digits.startsWith('00')) digits = digits.slice(2)
  if (digits.startsWith('213')) digits = digits.slice(3)
  if (digits.startsWith('0')) digits = digits.slice(1)
  return digits
}

/** A complete Algerian number (9 national digits) or a long international one. */
export function isCompletePhone(value: string | null | undefined): boolean {
  const key = phoneKey(value)
  return key.length === 9 || (key.length >= 10 && key.length <= 15 && /^\s*(\+|00)/.test(String(value ?? '')))
}

export function samePhone(a: string | null | undefined, b: string | null | undefined): boolean {
  const ka = phoneKey(a)
  return ka.length >= 9 && ka === phoneKey(b)
}

/** SQLite "YYYY-MM-DD HH:MM:SS" (UTC) or ISO → Date. */
export function parseDbDate(value: string | null | undefined): Date | null {
  if (!value) return null
  const iso = /[TZ+]/.test(value.slice(10)) ? value : `${value.replace(' ', 'T')}Z`
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? null : date
}

/** Last-order lines (customers.getLastOrder) → cart lines for onRepeatOrder. */
export function toRepeatLines(lines: RepeatOrderLine[]): RepeatLine[] {
  return lines.map((line) => ({
    menu_item_id: line.menu_item_id,
    quantity: line.quantity,
    ...(line.notes ? { notes: line.notes } : {}),
    // null = the line had no saved options: let the item's defaults apply (omit the field).
    ...(line.modifiers ? { modifiers: line.modifiers.map(({ option_id, quantity }) => ({ option_id, quantity })) } : {}),
    ...(line.children.length
      ? {
          children: line.children.map((child) => ({
            slot_id: child.slot_id,
            menu_item_id: child.menu_item_id,
            modifiers: child.modifiers.map(({ option_id, quantity }) => ({ option_id, quantity })),
            ...(child.note ? { note: child.note } : {})
          }))
        }
      : {})
  }))
}
