import type Database from 'better-sqlite3'
import { businessDateInAlgiers } from '../../shared/order-edit'
import type { InvoiceCustomer, InvoiceRow } from '../../shared/cash'
import { CashError, cleanText } from './cash-error'
import { currencySymbol, esc, printableWidth, receiptLang } from './print-format'
import { algiersTime, formatDA } from './shift-report-format'

/**
 * Invoice ("facture") on customer request. One invoice per order, numbered YYYY/000001 per
 * calendar year (the number is never reused; a reprint shows the stored customer details).
 * Seller IDs come from settings: legal_name (else restaurant_name), legal_nif, legal_nis,
 * legal_rc, legal_ai, restaurant_address. `invoice_tva_rate` (percent, empty = no VAT lines)
 * splits the TTC total into HT + TVA; prices are always stored tax-inclusive.
 */
export type { InvoiceCustomer, InvoiceRow }

export function getInvoice(db: Database.Database, orderId: number): InvoiceRow | null {
  return (db.prepare('SELECT * FROM invoices WHERE order_id = ?').get(orderId) as InvoiceRow | undefined) ?? null
}

export function issueInvoice(db: Database.Database, orderId: number, customer: InvoiceCustomer, now: Date = new Date()): InvoiceRow {
  return db.transaction(() => {
    const existing = getInvoice(db, orderId)
    if (existing) return existing
    const order = db.prepare('SELECT id, total, status FROM orders WHERE id = ?').get(orderId) as { id: number; total: number; status: string } | undefined
    if (!order) throw new CashError('not_found', 'Order not found')
    if (order.status === 'cancelled') throw new CashError('not_allowed', 'A cancelled order cannot be invoiced')
    const name = cleanText(customer?.name, 120)
    if (!name) throw new CashError('invalid_input', 'The customer name is required on an invoice')
    const clean = {
      name,
      address: cleanText(customer.address, 200),
      nif: cleanText(customer.nif, 30),
      nis: cleanText(customer.nis, 30),
      rc: cleanText(customer.rc, 30),
      ai: cleanText(customer.ai, 30)
    }
    const year = Number(businessDateInAlgiers(now).slice(0, 4))
    const seq = (db.prepare('SELECT COALESCE(MAX(seq), 0) + 1 AS next FROM invoices WHERE year = ?').get(year) as { next: number }).next
    const id = Number(db.prepare(
      'INSERT INTO invoices (invoice_number, year, seq, order_id, customer, total, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(`${year}/${String(seq).padStart(6, '0')}`, year, seq, orderId, JSON.stringify(clean), order.total, now.toISOString()).lastInsertRowid)
    return db.prepare('SELECT * FROM invoices WHERE id = ?').get(id) as InvoiceRow
  })()
}

const LABELS = {
  en: { title: 'INVOICE', number: 'No.', date: 'Date', seller: 'Seller', buyer: 'Customer', qty: 'Qty', item: 'Item', amount: 'Amount', discount: 'Discount', deliveryFee: 'Delivery fee', ht: 'Total excl. VAT', tva: 'VAT', ttc: 'Total incl. VAT', total: 'Total', order: 'Order' },
  fr: { title: 'FACTURE', number: 'N°', date: 'Date', seller: 'Vendeur', buyer: 'Client', qty: 'Qté', item: 'Désignation', amount: 'Montant', discount: 'Remise', deliveryFee: 'Frais de livraison', ht: 'Total HT', tva: 'TVA', ttc: 'Total TTC', total: 'Total', order: 'Commande' },
  ar: { title: 'فاتورة', number: 'رقم', date: 'التاريخ', seller: 'البائع', buyer: 'الزبون', qty: 'الكمية', item: 'البيان', amount: 'المبلغ', discount: 'خصم', deliveryFee: 'رسوم التوصيل', ht: 'المجموع خارج الرسم', tva: 'الرسم على القيمة المضافة', ttc: 'المجموع بكل الرسوم', total: 'المجموع', order: 'طلب' }
}

/** Receipt-width (default) or A4 invoice HTML. */
export function buildInvoiceHTML(
  order: any,
  invoice: InvoiceRow,
  settings: Record<string, string>,
  ctx: { paperWidth?: string | null; format?: 'receipt' | 'a4' } = {}
): string {
  const lang = receiptLang(settings)
  const L = LABELS[lang]
  const currency = currencySymbol(settings)
  const da = (value: unknown) => esc(formatDA(Number(value), currency))
  const customer = JSON.parse(invoice.customer || '{}') as InvoiceCustomer
  const ids = (entity: { nif?: string | null; nis?: string | null; rc?: string | null; ai?: string | null }) =>
    (['nif', 'nis', 'rc', 'ai'] as const).filter((key) => entity[key]).map((key) => `<div>${key.toUpperCase()}: ${esc(entity[key])}</div>`).join('')
  const seller = {
    nif: settings.legal_nif, nis: settings.legal_nis, rc: settings.legal_rc, ai: settings.legal_ai
  }
  const total = Math.round(Number(order.total) || 0)
  const rate = Number(settings.invoice_tva_rate)
  const vat = Number.isFinite(rate) && rate > 0
    ? (() => { const ht = Math.round((total / (1 + rate / 100)) * 100) / 100; return { ht, tva: Math.round((total - ht) * 100) / 100 } })()
    : null
  const row = (left: string, right: string, bold = false) =>
    `<div class="row${bold ? ' bold' : ''}"><span>${left}</span><span>${right}</span></div>`
  const width = ctx.format === 'a4' ? '190mm' : printableWidth(ctx.paperWidth || settings.printer_width).css

  let body = `<div class="center bold big">${esc(L.title)}</div>`
  body += row(`${esc(L.number)} ${esc(invoice.invoice_number)}`, `${esc(L.date)}: ${esc(algiersTime(invoice.created_at).slice(0, 10))}`)
  body += `<div class="line"></div><div class="bold">${esc(L.seller)}</div>`
  body += `<div>${esc(settings.legal_name || settings.restaurant_name || '')}</div>`
  if (settings.restaurant_address) body += `<div>${esc(settings.restaurant_address)}</div>`
  if (settings.restaurant_phone) body += `<div>${esc(settings.restaurant_phone)}</div>`
  body += ids(seller)
  body += `<div class="line"></div><div class="bold">${esc(L.buyer)}</div><div>${esc(customer.name)}</div>`
  if (customer.address) body += `<div>${esc(customer.address)}</div>`
  body += ids(customer)
  body += `<div class="line"></div><div>${esc(L.order)} #${esc(order.daily_number)} · ${esc(order.order_date)}</div>`
  for (const item of order.items || []) {
    body += row(`${esc(item.quantity)} x ${esc(item.menu_item_name || 'Item')}`, da(item.total_price))
  }
  body += '<div class="line"></div>'
  if (Number(order.discount_amount) > 0) body += row(esc(L.discount), da(-Number(order.discount_amount)))
  if (Number(order.delivery_fee) > 0) body += row(esc(L.deliveryFee), da(order.delivery_fee))
  if (vat) {
    body += row(esc(L.ht), esc(`${vat.ht.toFixed(2)} ${currency}`))
    body += row(esc(`${L.tva} ${rate}%`), esc(`${vat.tva.toFixed(2)} ${currency}`))
    body += row(esc(L.ttc), da(total), true)
  } else {
    body += row(esc(L.total), da(total), true)
  }

  return `<!DOCTYPE html><html dir="${lang === 'ar' ? 'rtl' : 'ltr'}" lang="${lang}"><head><meta charset="utf-8"><style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: 'Courier New', monospace; font-size: 12px; width: ${width}; padding: 4mm 2mm; }
.center { text-align: center; } .bold { font-weight: bold; } .big { font-size: 18px; }
.line { border-top: 1px dashed #000; margin: 5px 0; }
.row { display: flex; justify-content: space-between; gap: 6px; }
</style></head><body>${body}<br><br></body></html>`
}
