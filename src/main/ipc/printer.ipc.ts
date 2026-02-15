import { ipcMain, BrowserWindow } from 'electron'
import { readFileSync } from 'fs'
import { settingsRepo } from '../database/repositories/settings.repo'
import { ordersRepo } from '../database/repositories/orders.repo'

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
    return `<div class="center"><img src="data:image/${ext};base64,${base64}" style="max-width:60%; max-height:60px; margin:0 auto;" /></div>
    <div class="center bold big">${settings.restaurant_name || 'Restaurant'}</div>`
  } catch {
    return `<div class="center bold big">${settings.restaurant_name || 'Restaurant'}</div>`
  }
}

function getReceiptHTML(order: any, settings: Record<string, string>, type: 'receipt' | 'kitchen'): string {
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
</style></head>
<body>
  <div class="center bold big">KITCHEN</div>
  <div class="center bold big">#${order.daily_number}</div>
  <div class="center">${getOrderTypeKitchen(order.order_type)}</div>
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
  const printerName = settings.printer_name
  if (!printerName) return { success: false, error: 'No printer configured' }

  const order = ordersRepo.getById(orderId)
  if (!order) return { success: false, error: 'Order not found' }

  const html = getReceiptHTML(order, settings, type)
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
