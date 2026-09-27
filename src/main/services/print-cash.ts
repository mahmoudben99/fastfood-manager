/**
 * v4 receipt / kitchen-ticket snippets for payments and delivery. Pure (no Electron, no DB): the
 * order object comes from ordersRepo.getById, which attaches `payments` and `delivery`.
 * Receipts print in the app language (fr / ar / en); kitchen tickets stay in English like the
 * rest of the ticket.
 */
import { paymentMethodLabel, type CashLang, type OrderPaymentRow } from '../../shared/cash'
import { currencySymbol, esc, receiptLang } from './print-format'

interface CashLabels {
  deliveryFee: string
  subtotal: string
  address: string
  zone: string
  deliveryNotes: string
  paid: string
  tendered: string
  change: string
  refund: string
  balanceDue: string
  unpaid: string
  eta: string
}

const LABELS: Record<CashLang, CashLabels> = {
  en: {
    deliveryFee: 'Delivery fee', subtotal: 'Subtotal', address: 'Address', zone: 'Zone', deliveryNotes: 'Delivery note',
    paid: 'Paid', tendered: 'Cash given', change: 'Change', refund: 'Refund', balanceDue: 'Balance due',
    unpaid: 'NOT PAID — collect on delivery / pickup', eta: 'min'
  },
  fr: {
    deliveryFee: 'Frais de livraison', subtotal: 'Sous-total', address: 'Adresse', zone: 'Zone', deliveryNotes: 'Note de livraison',
    paid: 'Payé', tendered: 'Espèces reçues', change: 'Monnaie rendue', refund: 'Remboursement', balanceDue: 'Reste à payer',
    unpaid: 'NON PAYÉ — à encaisser à la livraison / au retrait', eta: 'min'
  },
  ar: {
    deliveryFee: 'رسوم التوصيل', subtotal: 'المجموع الفرعي', address: 'العنوان', zone: 'المنطقة', deliveryNotes: 'ملاحظة التوصيل',
    paid: 'مدفوع', tendered: 'المبلغ المستلم', change: 'الباقي', refund: 'استرداد', balanceDue: 'المبلغ المتبقي',
    unpaid: 'غير مدفوع — يُحصّل عند التسليم', eta: 'د'
  }
}

export function cashLabels(settings: Record<string, string>): CashLabels {
  return LABELS[receiptLang(settings)]
}

function customLabels(settings: Record<string, string>): Record<string, string> {
  try {
    const list = JSON.parse(settings.payment_methods || '[]')
    return Object.fromEntries((Array.isArray(list) ? list : []).filter((m) => m?.id && m?.label).map((m) => [m.id, String(m.label)]))
  } catch {
    return {}
  }
}

const amount = (value: unknown): string => Number(value || 0).toFixed(2)
const row = (left: string, right: string, style = ''): string =>
  `<div class="row" style="display:flex;justify-content:space-between;${style}"><span>${left}</span><span>${right}</span></div>`

/** Address / zone / note lines for a delivery order (receipt header). */
export function receiptDeliveryHTML(order: any, settings: Record<string, string>): string {
  const delivery = order?.delivery
  if (order?.order_type !== 'delivery' || !delivery) return ''
  const L = cashLabels(settings)
  let html = ''
  if (delivery.address) html += `<div style="font-weight:bold">${esc(L.address)}: ${esc(delivery.address)}</div>`
  if (delivery.zone_name) {
    const eta = delivery.estimated_minutes ? ` (~${esc(delivery.estimated_minutes)} ${esc(L.eta)})` : ''
    html += `<div>${esc(L.zone)}: ${esc(delivery.zone_name)}${eta}</div>`
  }
  if (delivery.notes) html += `<div>${esc(L.deliveryNotes)}: ${esc(delivery.notes)}</div>`
  return html
}

/** Delivery-fee row (plus a subtotal row when the receipt has not printed one yet). */
export function receiptFeeRowsHTML(order: any, settings: Record<string, string>, subtotalShown: boolean, subtotal: number): string {
  const fee = Number(order?.delivery_fee) || 0
  if (fee <= 0) return ''
  const L = cashLabels(settings)
  const currency = esc(currencySymbol(settings))
  return (subtotalShown ? '' : row(esc(L.subtotal), `${amount(subtotal)} ${currency}`)) +
    row(esc(L.deliveryFee), `+${amount(fee)} ${currency}`)
}

/** Payment lines with cash tendered / change, and the balance still due (under the total). */
export function receiptPaymentsHTML(order: any, settings: Record<string, string>): string {
  const payments: OrderPaymentRow[] = Array.isArray(order?.payments) ? order.payments : []
  if (payments.length === 0 && !order?.payment_status) return '' // pre-v4 order: nothing recorded
  const L = cashLabels(settings)
  const lang = receiptLang(settings)
  const labels = customLabels(settings)
  const currency = esc(currencySymbol(settings))
  let html = ''
  for (const payment of payments) {
    const name = esc(paymentMethodLabel(payment.method, lang, labels[payment.method]))
    if (payment.kind === 'refund') {
      html += row(`${esc(L.refund)} (${name})`, `${amount(payment.amount + payment.rounding)} ${currency}`)
      continue
    }
    html += row(`${esc(L.paid)} (${name})`, `${amount(payment.amount + payment.rounding)} ${currency}`)
    if (payment.tendered !== null && payment.tendered !== undefined) {
      html += row(esc(L.tendered), `${amount(payment.tendered)} ${currency}`, 'font-size:0.9em')
      html += row(esc(L.change), `${amount(payment.change_given)} ${currency}`, 'font-size:0.9em')
    }
    if (payment.reference) html += `<div style="font-size:0.85em">Ref: ${esc(payment.reference)}</div>`
  }
  const paid = payments.reduce((acc, payment) => acc + payment.amount, 0)
  const due = Math.round(Number(order?.total) || 0) - paid
  if (order?.status !== 'cancelled' && due > 0) {
    html += row(`<b>${esc(L.balanceDue)}</b>`, `<b>${amount(due)} ${currency}</b>`)
    if (paid <= 0) html += `<div style="text-align:center;font-weight:bold;border:2px solid #000;padding:2px;margin-top:3px">${esc(L.unpaid)}</div>`
  }
  return html ? `<div class="line" style="border-top:1px dashed #000;margin:5px 0"></div>${html}` : ''
}

/** Delivery block for the kitchen ticket header (zone, address, phone). */
export function kitchenDeliveryHTML(
  order: any,
  labels: { zone: string; tel: string; codUnpaid: string } = { zone: 'ZONE:', tel: 'TEL:', codUnpaid: 'COD - NOT PAID' }
): string {
  const delivery = order?.delivery
  if (order?.order_type !== 'delivery') return ''
  let html = ''
  if (delivery?.zone_name) html += `<div class="center bold">${esc(labels.zone)} ${esc(String(delivery.zone_name).toUpperCase())}</div>`
  if (delivery?.address) html += `<div class="center">${esc(delivery.address)}</div>`
  if (order.customer_phone) html += `<div class="center">${esc(labels.tel)} ${esc(order.customer_phone)}</div>`
  if (order.payment_status === 'unpaid' || order.payment_status === 'partial') html += `<div class="center bold">${esc(labels.codUnpaid)}</div>`
  return html
}
