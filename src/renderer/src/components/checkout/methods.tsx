import { ReactNode } from 'react'
import { ArrowLeftRight, Banknote, CreditCard, QrCode, Wallet } from 'lucide-react'
import { paymentMethodLabel, type CashLang, type PaymentMethodConfig } from '../../../../shared/cash'
import { ipcErrorMessage } from '../../utils/ipcErrorMessage'

/** Overlay layers: app modals / drawers are z-50; checkout sheets sit above, the approval above all. */
export const Z_SHEET = 60
export const Z_APPROVAL = 80

/** Methods that carry a slip / transaction reference. */
export const REFERENCE_METHODS = new Set(['cib', 'edahabia', 'baridipay', 'transfer'])

export function methodIcon(id: string): ReactNode {
  switch (id) {
    case 'cash': return <Banknote />
    case 'cib':
    case 'edahabia': return <CreditCard />
    case 'baridipay': return <QrCode />
    case 'transfer': return <ArrowLeftRight />
    default: return <Wallet />
  }
}

export function cashLang(language: string): CashLang {
  return language === 'fr' || language === 'ar' ? language : 'en'
}

export function methodName(method: Pick<PaymentMethodConfig, 'id' | 'label'> | string, language: string): string {
  const id = typeof method === 'string' ? method : method.id
  const label = typeof method === 'string' ? undefined : method.label
  return paymentMethodLabel(id, cashLang(language), label)
}

/** Error text of a rejected window.api call without Electron's prefix, "CashError:" or our stable tokens. */
export function errorText(error: unknown, fallback: string): string {
  return ipcErrorMessage(error, fallback).replace(/^\w*Error:\s*/, '').replace(/^[A-Z_]+:\s*/, '').trim() || fallback
}

/** True when a rejected call carries the given stable token (NO_OPEN_SHIFT, SHIFT_ALREADY_OPEN…). */
export function hasToken(error: unknown, token: string): boolean {
  const text = error instanceof Error ? error.message : String(error ?? '')
  return text.includes(`${token}:`)
}
