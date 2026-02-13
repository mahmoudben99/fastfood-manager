import { ipcMain } from 'electron'
import { ordersRepo, type CreateOrderInput } from '../database/repositories/orders.repo'
import { performAutoBackup } from './backup.ipc'
import { sendOrderNotification } from '../telegram/bot'
import { printOrder } from './printer.ipc'
import { settingsRepo } from '../database/repositories/settings.repo'

export function registerOrdersHandlers(): void {
  ipcMain.handle('orders:create', (_, input: CreateOrderInput) => {
    const order = ordersRepo.create(input)
    // Auto-backup after each order (overwrites today's file)
    performAutoBackup()
    // Send Telegram notification
    sendOrderNotification(order)
    // Auto-print if enabled
    const autoPrintReceipt = settingsRepo.get('auto_print_receipt') === 'true'
    const autoPrintKitchen = settingsRepo.get('auto_print_kitchen') === 'true'
    if (autoPrintReceipt) printOrder(order.id, 'receipt').catch(() => {})
    if (autoPrintKitchen) printOrder(order.id, 'kitchen').catch(() => {})
    return order
  })

  ipcMain.handle('orders:getById', (_, id: number) => {
    return ordersRepo.getById(id)
  })

  ipcMain.handle('orders:getByDate', (_, date: string) => {
    return ordersRepo.getByDate(date)
  })

  ipcMain.handle('orders:getByDateRange', (_, startDate: string, endDate: string) => {
    return ordersRepo.getByDateRange(startDate, endDate)
  })

  ipcMain.handle('orders:updateStatus', (_, id: number, status: string) => {
    return ordersRepo.updateStatus(id, status)
  })

  ipcMain.handle('orders:cancel', (_, id: number) => {
    return ordersRepo.cancelOrder(id)
  })

  ipcMain.handle('orders:getToday', () => {
    return ordersRepo.getTodayOrders()
  })

  ipcMain.handle(
    'orders:updateItems',
    (_, id: number, items: { menu_item_id: number; quantity: number; notes?: string; worker_id?: number }[]) => {
      return ordersRepo.updateItems(id, items)
    }
  )
}
