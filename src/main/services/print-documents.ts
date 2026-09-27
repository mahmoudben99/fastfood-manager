import {
  currencySymbol, esc, fontSizes, logoImgHTML, orderTypeLabel, printableWidth, receiptLabels,
  receiptLang, reprintBannerHTML
} from './print-format'
import type { KitchenLineChange } from './print-routing'
import type { ReceiptContext } from './receipt-template'

export type PrintEventType = 'new' | 'updated' | 'cancelled' | 'restored'

/** The built-in customer receipt (used when no Receipt Editor template is active). */
export function buildDefaultReceiptHTML(order: any, settings: Record<string, string>, ctx: ReceiptContext): string {
  const width = printableWidth(ctx.paperWidth || settings.printer_width)
  const lang = receiptLang(settings)
  const isRTL = lang === 'ar'
  const L = receiptLabels(settings)
  const sizes = fontSizes(ctx.receiptFontSize || settings.receipt_font_size, 'medium')
  const currency = esc(currencySymbol(settings))
  const items = order.items || []
  const itemSubtotal = items.reduce((sum: number, i: any) => sum + Number(i.total_price || 0), 0)
  const subtotal = order.subtotal != null && Number.isFinite(Number(order.subtotal))
    ? Number(order.subtotal)
    : Math.round(itemSubtotal)
  // orders.total is already subtotal - discount_amount (see orders.repo create/updateItems): print
  // it under TOTAL, never the subtotal, and clamp the discount so a stale one can never go negative.
  const discount = Math.min(Math.max(0, Number(order.discount_amount) || 0), subtotal)
  // Number(null) === 0 is finite, so a missing total would otherwise print "TOTAL 0.00".
  const total = order.total != null && Number.isFinite(Number(order.total)) ? Number(order.total) : subtotal - discount
  const header = logoImgHTML(ctx.logoDataUrl) ||
    `<div class="center bold big">${esc(settings.restaurant_name || 'Restaurant')}</div>`

  return `<!DOCTYPE html><html dir="${isRTL ? 'rtl' : 'ltr'}" lang="${lang}">
<head><meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Courier New', monospace; font-size: ${sizes.body}px; width: ${width.css}; padding: 4mm 2mm; }
  .center { text-align: center; }
  .bold { font-weight: bold; }
  .big { font-size: ${sizes.big}px; }
  .line { border-top: 1px dashed #000; margin: 5px 0; }
  .row { display: flex; justify-content: space-between; }
  .item { margin: 3px 0; }
  .total-row { font-size: ${sizes.total}px; font-weight: bold; }
</style></head>
<body>
  ${ctx.reprint ? reprintBannerHTML(L.reprint, sizes.big) : ''}
  ${header}
  ${settings.restaurant_phone ? `<div class="center">${esc(settings.restaurant_phone)}</div>` : ''}
  ${settings.restaurant_address ? `<div class="center" style="font-size:10px">${esc(settings.restaurant_address)}</div>` : ''}
  <div class="line"></div>
  <div class="row"><span>${esc(L.order)} #${esc(order.daily_number)}</span><span>${esc(orderTypeLabel(order.order_type, L))}</span></div>
  <div>${esc(new Date(order.created_at).toLocaleString())}</div>
  ${order.table_number ? `<div>${esc(L.table)}: ${esc(order.table_number)}</div>` : ''}
  ${order.customer_phone ? `<div>${esc(L.phone)}: ${esc(order.customer_phone)}</div>` : ''}
  <div class="line"></div>
  ${items.map((item: any) => `
    <div class="item">
      <div class="row">
        <span>${esc(item.quantity)}x ${esc(item.menu_item_name || 'Item')}</span>
        <span>${Number(item.total_price || 0).toFixed(2)}</span>
      </div>
    </div>
  `).join('')}
  <div class="line"></div>
  ${discount > 0 ? `
  <div class="row">
    <span>${esc(L.subtotal)}</span>
    <span>${subtotal.toFixed(2)} ${currency}</span>
  </div>
  <div class="row">
    <span>${esc(order.discount_details || L.discount)}</span>
    <span>-${discount.toFixed(2)} ${currency}</span>
  </div>` : ''}
  <div class="row total-row">
    <span>${esc(L.total.toUpperCase())}</span>
    <span>${total.toFixed(2)} ${currency}</span>
  </div>
  <div class="line"></div>
  ${order.notes ? `<div>${esc(order.notes)}</div><div class="line"></div>` : ''}
  <div class="center" style="margin-top:4px; font-size:10px">${esc(L.thanks)}</div>
  <br><br>
</body></html>`
}

function kitchenOrderType(orderType: string): string {
  if (orderType === 'delivery') return 'DELIVERY'
  if (orderType === 'takeout') return 'TAKE OUT'
  return 'AT TABLE'
}

export interface KitchenContext {
  paperWidth: string | null
  kitchenFontSize: string | null
  eventType: PrintEventType
  /** "FOR: <station>" badge; null on the full ticket. */
  workerName: string | null
  /** Changes relevant to THIS ticket (UPDATED events only). */
  changes: KitchenLineChange[]
  /** menu_item_id → name, for lines that no longer exist on the order. */
  removedNames: Record<number, string>
  reprint?: boolean
}

/** Kitchen ticket. `items` are the lines for this ticket (station subset or all). */
export function buildKitchenHTML(order: any, items: any[], settings: Record<string, string>, ctx: KitchenContext): string {
  const width = printableWidth(ctx.paperWidth || settings.printer_width)
  const isRTL = settings.language === 'ar'
  const sizes = fontSizes(ctx.kitchenFontSize || settings.kitchen_font_size, 'large')
  const eventLabel = ctx.eventType === 'new' ? '' : ctx.eventType.toUpperCase()
  const current = new Map<number, KitchenLineChange>()
  for (const change of ctx.changes) if (change.kind !== 'removed') current.set(change.orderItemId, change)
  const removed = ctx.changes.filter((change) => change.kind === 'removed')
  const mark = (text: string) => `<span class="mark">${esc(text)}</span>`
  const markFor = (itemId: number): string => {
    const change = current.get(itemId)
    if (!change) return ''
    if (change.kind === 'added') return mark('+ ADDED')
    const marks: string[] = []
    if (change.previousQuantity != null && change.previousQuantity !== change.quantity) {
      marks.push(mark(`QTY ${change.previousQuantity} -> ${change.quantity}`))
    }
    if (change.noteChanged) marks.push(mark('NOTE CHANGED'))
    return marks.join(' ')
  }

  return `<!DOCTYPE html><html dir="${isRTL ? 'rtl' : 'ltr'}">
<head><meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Courier New', monospace; font-size: ${sizes.body}px; width: ${width.css}; padding: 4mm 2mm; }
  .center { text-align: center; }
  .bold { font-weight: bold; }
  .big { font-size: ${sizes.big}px; }
  .line { border-top: 1px dashed #000; margin: 4px 0; }
  .item { margin: 4px 0; }
  .item-name { font-weight: bold; font-size: ${sizes.itemName}px; }
  .item-notes { font-size: ${sizes.itemNotes}px; font-style: italic; margin-top: 2px; }
  .qty { font-weight: bold; }
  .mark { background: #000; color: #fff; padding: 0 4px; font-weight: bold; font-size: ${sizes.itemNotes}px; }
  .removed .item-name, .removed .qty { text-decoration: line-through; }
  .worker-badge { background: #000; color: #fff; padding: 4px 8px; display: inline-block; margin: 4px 0; font-weight: bold; }
</style></head>
<body>
  ${ctx.reprint ? reprintBannerHTML('REPRINT', sizes.big) : ''}
  ${eventLabel ? `<div class="center bold big" style="border:3px solid #000;padding:4px;margin-bottom:4px">${esc(eventLabel)}</div>` : ''}
  <div class="center bold big">KITCHEN</div>
  <div class="center bold big">#${esc(order.daily_number)}</div>
  <div class="center">${kitchenOrderType(order.order_type)}</div>
  ${order.table_number ? `<div class="center bold big">TABLE ${esc(order.table_number)}</div>` : ''}
  ${order.customer_name ? `<div class="center">${esc(String(order.customer_name).toUpperCase())}</div>` : ''}
  ${ctx.workerName ? `<div class="center"><div class="worker-badge">FOR: ${esc(ctx.workerName.toUpperCase())}</div></div>` : ''}
  <div class="line"></div>
  ${items.map((item: any) => `
    <div class="item">
      ${markFor(item.id)}
      <span class="qty">${esc(item.quantity)}x</span>
      <span class="item-name">${esc(item.menu_item_name || 'Item')}</span>
      ${item.notes ? `<div class="item-notes">${esc(item.notes)}</div>` : ''}
    </div>
  `).join('')}
  ${removed.map((change) => `
    <div class="item removed">
      ${mark('REMOVED')}
      <span class="qty">${esc(change.quantity)}x</span>
      <span class="item-name">${esc(ctx.removedNames[change.menuItemId] || `Item #${change.menuItemId}`)}</span>
    </div>
  `).join('')}
  <div class="line"></div>
  ${order.notes ? `<div><b>Notes:</b> ${esc(order.notes)}</div><div class="line"></div>` : ''}
  <div class="center" style="font-size:10px">${esc(new Date(order.created_at).toLocaleTimeString())}</div>
  <br>
</body></html>`
}

/**
 * Adds one small "TEST PRINT" line to the top of a real document, so a sample printed from the
 * Test button is never mistaken for a real order.
 */
export function markAsTestPrint(html: string, printerName: string): string {
  const banner = `<div style="text-align:center;font-size:11px;margin-bottom:4px;">— TEST PRINT · ${esc(printerName)} —</div>`
  return html.replace(/<body[^>]*>/i, (tag) => tag + banner)
}

/** A realistic order for the Receipt Editor preview: real menu items when there are some. */
export function buildSampleOrder(menu: { name: string; name_ar?: string | null; price: number }[]): any {
  const fallback = [
    { name: 'Classic Burger', name_ar: 'برغر كلاسيك', price: 450 },
    { name: 'Fries', name_ar: 'بطاطس', price: 150 },
    { name: 'Soda', name_ar: 'مشروب غازي', price: 100 }
  ]
  const source = menu.length > 0 ? menu.slice(0, 3) : fallback
  const quantities = [2, 1, 2]
  const items = source.map((entry, index) => ({
    id: index + 1,
    quantity: quantities[index],
    menu_item_name: entry.name,
    menu_item_name_ar: entry.name_ar || null,
    unit_price: Number(entry.price) || 0,
    total_price: (Number(entry.price) || 0) * quantities[index],
    notes: index === 0 ? 'No onions' : null,
    worker_id: null
  }))
  const subtotal = items.reduce((sum, item) => sum + item.total_price, 0)
  const discount = Math.round(subtotal * 0.1)
  return {
    id: 0,
    daily_number: 42,
    order_type: 'local',
    table_number: '5',
    customer_name: 'Ahmed',
    customer_phone: '0551 23 45 67',
    subtotal,
    discount_amount: discount,
    discount_details: 'Promo -10%',
    total: subtotal - discount,
    notes: 'Extra napkins please',
    created_at: new Date().toISOString(),
    items
  }
}
