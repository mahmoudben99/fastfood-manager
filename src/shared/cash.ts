/**
 * v4 cash rules shared by the main process (which enforces them) and the renderer (which shows
 * them): payment methods, Algerian dinar denominations, cash rounding and change.
 * No imports, no side effects. Amounts are whole Algerian dinars (DA).
 */

/**
 * Built-in payment methods. Electronic payment on customer request is mandatory in Algeria since
 * 2025-01-01, so the card/mobile methods ship enabled; an owner disables what the shop lacks.
 * cib / edahabia = bank-card TPE, baridipay = Algérie Poste QR, transfer = BaridiMob / CCP transfer.
 */
export const BUILTIN_PAYMENT_METHODS = ['cash', 'cib', 'edahabia', 'baridipay', 'transfer', 'other'] as const
export type BuiltinPaymentMethod = (typeof BUILTIN_PAYMENT_METHODS)[number]

export interface PaymentMethodConfig {
  /** 'cash' | 'cib' | 'edahabia' | 'baridipay' | 'transfer' | 'other' | a custom [a-z0-9_-] id. */
  id: string
  enabled: boolean
  /** Display name; built-ins fall back to the translated label. */
  label?: string
  builtin: boolean
}

export type CashLang = 'en' | 'fr' | 'ar'

const METHOD_LABELS: Record<BuiltinPaymentMethod, Record<CashLang, string>> = {
  cash: { en: 'Cash', fr: 'Espèces', ar: 'نقدًا' },
  cib: { en: 'CIB card', fr: 'Carte CIB', ar: 'بطاقة CIB' },
  edahabia: { en: 'Edahabia', fr: 'Edahabia', ar: 'الذهبية' },
  baridipay: { en: 'BaridiPay (QR)', fr: 'BaridiPay (QR)', ar: 'بريدي باي' },
  transfer: { en: 'BaridiMob / transfer', fr: 'BaridiMob / virement', ar: 'بريدي موب / تحويل' },
  other: { en: 'Other', fr: 'Autre', ar: 'أخرى' }
}

export function isBuiltinPaymentMethod(id: string): id is BuiltinPaymentMethod {
  return (BUILTIN_PAYMENT_METHODS as readonly string[]).includes(id)
}

/** Translated name of a payment method (custom methods use their own label, else their id). */
export function paymentMethodLabel(id: string, lang: CashLang = 'en', customLabel?: string | null): string {
  if (customLabel && customLabel.trim()) return customLabel.trim()
  return isBuiltinPaymentMethod(id) ? METHOD_LABELS[id][lang] : id
}

export const PAYMENT_METHOD_ID = /^[a-z0-9_-]{1,32}$/

/** Algerian notes 2000/1000/500/200 and coins 200/100/50/20/10/5 (1 and 2 DA are not in use). */
export const DZD_DENOMINATIONS = [
  { key: 'n2000', value: 2000, kind: 'note' },
  { key: 'n1000', value: 1000, kind: 'note' },
  { key: 'n500', value: 500, kind: 'note' },
  { key: 'n200', value: 200, kind: 'note' },
  { key: 'c200', value: 200, kind: 'coin' },
  { key: 'c100', value: 100, kind: 'coin' },
  { key: 'c50', value: 50, kind: 'coin' },
  { key: 'c20', value: 20, kind: 'coin' },
  { key: 'c10', value: 10, kind: 'coin' },
  { key: 'c5', value: 5, kind: 'coin' }
] as const
export type DenominationKey = (typeof DZD_DENOMINATIONS)[number]['key']
export type DenominationCounts = Partial<Record<DenominationKey, number>>

/** Total of a denomination count. Throws on an unknown key or a non-integer / negative count. */
export function denominationsTotal(counts: DenominationCounts | Record<string, number>): number {
  let total = 0
  for (const [key, raw] of Object.entries(counts || {})) {
    const denomination = DZD_DENOMINATIONS.find((entry) => entry.key === key)
    if (!denomination) throw new Error(`Unknown denomination ${key}`)
    const count = Number(raw)
    if (!Number.isInteger(count) || count < 0 || count > 1_000_000) throw new Error(`Invalid count for ${key}`)
    total += denomination.value * count
  }
  return total
}

/** Allowed cash rounding steps (setting `cash_rounding`): 0 = off, else nearest 5 or 10 DA. */
export const CASH_ROUNDING_STEPS = [0, 5, 10] as const

export function normalizeCashRounding(raw: unknown): 0 | 5 | 10 {
  const step = Number(raw)
  return step === 5 || step === 10 ? step : 0
}

/** The cash amount actually handed over for `amount` owed, rounded to the nearest step. */
export function roundCash(amount: number, step: number): number {
  const normalized = normalizeCashRounding(step)
  if (!normalized) return Math.round(amount)
  return Math.round(amount / normalized) * normalized
}

export interface CashBreakdown {
  /** Cash owed after rounding. */
  due: number
  /** due − amount (positive: customer pays a little more; negative: a little less). */
  rounding: number
  /** tendered − due, or null when nothing was tendered. */
  change: number | null
  /** False when the tendered cash does not cover `due`. */
  sufficient: boolean
}

/** Cash rounding + change for one cash payment of `amount` DA. */
export function cashBreakdown(amount: number, tendered: number | null | undefined, step: number): CashBreakdown {
  const due = roundCash(amount, step)
  const rounding = due - Math.round(amount)
  if (tendered === null || tendered === undefined) return { due, rounding, change: null, sufficient: true }
  const change = Math.round(tendered) - due
  return { due, rounding, change: Math.max(0, change), sufficient: change >= 0 }
}

/**
 * `orders.payment_status`: NULL = order from before v4 (treated as cash, fully paid);
 * 'void' = cancelled order (its payments were refunded).
 */
export type PaymentStatus = 'unpaid' | 'partial' | 'paid' | 'void'

/** One payment line sent with an order (renderer shape, snake_case like the other order input). */
export interface OrderPaymentInput {
  /** Enabled payment method id. */
  method: string
  /** DA applied to the order. Omitted = the remaining balance. */
  amount?: number
  /** Cash only: cash handed over. change = tendered − rounded amount. */
  tendered?: number
  /** Card slip / BaridiPay / transfer reference (≤ 100 chars). */
  reference?: string
}

export interface RefundInput {
  method: string
  amount: number
  reason?: string
}

export interface OrderPaymentRow {
  id: number
  order_id: number
  kind: 'payment' | 'refund'
  method: string
  /** Signed: + payment, − refund. */
  amount: number
  /** Cash rounding; drawer delta = amount + rounding. */
  rounding: number
  tendered: number | null
  change_given: number
  reference: string | null
  shift_id: number | null
  driver_id: number | null
  /** 1 = recorded automatically (legacy POS checkout without payment info, cancel refunds). */
  auto: number
  operator: string | null
  reason: string | null
  created_at: string
}

export interface OrderPaymentSummary {
  orderId: number
  total: number
  paid: number
  /** total − paid; negative = the customer is owed money. */
  balanceDue: number
  status: PaymentStatus
  /** True for a pre-v4 order: no payment rows, treated as cash, fully paid. */
  legacy: boolean
  payments: OrderPaymentRow[]
}

/** Manager-approval payload for guarded actions (see approvals IPC). */
export interface ApprovalInput {
  /** Manager PIN, or the admin password. */
  pin: string
  reason: string
  /** Who asked (cashier name); defaults to the open shift's cashier. */
  operator?: string
}

/** refund = money handed back on an order; view_expected = reveal the expected cash before a blind count. */
export type ApprovalAction = 'cancel_order' | 'void_line' | 'discount' | 'pay_out' | 'refund' | 'view_expected'
export const APPROVAL_ACTIONS: readonly ApprovalAction[] = ['cancel_order', 'void_line', 'discount', 'pay_out', 'refund', 'view_expected']

export interface ApprovalPolicy {
  /** Setting approval_enabled (default off). */
  enabled: boolean
  /** Setting approval_actions. */
  actions: ApprovalAction[]
  /** Setting approval_discount_percent: discounts beyond promotions above this % need a PIN. */
  discountPercent: number
  hasManagerPin: boolean
  /** Setting shift_blind_close (default on). */
  blindClose: boolean
}

/** Customer block of an invoice ("facture"). */
export interface InvoiceCustomer {
  name: string
  address?: string
  nif?: string
  nis?: string
  rc?: string
  ai?: string
}

export interface InvoiceRow {
  id: number
  /** YYYY/000001 */
  invoice_number: string
  year: number
  seq: number
  order_id: number
  /** JSON InvoiceCustomer */
  customer: string
  total: number
  created_at: string
}

/** Guarded IPC calls reject with `APPROVAL_REQUIRED:<action>` or `APPROVAL_INVALID:<action>`. */
export function parseApprovalError(message: unknown): { kind: 'required' | 'invalid'; action: ApprovalAction } | null {
  const text = message instanceof Error ? message.message : String(message ?? '')
  const match = text.match(/APPROVAL_(REQUIRED|INVALID):([a-z_]+)/)
  if (!match || !(APPROVAL_ACTIONS as readonly string[]).includes(match[2])) return null
  return { kind: match[1] === 'REQUIRED' ? 'required' : 'invalid', action: match[2] as ApprovalAction }
}
