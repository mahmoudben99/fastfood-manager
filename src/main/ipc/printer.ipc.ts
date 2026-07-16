import { ipcMain, BrowserWindow } from 'electron'
import { readFileSync } from 'fs'
import { settingsRepo } from '../database/repositories/settings.repo'
import { ordersRepo } from '../database/repositories/orders.repo'
import { printerAssignmentsRepo } from '../database/repositories/printer-assignments.repo'
import { workersRepo } from '../database/repositories/workers.repo'
import { receiptTemplatesRepo } from '../database/repositories/receipt-templates.repo'
import { getDb } from '../database/connection'
import { createPrintQueueWorker } from '../services/print-queue'

/**
 * Escape a value before interpolating it into printed HTML.
 *
 * Every receipt and kitchen ticket is built by string-concatenating HTML and then rendered in a
 * Chromium window. Item names come from an Excel import, and order/item notes come from customers
 * typing on the LAN tablet or the public remote-order page. A note of
 * `<style>body{display:none}</style>` produced a BLANK kitchen ticket — the order was charged,
 * committed and never cooked, with no error anywhere.
 */
function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

interface PrintJobRow {
  id: number
  order_id: number
  daily_number: number
  event_type: 'new' | 'updated' | 'cancelled' | 'restored'
  document_type: 'receipt' | 'kitchen'
  scope: 'all' | 'worker' | 'unassigned'
  worker_id: number | null
  worker_name: string | null
  status: 'pending' | 'printing' | 'succeeded' | 'attention' | 'cancelled'
  attempts: number
  last_error: string | null
  created_at: string
}

let printProcessorRunning = false
let printProcessorTimer: NodeJS.Timeout | null = null
let productionPrintWorker: ReturnType<typeof createPrintQueueWorker> | null = null
let activePrintRun: Promise<void> | null = null

function getOpenPrintJobs(): PrintJobRow[] {
  return getDb()
    .prepare(
      'SELECT pj.*, o.daily_number, w.name AS worker_name ' +
      'FROM print_jobs pj ' +
      'JOIN orders o ON o.id = pj.order_id ' +
      'LEFT JOIN workers w ON w.id = pj.worker_id ' +
      "WHERE pj.status IN ('pending', 'printing', 'attention') " +
      'ORDER BY CASE pj.status WHEN \'attention\' THEN 0 WHEN \'printing\' THEN 1 ELSE 2 END, pj.created_at'
    )
    .all() as PrintJobRow[]
}

function broadcastPrintJobs(): void {
  const jobs = getOpenPrintJobs()
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('printer:jobsChanged', jobs)
  }
}

async function runPendingPrintJobs(): Promise<void> {
  printProcessorRunning = true
  try {
    if (!productionPrintWorker) {
      productionPrintWorker = createPrintQueueWorker({
        db: getDb(),
        attemptPrint: async (job) => {
          if (job.document_type === 'receipt') {
            return printOrder(job.order_id, 'receipt', job.event_type)
          }
          if (job.scope === 'worker' && job.worker_id != null) {
            return printOrderForWorker(job.order_id, job.worker_id, job.event_type)
          }
          return printKitchenScope(
            job.order_id,
            job.scope === 'unassigned',
            job.event_type
          )
        }
      })
    }
    await productionPrintWorker.processOnce(10)
    broadcastPrintJobs()
  } finally {
    printProcessorRunning = false
  }
}

function processPendingPrintJobs(): Promise<void> {
  if (activePrintRun) return activePrintRun
  activePrintRun = runPendingPrintJobs().finally(() => { activePrintRun = null })
  return activePrintRun
}

function logPrintProcessorFailure(error: unknown): void {
  console.error('[Printer] Durable print queue failed:', error)
  try { broadcastPrintJobs() } catch { /* the next scheduled run/startup recovery remains durable */ }
}

export function startPrintJobProcessor(): void {
  if (printProcessorTimer) return
  // A previous process dying after handing a document to the OS leaves an ambiguous physical
  // outcome. Escalate on every startup (not only when migration 015 first runs).
  getDb().prepare(
    `UPDATE print_jobs SET status = 'attention',
     last_error = COALESCE(last_error, 'Application closed while printing; verify before retrying'),
     updated_at = datetime('now') WHERE status = 'printing'`
  ).run()
  void processPendingPrintJobs().catch(logPrintProcessorFailure)
  printProcessorTimer = setInterval(() => {
    void processPendingPrintJobs().catch(logPrintProcessorFailure)
  }, 2000)
}

export async function stopPrintJobProcessor(): Promise<void> {
  if (printProcessorTimer) {
    clearInterval(printProcessorTimer)
    printProcessorTimer = null
  }
  if (activePrintRun) {
    try { await activePrintRun } catch { /* pending/attention state records the print failure */ }
  }
  productionPrintWorker = null
}

export function isPrintJobProcessorBusy(): boolean {
  return printProcessorRunning
}

function getOrderTypeLabel(orderType: string, isRTL: boolean): string {
  if (orderType === 'delivery') return isRTL ? 'توصيل' : 'Delivery'
  if (orderType === 'takeout') return isRTL ? 'تيك أواي' : 'Take Out'
  return isRTL ? 'على الطاولة' : 'At Table'
}

function getOrderTypeKitchen(orderType: string): string {
  if (orderType === 'delivery') return 'DELIVERY'
  if (orderType === 'takeout') return 'TAKE OUT'
  return 'AT TABLE'
}

function getLogoHTML(settings: Record<string, string>): string {
  const logoPath = settings.logo_path
  if (!logoPath) return `<div class="center bold big">${esc(settings.restaurant_name || 'Restaurant')}</div>`
  try {
    const data = readFileSync(logoPath)
    const ext = logoPath.toLowerCase().endsWith('.png') ? 'png' : 'jpeg'
    const base64 = data.toString('base64')
    return `<div style="text-align:center;"><img src="data:image/${ext};base64,${base64}" style="display:block;margin:0 auto 8px auto;max-width:70%;max-height:100px;" /></div>`
  } catch {
    return `<div class="center bold big">${esc(settings.restaurant_name || 'Restaurant')}</div>`
  }
}

async function buildFromTemplate(template: any, order: any, settings: Record<string, string>): Promise<string | null> {
  try {
    const blocks = JSON.parse(template.blocks)
    if (!blocks || blocks.length === 0) return null

    const paperWidth = parseInt(settings.printer_width || '80')
    const maxWidth = paperWidth === 58 ? '48mm' : '72mm'
    const lang = settings.language || 'en'
    const isRTL = lang === 'ar'
    const items = order.items || []

    let body = ''
    for (const block of blocks) {
      if (!block.enabled) continue
      const cfg = block.config || {}
      const fontSize = cfg.fontSize === 'large' ? '18px' : cfg.fontSize === 'small' ? '10px' : '12px'
      const align = cfg.alignment || 'center'
      const bold = cfg.bold ? 'font-weight:bold;' : ''

      switch (block.type) {
        case 'logo':
          body += getLogoHTML(settings)
          break
        case 'restaurant_name':
          body += `<div style="text-align:${align};font-size:${fontSize};${bold}">${esc(settings.restaurant_name || 'Restaurant')}</div>`
          if (settings.restaurant_address) body += `<div style="text-align:center;font-size:10px;color:#666;">${esc(settings.restaurant_address)}</div>`
          if (settings.restaurant_phone) body += `<div style="text-align:center;font-size:10px;color:#666;">${esc(settings.restaurant_phone)}</div>`
          break
        case 'order_details': {
          const time = new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          body += `<div style="font-size:11px;margin:8px 0;">Order #${order.daily_number} | ${time}</div>`
          if (cfg.language === 'bilingual') {
            body += `<div style="font-size:10px;color:#888;text-align:center;margin:2px 0;">\u0637\u0644\u0628 #${order.daily_number} | ${time}</div>`
          }
          if (order.table_number) body += `<div style="font-size:11px;">Table: ${esc(order.table_number)}</div>`
          if (order.order_type) body += `<div style="font-size:11px;">${order.order_type === 'delivery' ? 'Delivery' : order.order_type === 'takeout' ? 'Take Out' : 'At Table'}</div>`
          // Customer name + phone (the default receipt shows these; the custom template's
          // order_details block was omitting them, so delivery receipts had no phone for the
          // driver). Rendered only when present, so dine-in/takeout receipts are unaffected.
          if (order.customer_name) body += `<div style="font-size:11px;">${isRTL ? 'الزبون' : 'Customer'}: ${esc(order.customer_name)}</div>`
          if (order.customer_phone) body += `<div style="font-size:11px;font-weight:bold;">${isRTL ? 'هاتف' : 'Phone'}: ${esc(order.customer_phone)}</div>`
          break
        }
        case 'items_table':
          body += '<div style="margin:8px 0;">'
          for (const item of items) {
            body += `<div style="display:flex;justify-content:space-between;font-size:${fontSize};${bold}padding:2px 0;"><span>${item.quantity}x ${esc(item.menu_item_name)}</span><span>${Number(item.total_price).toLocaleString()} ${settings.currency_symbol || settings.currency || 'DA'}</span></div>`
            if (cfg.language === 'bilingual' && item.menu_item_name_ar) {
              body += `<div style="font-size:9px;color:#888;direction:rtl;padding:0 0 2px 0;">${item.quantity}x ${esc(item.menu_item_name_ar)}</div>`
            }
            if (item.notes) body += `<div style="font-size:9px;color:#888;padding-left:16px;">* ${esc(item.notes)}</div>`
          }
          body += '</div>'
          break
        case 'total':
          body += `<div style="display:flex;justify-content:space-between;font-size:${fontSize};${bold}margin:8px 0;border-top:1px dashed #000;padding-top:6px;"><span>Total</span><span>${Number(order.total).toLocaleString()} ${settings.currency_symbol || settings.currency || 'DA'}</span></div>`
          if (order.discount_amount > 0) {
            body += `<div style="font-size:10px;color:#666;">Discount: -${Number(order.discount_amount).toLocaleString()} ${settings.currency_symbol || settings.currency || 'DA'}</div>`
          }
          break
        case 'divider':
          body += '<hr style="border:none;border-top:1px dashed #000;margin:8px 0;">'
          break
        case 'custom_text':
          body += `<div style="text-align:${align};font-size:${fontSize};${bold}margin:6px 0;">${esc(cfg.text || '')}</div>`
          if (cfg.textAr) body += `<div style="text-align:${align};font-size:${fontSize};${bold}margin:4px 0;direction:rtl;">${esc(cfg.textAr)}</div>`
          if (cfg.textFr) body += `<div style="text-align:${align};font-size:${fontSize};${bold}margin:4px 0;">${esc(cfg.textFr)}</div>`
          break
        case 'social_media': {
          try {
            const social = JSON.parse(settings.social_media || '[]')
            if (social.length > 0) {
              const platformEmoji: Record<string, string> = {
                facebook: '📘', instagram: '📸', snapchat: '👻', tiktok: '🎵',
                twitter: '🐦', x: '🐦', youtube: '🎬', whatsapp: '💬',
                threads: '🧵', telegram: '✈️', phone: '📞'
              }
              body += '<div style="text-align:center;font-size:10px;margin:6px 0;">'
              for (const s of social) {
                const emoji = platformEmoji[s.platform] || '🔗'
                body += `<div>${emoji} ${esc(s.handle)}</div>`
              }
              body += '</div>'
            }
          } catch { /* skip */ }
          break
        }
        case 'qr_code': {
          // The 'Modern' and 'Full Featured' presets ship `qrContent: 'phone'` with no qrUrl, and
          // nothing ever read qrContent — so those presets printed no QR at all. Honour it now by
          // encoding the restaurant phone as a dialable tel: link.
          const qrUrl =
            cfg.qrUrl ||
            (cfg.qrContent === 'phone' && settings.restaurant_phone
              ? `tel:${settings.restaurant_phone}`
              : '')
          const qrAlign = cfg.alignment || 'center'
          const qrPx = cfg.fontSize === 'large' ? 120 : cfg.fontSize === 'small' ? 60 : 80
          if (qrUrl) {
            try {
              const QRCode = (await import('qrcode')).default
              const qrDataUrl = await QRCode.toDataURL(qrUrl, { width: qrPx * 2, margin: 1 })
              body += `<div style="text-align:${qrAlign};margin:8px 0;"><img src="${qrDataUrl}" style="width:${qrPx}px;height:${qrPx}px;display:inline-block;" /></div>`
            } catch {
              body += `<div style="text-align:${qrAlign};margin:8px 0;font-size:10px;">[QR: ${qrUrl}]</div>`
            }
          }
          break
        }
        case 'edge_decoration': {
          const decoType = cfg.decorationType || 'food-emoji'
          const decoMap: Record<string, string> = {
            'food-emoji': '🍔 🍟 🍕 🌮 🥤 🍗 🍔 🍟 🍕 🌮',
            'stars': '⭐ ✨ ⭐ ✨ ⭐ ✨ ⭐ ✨ ⭐ ✨',
            'dots': '● ○ ● ○ ● ○ ● ○ ● ○',
            'fire': '🔥 🔥 🔥 🔥 🔥 🔥 🔥 🔥 🔥 🔥',
            'hearts': '❤️ 🧡 💛 💚 💙 💜 ❤️ 🧡 💛 💚'
          }
          const deco = decoMap[decoType] || decoMap['food-emoji']
          body += `<div style="text-align:center;font-size:10px;margin:6px 0;letter-spacing:2px;">${deco}</div>`
          break
        }
      }
    }

    return `<!DOCTYPE html><html dir="${isRTL ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><style>*{margin:0;padding:0;box-sizing:border-box;}body{width:${maxWidth};font-family:'Courier New',monospace;padding:8px;font-size:12px;text-align:center;}img{display:block;margin:0 auto 8px auto;max-width:70%;max-height:100px;}</style></head><body>${body}</body></html>`
  } catch {
    return null
  }
}

async function getReceiptHTML(
  order: any,
  settings: Record<string, string>,
  type: 'receipt' | 'kitchen',
  destinationPrinter?: string
): Promise<string> {
  // Check for active custom template (only for receipts, not kitchen tickets)
  if (type === 'receipt') {
    try {
      const template = receiptTemplatesRepo.getActiveTemplate()
      if (template && template.blocks) {
        const customHTML = await buildFromTemplate(template, order, settings)
        if (customHTML) return customHTML
      }
    } catch (err) {
      // Template failed — fall through to default
      console.error('[Printer] Template error:', err)
    }
  }

  // Resolve the paper width of the printer this document is actually going to. `printer_width`
  // is a single legacy setting that saveFullConfig copies from the RECEIPT printer, so a kitchen
  // printer with different paper (58mm vs 80mm) was being laid out at the receipt's width —
  // tickets printed cropped or half-empty. Per-printer settings win; the legacy key is fallback.
  const perPrinter = destinationPrinter
    ? printerAssignmentsRepo.getSettingsForPrinter(destinationPrinter, type)
    : type === 'kitchen'
      ? printerAssignmentsRepo.getKitchenSettings()
      : printerAssignmentsRepo.getReceiptSettings()
  const paperWidth = parseInt(perPrinter?.paper_width || settings.printer_width || '80', 10)
  const maxWidth = paperWidth === 58 ? '48mm' : '72mm'
  const lang = settings.language || 'en'
  const isRTL = lang === 'ar'

  const items = order.items || []

  // Font size mappings
  const fontSizes = {
    small: { body: '10px', big: '14px', itemName: '12px', itemNotes: '9px', total: '14px' },
    medium: { body: '12px', big: '18px', itemName: '14px', itemNotes: '11px', total: '18px' },
    large: { body: '14px', big: '22px', itemName: '16px', itemNotes: '12px', total: '20px' }
  }

  if (type === 'kitchen') {
    const kitchenSettings = perPrinter as { kitchen_font_size?: string } | null
    const kitchenFontSize = kitchenSettings?.kitchen_font_size || settings.kitchen_font_size || 'large'
    const sizes = fontSizes[kitchenFontSize as keyof typeof fontSizes] || fontSizes.large
    const eventType = String(order.printEventType || 'new')
    const eventLabel = eventType === 'new' ? '' : eventType.toUpperCase()

    return `<!DOCTYPE html><html dir="${isRTL ? 'rtl' : 'ltr'}">
<head><meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Courier New', monospace; font-size: ${sizes.body}; width: ${maxWidth}; padding: 4mm 2mm; }
  .center { text-align: center; }
  .bold { font-weight: bold; }
  .big { font-size: ${sizes.big}; }
  .line { border-top: 1px dashed #000; margin: 4px 0; }
  .item { margin: 4px 0; }
  .item-name { font-weight: bold; font-size: ${sizes.itemName}; }
  .item-notes { font-size: ${sizes.itemNotes}; font-style: italic; margin-top: 2px; }
  .qty { font-weight: bold; }
  .worker-badge { background: #000; color: #fff; padding: 4px 8px; display: inline-block; margin: 4px 0; font-weight: bold; }
</style></head>
<body>
  ${eventLabel ? `<div class="center bold big" style="border:3px solid #000;padding:4px;margin-bottom:4px">${esc(eventLabel)}</div>` : ''}
  <div class="center bold big">KITCHEN</div>
  <div class="center bold big">#${order.daily_number}</div>
  <div class="center">${getOrderTypeKitchen(order.order_type)}</div>
  ${order.workerName ? `<div class="center"><div class="worker-badge">FOR: ${esc(order.workerName.toUpperCase())}</div></div>` : ''}
  <div class="line"></div>
  ${items.map((item: any) => `
    <div class="item">
      <span class="qty">${item.quantity}x</span>
      <span class="item-name">${esc(item.menu_item_name || 'Item')}</span>
      ${item.notes ? `<div class="item-notes">${esc(item.notes)}</div>` : ''}
    </div>
  `).join('')}
  <div class="line"></div>
  ${order.notes ? `<div><b>Notes:</b> ${esc(order.notes)}</div><div class="line"></div>` : ''}
  <div class="center" style="font-size:10px">${new Date(order.created_at).toLocaleTimeString()}</div>
  <br>
</body></html>`
  }

  // Customer receipt
  const receiptSettings = perPrinter as { receipt_font_size?: string } | null
  const receiptFontSize = receiptSettings?.receipt_font_size || settings.receipt_font_size || 'medium'
  const sizes = fontSizes[receiptFontSize as keyof typeof fontSizes] || fontSizes.medium
  const currencySymbol = settings.currency_symbol || settings.currency || 'DA'
  const itemSubtotal = items.reduce((sum: number, i: any) => sum + Number(i.total_price || 0), 0)
  const subtotal = order.subtotal != null && Number.isFinite(Number(order.subtotal))
    ? Number(order.subtotal)
    : Math.round(itemSubtotal)
  // The receipt used to print `subtotal` under the TOTAL label, so any promo/discounted order
  // handed the customer a receipt showing MORE than they actually paid. orders.total is already
  // subtotal - discount_amount (see orders.repo create/updateItems); trust it, and clamp the
  // discount to the subtotal so a stale discount can never print a negative line.
  const discount = Math.min(Math.max(0, Number(order.discount_amount) || 0), subtotal)
  // Guard against null/undefined explicitly: Number(null) === 0 and Number.isFinite(0) is true,
  // so a missing total would otherwise print "TOTAL 0.00" on the customer's receipt.
  const total =
    order.total != null && Number.isFinite(Number(order.total))
      ? Number(order.total)
      : subtotal - discount

  return `<!DOCTYPE html><html dir="${isRTL ? 'rtl' : 'ltr'}">
<head><meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Courier New', monospace; font-size: ${sizes.body}; width: ${maxWidth}; padding: 4mm 2mm; }
  .center { text-align: center; }
  .bold { font-weight: bold; }
  .big { font-size: ${sizes.big}; }
  .line { border-top: 1px dashed #000; margin: 5px 0; }
  .row { display: flex; justify-content: space-between; }
  .item { margin: 3px 0; }
  .total-row { font-size: ${sizes.total}; font-weight: bold; }
</style></head>
<body>
  ${getLogoHTML(settings)}
  ${settings.restaurant_phone ? `<div class="center">${esc(settings.restaurant_phone)}</div>` : ''}
  ${settings.restaurant_address ? `<div class="center" style="font-size:10px">${esc(settings.restaurant_address)}</div>` : ''}
  <div class="line"></div>
  <div class="row"><span>${isRTL ? 'طلب' : 'Order'} #${order.daily_number}</span><span>${getOrderTypeLabel(order.order_type, isRTL)}</span></div>
  <div>${new Date(order.created_at).toLocaleString()}</div>
  ${order.customer_phone ? `<div>${isRTL ? 'هاتف' : 'Phone'}: ${esc(order.customer_phone)}</div>` : ''}
  <div class="line"></div>
  ${items.map((item: any) => `
    <div class="item">
      <div class="row">
        <span>${item.quantity}x ${esc(item.menu_item_name || 'Item')}</span>
        <span>${(item.total_price).toFixed(2)}</span>
      </div>
    </div>
  `).join('')}
  <div class="line"></div>
  ${discount > 0 ? `
  <div class="row">
    <span>${isRTL ? 'المجموع الفرعي' : 'Subtotal'}</span>
    <span>${subtotal.toFixed(2)} ${currencySymbol}</span>
  </div>
  <div class="row">
    <span>${esc(order.discount_details || (isRTL ? 'تخفيض' : 'Discount'))}</span>
    <span>-${discount.toFixed(2)} ${currencySymbol}</span>
  </div>` : ''}
  <div class="row total-row">
    <span>${isRTL ? 'المجموع' : 'TOTAL'}</span>
    <span>${total.toFixed(2)} ${currencySymbol}</span>
  </div>
  <div class="line"></div>
  ${order.notes ? `<div>${esc(order.notes)}</div><div class="line"></div>` : ''}
  <div class="center" style="margin-top:4px; font-size:10px">${isRTL ? 'شكرا لزيارتكم' : 'Thank you for your visit!'}</div>
  <br><br>
</body></html>`
}

export function registerPrinterHandlers(): void {
  startPrintJobProcessor()

  ipcMain.handle('printer:getPrintJobs', () => getOpenPrintJobs())

  ipcMain.handle('printer:retryPrintJob', async (_, id: number) => {
    if (!Number.isInteger(id) || id <= 0) return { success: false, error: 'Invalid print job' }
    const result = getDb()
      .prepare(
        "UPDATE print_jobs SET status = 'pending', attempts = 0, next_attempt_at = NULL, " +
        "last_error = NULL, updated_at = datetime('now') " +
        "WHERE id = ? AND status = 'attention'"
      )
      .run(id)
    if (result.changes !== 1) return { success: false, error: 'Print job is not awaiting attention' }
    broadcastPrintJobs()
    void processPendingPrintJobs().catch(logPrintProcessorFailure)
    return { success: true }
  })

  ipcMain.handle('printer:cancelPrintJob', (_, id: number) => {
    if (!Number.isInteger(id) || id <= 0) return { success: false, error: 'Invalid print job' }
    const result = getDb()
      .prepare(
        "UPDATE print_jobs SET status = 'cancelled', updated_at = datetime('now') " +
        "WHERE id = ? AND status IN ('pending', 'attention')"
      )
      .run(id)
    broadcastPrintJobs()
    return result.changes === 1
      ? { success: true }
      : { success: false, error: 'Print job can no longer be cancelled' }
  })

  ipcMain.handle('printer:getPrinters', async () => {
    const wins = BrowserWindow.getAllWindows()
    if (wins.length === 0) return []
    const printers = await wins[0].webContents.getPrintersAsync()
    return printers.map(p => ({
      name: p.name,
      isDefault: p.isDefault,
      status: p.status
    }))
  })

  ipcMain.handle('printer:printReceipt', async (_, orderId: number) => {
    return printOrder(orderId, 'receipt')
  })

  ipcMain.handle('printer:printKitchen', async (_, orderId: number) => {
    return printOrder(orderId, 'kitchen')
  })

  ipcMain.handle('printer:previewReceipt', async (_, orderId: number) => {
    const settings = settingsRepo.getAll()
    const order = ordersRepo.getById(orderId)
    if (!order) return null
    return await getReceiptHTML(order, settings, 'receipt')
  })

  ipcMain.handle('printer:printKitchenForWorker', async (_, orderId: number, workerId: number) => {
    return printOrderForWorker(orderId, workerId)
  })

  ipcMain.handle('printer:getOrderWorkers', async (_, orderId: number) => {
    const order = ordersRepo.getById(orderId)
    if (!order || !order.items) return []

    // Get unique workers from order items
    const workerIds = new Set<number>()
    for (const item of order.items) {
      if (item.worker_id) {
        workerIds.add(item.worker_id)
      }
    }

    // Get worker details
    const workers: { id: number; name: string; itemCount: number }[] = []
    for (const workerId of workerIds) {
      const worker = workersRepo.getById(workerId)
      if (worker) {
        const itemCount = order.items.filter(i => i.worker_id === workerId).length
        workers.push({ id: worker.id, name: worker.name, itemCount })
      }
    }

    return workers.sort((a, b) => a.name.localeCompare(b.name))
  })

  // Printer assignment CRUD
  ipcMain.handle('printer:getAssignments', () => {
    return printerAssignmentsRepo.getAll()
  })

  ipcMain.handle('printer:deleteAssignment', (_, id: number) => {
    printerAssignmentsRepo.deleteAssignment(id)
    return { success: true }
  })

  ipcMain.handle('printer:saveFullConfig', (_, config: {
    assignments: { printerName: string; tasks: string[]; autoPrint: boolean; paperWidth: string; receiptFontSize: string; kitchenFontSize: string }[]
  }) => {
    // Save via repo (handles clearing + rebuilding)
    printerAssignmentsRepo.saveFullConfig(config.assignments)

    // Sync legacy settings for backward compat with printing logic
    const hasAutoReceipt = config.assignments.some(p => p.autoPrint && p.tasks.includes('receipt'))
    const hasAutoKitchen = config.assignments.some(p => p.autoPrint && (p.tasks.includes('kitchen_all') || p.tasks.some(t => t.startsWith('worker_'))))
    const receiptPrinter = config.assignments.find(p => p.tasks.includes('receipt'))
    const kitchenPrinter = config.assignments.find(p => p.tasks.includes('kitchen_all') || p.tasks.some(t => t.startsWith('worker_')))

    settingsRepo.setMultiple({
      printer_name: receiptPrinter?.printerName || config.assignments[0]?.printerName || '',
      kitchen_printer_name: kitchenPrinter?.printerName || receiptPrinter?.printerName || config.assignments[0]?.printerName || '',
      printer_width: receiptPrinter?.paperWidth || config.assignments[0]?.paperWidth || '80',
      receipt_font_size: receiptPrinter?.receiptFontSize || 'medium',
      kitchen_font_size: kitchenPrinter?.kitchenFontSize || 'large',
      auto_print_receipt: hasAutoReceipt ? 'true' : 'false',
      auto_print_kitchen: hasAutoKitchen ? 'true' : 'false',
      split_kitchen_tickets: config.assignments.some(p => p.tasks.some(t => t.startsWith('worker_'))) ? 'true' : 'false'
    })

    // Update worker printer assignments in workers table. Clear first: this used to only ever
    // SET printer_name, so un-assigning a worker in the UI left the old value behind — and
    // getPrinterForWorker() prefers workers.printer_name, so tickets kept going to the removed
    // printer forever.
    workersRepo.clearAllPrinterNames()
    for (const printer of config.assignments) {
      for (const task of printer.tasks) {
        if (task.startsWith('worker_')) {
          const workerId = parseInt(task.replace('worker_', ''), 10)
          if (Number.isInteger(workerId)) workersRepo.setPrinterName(workerId, printer.printerName)
        }
      }
    }

    return { success: true }
  })

  ipcMain.handle('printer:testPrintOnPrinter', async (_, printerName: string) => {
    const settings = settingsRepo.getAll()
    const paperWidth = parseInt(settings.printer_width || '80')
    const maxWidth = paperWidth === 58 ? '48mm' : '72mm'
    const html = `<!DOCTYPE html><html>
<head><meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; }
  body { font-family: 'Courier New', monospace; font-size: 12px; width: ${maxWidth}; padding: 4mm 2mm; text-align: center; }
  .line { border-top: 1px dashed #000; margin: 8px 0; }
</style></head>
<body>
  <div style="font-size:16px; font-weight:bold;">TEST PRINT</div>
  <div class="line"></div>
  <div>${esc(settings.restaurant_name || 'Fast Food Manager')}</div>
  <div class="line"></div>
  <div>Printer: ${printerName}</div>
  <div>Width: ${paperWidth}mm</div>
  <div>Time: ${new Date().toLocaleString()}</div>
  <div class="line"></div>
  <div>Printer is working!</div>
  <br><br>
</body></html>`
    return doPrint(html, printerName)
  })

  ipcMain.handle('printer:testPrint', async () => {
    const settings = settingsRepo.getAll()
    const printerName = settings.printer_name
    if (!printerName) return { success: false, error: 'No printer configured' }

    const paperWidth = parseInt(settings.printer_width || '80')
    const maxWidth = paperWidth === 58 ? '48mm' : '72mm'

    const html = `<!DOCTYPE html><html>
<head><meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; }
  body { font-family: 'Courier New', monospace; font-size: 12px; width: ${maxWidth}; padding: 4mm 2mm; text-align: center; }
  .line { border-top: 1px dashed #000; margin: 8px 0; }
</style></head>
<body>
  <div style="font-size:16px; font-weight:bold;">TEST PRINT</div>
  <div class="line"></div>
  <div>${esc(settings.restaurant_name || 'Fast Food Manager')}</div>
  <div class="line"></div>
  <div>Printer: ${printerName}</div>
  <div>Width: ${paperWidth}mm</div>
  <div>Time: ${new Date().toLocaleString()}</div>
  <div class="line"></div>
  <div>Printer is working!</div>
  <br><br>
</body></html>`

    return doPrint(html, printerName)
  })
}

export async function printOrder(
  orderId: number,
  type: 'receipt' | 'kitchen',
  eventType: 'new' | 'updated' | 'cancelled' | 'restored' = 'new'
): Promise<{ success: boolean; error?: string }> {
  const settings = settingsRepo.getAll()
  const order = ordersRepo.getById(orderId)
  if (!order) return { success: false, error: 'Order not found' }

  // Receipt printing - use receipt printer or fallback to default
  if (type === 'receipt') {
    const printerName = printerAssignmentsRepo.getReceiptPrinter() || settings.printer_name
    if (!printerName) return { success: false, error: 'No printer configured' }
    const html = await getReceiptHTML({ ...order, printEventType: eventType }, settings, type, printerName)
    return doPrint(html, printerName)
  }

  // Kitchen printing - check if split by worker is enabled
  const splitEnabled = settings.split_kitchen_tickets === 'true'

  if (!splitEnabled || !order.items || order.items.length === 0) {
    // Print single kitchen ticket to kitchen printer
    const printerName = printerAssignmentsRepo.getKitchenAllPrinter() || settings.kitchen_printer_name || settings.printer_name
    if (!printerName) return { success: false, error: 'No printer configured' }
    const html = await getReceiptHTML({ ...order, printEventType: eventType }, settings, type, printerName)
    return doPrint(html, printerName)
  }

  // Split kitchen tickets by worker
  const itemsByWorker = new Map<number | null, any[]>()
  for (const item of order.items) {
    const workerId = item.worker_id
    if (!itemsByWorker.has(workerId)) {
      itemsByWorker.set(workerId, [])
    }
    itemsByWorker.get(workerId)!.push(item)
  }

  // Print separate ticket for each worker
  let allSuccess = true
  for (const [workerId, items] of itemsByWorker) {
    // Get worker name if workerId exists
    let workerName = null
    if (workerId) {
      const worker = workersRepo.getById(workerId)
      workerName = worker?.name || null
    }

    const workerOrder = { ...order, items, workerName, workerId, printEventType: eventType }
    const printerName = workerId
      ? printerAssignmentsRepo.getPrinterForWorker(workerId)
      : printerAssignmentsRepo.getKitchenAllPrinter()

    // Fallback to default if no printer found
    const finalPrinter = printerName || settings.kitchen_printer_name || settings.printer_name
    if (!finalPrinter) {
      allSuccess = false
      continue
    }

    const html = await getReceiptHTML(workerOrder, settings, type, finalPrinter)
    const result = await doPrint(html, finalPrinter)
    if (!result.success) allSuccess = false
  }

  return { success: allSuccess }
}

export async function printOrderForWorker(
  orderId: number,
  workerId: number,
  eventType: 'new' | 'updated' | 'cancelled' | 'restored' = 'new'
): Promise<{ success: boolean; error?: string }> {
  const settings = settingsRepo.getAll()
  const order = ordersRepo.getById(orderId)
  if (!order) return { success: false, error: 'Order not found' }

  // Filter items for this worker
  const workerItems = order.items?.filter(item => item.worker_id === workerId) || []
  if (workerItems.length === 0) {
    return { success: false, error: 'No items for this worker' }
  }

  // Get worker name
  const worker = workersRepo.getById(workerId)
  const workerName = worker?.name || null

  // Create order with only this worker's items
  const workerOrder = { ...order, items: workerItems, workerName, workerId, printEventType: eventType }

  // Get printer for this worker
  const printerName = printerAssignmentsRepo.getPrinterForWorker(workerId) || settings.kitchen_printer_name || settings.printer_name
  if (!printerName) return { success: false, error: 'No printer configured' }

  const html = await getReceiptHTML(workerOrder, settings, 'kitchen', printerName)
  return doPrint(html, printerName)
}

async function printKitchenScope(
  orderId: number,
  unassignedOnly: boolean,
  eventType: 'new' | 'updated' | 'cancelled' | 'restored' = 'new'
): Promise<{ success: boolean; error?: string }> {
  const settings = settingsRepo.getAll()
  const order = ordersRepo.getById(orderId)
  if (!order) return { success: false, error: 'Order not found' }

  const items = unassignedOnly
    ? (order.items || []).filter((item) => item.worker_id == null)
    : (order.items || [])
  if (items.length === 0) return { success: false, error: 'No items for this kitchen ticket' }

  const printerName =
    printerAssignmentsRepo.getKitchenAllPrinter() ||
    settings.kitchen_printer_name ||
    settings.printer_name
  if (!printerName) return { success: false, error: 'No printer configured' }

  const html = await getReceiptHTML(
    {
      ...order,
      items,
      workerName: unassignedOnly ? 'Unassigned' : null,
      printEventType: eventType
    },
    settings,
    'kitchen',
    printerName
  )
  return doPrint(html, printerName)
}

async function doPrint(html: string, printerName: string): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    const printWin = new BrowserWindow({
      show: false,
      width: 300,
      height: 600,
      webPreferences: { nodeIntegration: false, contextIsolation: true }
    })

    printWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)

    printWin.webContents.on('did-finish-load', () => {
      printWin.webContents.print(
        {
          silent: true,
          deviceName: printerName,
          printBackground: true,
          margins: { marginType: 'none' }
        },
        (success, failureReason) => {
          printWin.close()
          if (success) {
            resolve({ success: true })
          } else {
            resolve({ success: false, error: failureReason || 'Print failed' })
          }
        }
      )
    })

    // Timeout safety
    setTimeout(() => {
      if (!printWin.isDestroyed()) {
        printWin.close()
        resolve({ success: false, error: 'Print timeout' })
      }
    }, 10000)
  })
}
