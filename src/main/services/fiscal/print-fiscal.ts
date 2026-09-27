import { formatFiscalNumber } from '../../../shared/fiscal'
import { esc, receiptLang } from '../print-format'

/** v4 fiscal: the ticket's fiscal number on customer receipts ("N° fiscal 00001234"). */
const LABEL = { en: 'Fiscal No.', fr: 'N° fiscal', ar: 'الرقم الجبائي' } as const

export function fiscalNumberLabel(settings: Record<string, string>): string {
  return LABEL[receiptLang(settings)]
}

/** '' for orders without a number (sample / preview orders, pre-025 databases). */
export function fiscalNumberHTML(order: { fiscal_number?: number | null }, settings: Record<string, string>, style = ''): string {
  if (!order?.fiscal_number) return ''
  return `<div style="${style}">${esc(fiscalNumberLabel(settings))} <bdi>${esc(formatFiscalNumber(order.fiscal_number))}</bdi></div>`
}
