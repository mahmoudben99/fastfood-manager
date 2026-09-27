import type Database from 'better-sqlite3'
import {
  BUILTIN_PAYMENT_METHODS, PAYMENT_METHOD_ID, isBuiltinPaymentMethod, normalizeCashRounding, paymentMethodLabel,
  type CashLang, type PaymentMethodConfig
} from '../../shared/cash'
import { CashError, cleanText, settingValue } from './cash-error'

/**
 * Payment-method configuration (setting `payment_methods`, a JSON list of {id, enabled, label?}).
 * Built-ins are always present (an owner disables them, never deletes them) and cash can never be
 * disabled: the drawer and every pre-v4 order depend on it.
 */
export function getPaymentMethods(db: Database.Database): PaymentMethodConfig[] {
  let saved: unknown = []
  try {
    saved = JSON.parse(settingValue(db, 'payment_methods') || '[]')
  } catch {
    saved = []
  }
  const out: PaymentMethodConfig[] = []
  const seen = new Set<string>()
  for (const raw of Array.isArray(saved) ? saved : []) {
    const id = String((raw as { id?: unknown })?.id ?? '')
    if (!PAYMENT_METHOD_ID.test(id) || seen.has(id)) continue
    const builtin = isBuiltinPaymentMethod(id)
    const label = cleanText((raw as { label?: unknown }).label, 40) || undefined
    if (!builtin && !label) continue
    seen.add(id)
    out.push({ id, enabled: id === 'cash' || (raw as { enabled?: unknown }).enabled !== false, builtin, ...(label ? { label } : {}) })
  }
  for (const id of BUILTIN_PAYMENT_METHODS) {
    if (!seen.has(id)) out.push({ id, enabled: true, builtin: true })
  }
  return out
}

/** Replace the configured list (order is kept; built-ins that are left out are re-added). */
export function savePaymentMethods(db: Database.Database, methods: unknown): PaymentMethodConfig[] {
  if (!Array.isArray(methods) || methods.length > 30) throw new CashError('invalid_input', 'Invalid payment method list')
  const seen = new Set<string>()
  const cleaned = methods.map((raw) => {
    const id = String(raw?.id ?? '').trim().toLowerCase()
    if (!PAYMENT_METHOD_ID.test(id) || seen.has(id)) throw new CashError('invalid_input', `Invalid or repeated payment method id "${id}"`)
    seen.add(id)
    const label = cleanText(raw?.label, 40)
    if (!isBuiltinPaymentMethod(id) && !label) throw new CashError('invalid_input', `Payment method "${id}" needs a label`)
    return { id, enabled: id === 'cash' || raw?.enabled !== false, ...(label ? { label } : {}) }
  })
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('payment_methods', JSON.stringify(cleaned))
  return getPaymentMethods(db)
}

export function enabledPaymentMethod(db: Database.Database, id: string): PaymentMethodConfig | null {
  return getPaymentMethods(db).find((method) => method.id === id && method.enabled) ?? null
}

/** Setting `cash_rounding`: 0 (off), 5 or 10 DA. */
export function cashRoundingStep(db: Database.Database): 0 | 5 | 10 {
  return normalizeCashRounding(settingValue(db, 'cash_rounding'))
}

export function appLang(db: Database.Database): CashLang {
  const lang = settingValue(db, 'language')
  return lang === 'ar' || lang === 'fr' ? lang : 'en'
}

/** Display name of a method in the app language (custom labels included). */
export function methodLabel(db: Database.Database, id: string, lang: CashLang = appLang(db)): string {
  const custom = getPaymentMethods(db).find((method) => method.id === id)?.label
  return paymentMethodLabel(id, lang, custom)
}
