/**
 * Shared formatting for printed documents (receipts, templates, kitchen tickets).
 */

/**
 * Escape a value before interpolating it into printed HTML.
 *
 * Every receipt and kitchen ticket is built by string-concatenating HTML and then rendered in a
 * Chromium window. Item names come from an Excel import, and order/item notes come from customers
 * typing on the LAN tablet or the public remote-order page. A note of
 * `<style>body{display:none}</style>` produced a BLANK kitchen ticket — the order was charged,
 * committed and never cooked, with no error anywhere.
 */
export function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export type ReceiptLang = 'en' | 'fr' | 'ar'

export interface ReceiptLabels {
  order: string
  table: string
  customer: string
  phone: string
  total: string
  subtotal: string
  discount: string
  thanks: string
  local: string
  takeout: string
  delivery: string
  reprint: string
}

const LABELS: Record<ReceiptLang, ReceiptLabels> = {
  en: {
    order: 'Order', table: 'Table', customer: 'Customer', phone: 'Phone', total: 'Total',
    subtotal: 'Subtotal', discount: 'Discount', thanks: 'Thank you for your visit!',
    local: 'Dine in', takeout: 'Takeaway', delivery: 'Delivery', reprint: 'REPRINT'
  },
  fr: {
    order: 'Commande', table: 'Table', customer: 'Client', phone: 'Tél', total: 'Total',
    subtotal: 'Sous-total', discount: 'Remise', thanks: 'Merci de votre visite !',
    local: 'Sur place', takeout: 'À emporter', delivery: 'Livraison', reprint: 'RÉIMPRESSION'
  },
  ar: {
    order: 'طلب', table: 'طاولة', customer: 'الزبون', phone: 'هاتف', total: 'المجموع',
    subtotal: 'المجموع الفرعي', discount: 'خصم', thanks: 'شكرًا لزيارتكم!',
    local: 'في المطعم', takeout: 'سفري', delivery: 'توصيل', reprint: 'إعادة طباعة'
  }
}

export function receiptLang(settings: Record<string, string>): ReceiptLang {
  const lang = settings.language
  return lang === 'ar' || lang === 'fr' ? lang : 'en'
}

export function receiptLabels(settings: Record<string, string>): ReceiptLabels {
  return LABELS[receiptLang(settings)]
}

export function orderTypeLabel(orderType: string, labels: ReceiptLabels): string {
  if (orderType === 'delivery') return labels.delivery
  if (orderType === 'takeout') return labels.takeout
  return labels.local
}

/** Contract C4: an empty currency symbol prints as "DA" (never the "DZD" currency code). */
export function currencySymbol(settings: Record<string, string>): string {
  return (settings.currency_symbol || '').trim() || 'DA'
}

export type FontSizeName = 'small' | 'medium' | 'large'

export const FONT_SIZES: Record<FontSizeName, { body: number; big: number; itemName: number; itemNotes: number; total: number }> = {
  small: { body: 10, big: 14, itemName: 12, itemNotes: 9, total: 14 },
  medium: { body: 12, big: 18, itemName: 14, itemNotes: 11, total: 18 },
  large: { body: 14, big: 22, itemName: 16, itemNotes: 12, total: 20 }
}

export function fontSizes(name: string | null | undefined, fallback: FontSizeName) {
  return FONT_SIZES[(name as FontSizeName) in FONT_SIZES ? (name as FontSizeName) : fallback]
}

/** Printable width for the paper roll: 58 mm paper has ~48 mm of printable area, 80 mm ~72 mm. */
export function printableWidth(paperWidth: string | number | null | undefined): { mm: number; css: string } {
  const mm = parseInt(String(paperWidth || '80'), 10) === 58 ? 58 : 80
  return { mm, css: mm === 58 ? '48mm' : '72mm' }
}

/** The logo image, or '' when there is none (callers decide whether a name header replaces it). */
export function logoImgHTML(logoDataUrl: string | null): string {
  if (!logoDataUrl) return ''
  return `<div style="text-align:center;"><img src="${logoDataUrl}" style="display:block;margin:0 auto 8px auto;max-width:70%;max-height:100px;" /></div>`
}

/** Unmissable banner at the top of a manual reprint, so it is never mistaken for a new order. */
export function reprintBannerHTML(text: string, sizePx: number): string {
  return `<div style="text-align:center;font-weight:bold;font-size:${sizePx}px;border:3px dashed #000;padding:4px;margin-bottom:6px;">*** ${esc(text)} ***</div>`
}
