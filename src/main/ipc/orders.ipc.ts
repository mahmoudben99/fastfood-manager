import { ipcMain } from 'electron'
import { ordersRepo, type CreateOrderInput } from '../database/repositories/orders.repo'
import { performAutoBackup } from './backup.ipc'
import { sendOrderNotification } from '../telegram/bot'
import { syncOrderToCloud, syncOrderStatusToCloud } from '../sync/owner-sync'

export function registerOrdersHandlers(): void {
  ipcMain.handle('orders:create', (_, input: CreateOrderInput) => {
    // Loyalty tracking + customer_id linkage now happen atomically inside ordersRepo.create()
    // (so tablet & remote orders are covered too); don't upsert again here or totals double-count.
    const order = ordersRepo.create(input)
    // Auto-backup after each order (overwrites today's file)
    performAutoBackup()
    // Send Telegram notification
    sendOrderNotification(order)
    // Automatic receipt/kitchen intents were inserted into durable print_jobs in the same
    // transaction as the order. The printer worker owns delivery and visible retries.
    // Sync order to owner dashboard (fire-and-forget)
    syncOrderToCloud(order).catch(() => {})
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
    const result = ordersRepo.updateStatus(id, status)
    syncOrderStatusToCloud(id, status).catch(() => {})
    return result
  })

  ipcMain.handle('orders:cancel', (_, id: number) => {
    const result = ordersRepo.cancelOrder(id)
    syncOrderStatusToCloud(id, 'cancelled').catch(() => {})
    return result
  })

  ipcMain.handle('orders:getToday', () => {
    return ordersRepo.getTodayOrders()
  })

  ipcMain.handle(
    'orders:updateItems',
    (
      _,
      id: number,
      items: {
        menu_item_id: number
        quantity: number
        notes?: string
        worker_id?: number
        unit_price?: number
      }[],
      discountAmount?: number,
      discountDetails?: string,
      info?: {
        order_type?: string
        table_number?: string | null
        customer_phone?: string | null
        customer_name?: string | null
        notes?: string | null
      }
    ) => {
      const updated = ordersRepo.updateItems(id, items, discountAmount, discountDetails, info)
      // Re-sync the edited order to the owner dashboard so its cloud row reflects the new
      // items/total (previously only create/status-change synced, so edits never propagated).
      if (updated) syncOrderToCloud(updated).catch(() => {})
      return updated
    }
  )
}
