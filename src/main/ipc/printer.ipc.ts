import { ipcMain, BrowserWindow } from 'electron'
import { readFileSync } from 'fs'
import { settingsRepo } from '../database/repositories/settings.repo'
import { ordersRepo } from '../database/repositories/orders.repo'
import { printerAssignmentsRepo } from '../database/repositories/printer-assignments.repo'
import { workersRepo } from '../database/repositories/workers.repo'
import { receiptTemplatesRepo } from '../database/repositories/receipt-templates.repo'

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
  if (!logoPath) return `<div class="center bold big">${settings.restaurant_name || 'Restaurant'}</div>`
  try {
    const data = readFileSync(logoPath)
    const ext = logoPath.toLowerCase().endsWith('.png') ? 'png' : 'jpeg'
    const base64 = data.toString('base64')
    return `<div class="center"><img src="data:image/${ext};base64,${base64}" style="max-width:80%; max-height:120px; margin:0 auto 8px auto;" /></div>`
  } catch {
    return `<div class="center bold big">${settings.restaurant_name || 'Restaurant'}</div>`
  }
}

function buildFromTemplate(template: any, order: any, settings: Record<string, string>): string | null {
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
          body += `<div style="text-align:${align};font-size:${fontSize};${bold}">${settings.restaurant_name || 'Restaurant'}</div>`
          if (settings.restaurant_address) body += `<div style="text-align:center;font-size:10px;color:#666;">${settings.restaurant_address}</div>`
          if (settings.restaurant_phone) body += `<div style="text-align:center;font-size:10px;color:#666;">${settings.restaurant_phone}</div>`
          break
        case 'order_details': {
          const time = new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          body += `<div style="font-size:11px;margin:8px 0;">Order #${order.daily_number} | ${time}</div>`
          if (order.table_number) body += `<div style="font-size:11px;">Table: ${order.table_number}</div>`
          if (order.order_type) body += `<div style="font-size:11px;">${order.order_type === 'delivery' ? 'Delivery' : order.order_type === 'takeout' ? 'Take Out' : 'At Table'}</div>`
          break
        }
        case 'items_table':
          body += '<div style="margin:8px 0;">'
          for (const item of items) {
            body += `<div style="display:flex;justify-content:space-between;font-size:${fontSize};${bold}padding:2px 0;"><span>${item.quantity}x ${item.menu_item_name}</span><span>${Number(item.total_price).toLocaleString()} ${settings.currency_symbol || 'DA'}</span></div>`
            if (item.notes) body += `<div style="font-size:9px;color:#888;padding-left:16px;">* ${item.notes}</div>`
          }
          body += '</div>'
          break
        case 'total':
          body += `<div style="display:flex;justify-content:space-between;font-size:${fontSize};${bold}margin:8px 0;border-top:1px dashed #000;padding-top:6px;"><span>Total</span><span>${Number(order.total).toLocaleString()} ${settings.currency_symbol || 'DA'}</span></div>`
          if (order.discount_amount > 0) {
            body += `<div style="font-size:10px;color:#666;">Discount: -${Number(order.discount_amount).toLocaleString()} ${settings.currency_symbol || 'DA'}</div>`
          }
          break
        case 'divider':
          body += '<hr style="border:none;border-top:1px dashed #000;margin:8px 0;">'
          break
        case 'custom_text':
          body += `<div style="text-align:${align};font-size:${fontSize};${bold}margin:6px 0;">${cfg.text || ''}</div>`
          break
        case 'social_media': {
          try {
            const social = JSON.parse(settings.social_media || '[]')
            if (social.length > 0) {
              body += '<div style="text-align:center;font-size:10px;margin:6px 0;">'
              for (const s of social) {
                body += `<div>${s.platform}: ${s.handle}</div>`
              }
              body += '</div>'
            }
          } catch { /* skip */ }
          break
        }
        case 'qr_code':
          body += '<div style="text-align:center;margin:8px 0;font-size:10px;">[QR Code]</div>'
          break
      }
    }

    return `<!DOCTYPE html><html dir="${isRTL ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><style>*{margin:0;padding:0;box-sizing:border-box;}body{width:${maxWidth};font-family:monospace;padding:8px;font-size:12px;}</style></head><body>${body}</body></html>`
  } catch {
    return null
  }
}

function getReceiptHTML(order: any, settings: Record<string, string>, type: 'receipt' | 'kitchen'): string {
  // Check for active custom template (only for receipts, not kitchen tickets)
  if (type === 'receipt') {
    try {
      const template = receiptTemplatesRepo.getActiveTemplate()
      if (template) {
        const customHTML = buildFromTemplate(template, order, settings)
        if (customHTML) return customHTML
      }
    } catch { /* fall through to default */ }
  }

  const paperWidth = parseInt(settings.printer_width || '80')
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
    const kitchenFontSize = settings.kitchen_font_size || 'large'
    const sizes = fontSizes[kitchenFontSize as keyof typeof fontSizes] || fontSizes.large

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
  <div class="center bold big">KITCHEN</div>
  <div class="center bold big">#${order.daily_number}</div>
  <div class="center">${getOrderTypeKitchen(order.order_type)}</div>
  ${order.workerName ? `<div class="center"><div class="worker-badge">FOR: ${order.workerName.toUpperCase()}</div></div>` : ''}
  <div class="line"></div>
  ${items.map((item: any) => `
    <div class="item">
      <span class="qty">${item.quantity}x</span>
      <span class="item-name">${item.menu_item_name || 'Item'}</span>
      ${item.notes ? `<div class="item-notes">${item.notes}</div>` : ''}
    </div>
  `).join('')}
  <div class="line"></div>
  ${order.notes ? `<div><b>Notes:</b> ${order.notes}</div><div class="line"></div>` : ''}
  <div class="center" style="font-size:10px">${new Date(order.created_at).toLocaleTimeString()}</div>
  <br>
</body></html>`
  }

  // Customer receipt
  const receiptFontSize = settings.receipt_font_size || 'medium'
  const sizes = fontSizes[receiptFontSize as keyof typeof fontSizes] || fontSizes.medium
  const currencySymbol = settings.currency_symbol || '$'
  const subtotal = items.reduce((sum: number, i: any) => sum + i.total_price, 0)

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
  ${settings.restaurant_phone ? `<div class="center">${settings.restaurant_phone}</div>` : ''}
  ${settings.restaurant_address ? `<div class="center" style="font-size:10px">${settings.restaurant_address}</div>` : ''}
  <div class="line"></div>
  <div class="row"><span>${isRTL ? 'طلب' : 'Order'} #${order.daily_number}</span><span>${getOrderTypeLabel(order.order_type, isRTL)}</span></div>
  <div>${new Date(order.created_at).toLocaleString()}</div>
  ${order.customer_phone ? `<div>${isRTL ? 'هاتف' : 'Phone'}: ${order.customer_phone}</div>` : ''}
  <div class="line"></div>
  ${items.map((item: any) => `
    <div class="item">
      <div class="row">
        <span>${item.quantity}x ${item.menu_item_name || 'Item'}</span>
        <span>${(item.total_price).toFixed(2)}</span>
      </div>
    </div>
  `).join('')}
  <div class="line"></div>
  <div class="row total-row">
    <span>${isRTL ? 'المجموع' : 'TOTAL'}</span>
    <span>${subtotal.toFixed(2)} ${currencySymbol}</span>
  </div>
  <div class="line"></div>
  ${order.notes ? `<div>${order.notes}</div><div class="line"></div>` : ''}
  <div class="center" style="margin-top:4px; font-size:10px">${isRTL ? 'شكرا لزيارتكم' : 'Thank you for your visit!'}</div>
  <br><br>
</body></html>`
}

export function registerPrinterHandlers(): void {
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

  ipcMain.handle('printer:previewReceipt', (_, orderId: number) => {
    const settings = settingsRepo.getAll()
    const order = ordersRepo.getById(orderId)
    if (!order) return null
    return getReceiptHTML(order, settings, 'receipt')
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

    // Update worker printer assignments in workers table
    for (const printer of config.assignments) {
      for (const task of printer.tasks) {
        if (task.startsWith('worker_')) {
          const workerId = parseInt(task.replace('worker_', ''))
          workersRepo.update(workerId, { printer_name: printer.printerName } as any)
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
  <div>${settings.restaurant_name || 'Fast Food Manager'}</div>
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
  <div>${settings.restaurant_name || 'Fast Food Manager'}</div>
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

export async function printOrder(orderId: number, type: 'receipt' | 'kitchen'): Promise<{ success: boolean; error?: string }> {
  const settings = settingsRepo.getAll()
  const order = ordersRepo.getById(orderId)
  if (!order) return { success: false, error: 'Order not found' }

  // Receipt printing - use receipt printer or fallback to default
  if (type === 'receipt') {
    const printerName = printerAssignmentsRepo.getReceiptPrinter() || settings.printer_name
    if (!printerName) return { success: false, error: 'No printer configured' }
    const html = getReceiptHTML(order, settings, type)
    return doPrint(html, printerName)
  }

  // Kitchen printing - check if split by worker is enabled
  const splitEnabled = settings.split_kitchen_tickets === 'true'

  if (!splitEnabled || !order.items || order.items.length === 0) {
    // Print single kitchen ticket to kitchen printer
    const printerName = printerAssignmentsRepo.getKitchenAllPrinter() || settings.kitchen_printer_name || settings.printer_name
    if (!printerName) return { success: false, error: 'No printer configured' }
    const html = getReceiptHTML(order, settings, type)
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

    const workerOrder = { ...order, items, workerName, workerId }
    const printerName = workerId
      ? printerAssignmentsRepo.getPrinterForWorker(workerId)
      : printerAssignmentsRepo.getKitchenAllPrinter()

    // Fallback to default if no printer found
    const finalPrinter = printerName || settings.kitchen_printer_name || settings.printer_name
    if (!finalPrinter) continue

    const html = getReceiptHTML(workerOrder, settings, type)
    const result = await doPrint(html, finalPrinter)
    if (!result.success) allSuccess = false
  }

  return { success: allSuccess }
}

export async function printOrderForWorker(orderId: number, workerId: number): Promise<{ success: boolean; error?: string }> {
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
  const workerOrder = { ...order, items: workerItems, workerName, workerId }

  // Get printer for this worker
  const printerName = printerAssignmentsRepo.getPrinterForWorker(workerId) || settings.kitchen_printer_name || settings.printer_name
  if (!printerName) return { success: false, error: 'No printer configured' }

  const html = getReceiptHTML(workerOrder, settings, 'kitchen')
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
