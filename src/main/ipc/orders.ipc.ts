import { ipcMain } from 'electron'
import { ordersRepo, type CreateOrderInput } from '../database/repositories/orders.repo'
import { performAutoBackup } from './backup.ipc'
import { getDb } from '../database/connection'
import { createOrderService } from '../services/order-service'

export function registerOrdersHandlers(): void {
  ipcMain.handle('orders:create', (_, input: CreateOrderInput) => {
    // Loyalty tracking + customer_id linkage now happen atomically inside ordersRepo.create()
    // (so tablet & remote orders are covered too); don't upsert again here or totals double-count.
    const sourceRequestId = input.source_request_id?.trim()
    if (!sourceRequestId) throw new Error('source_request_id is required; retry the same checkout with the same id')
    const order = ordersRepo.create({
      ...input,
      source: 'pos',
      source_request_id: sourceRequestId
    })
    // Auto-backup after each order (overwrites today's file)
    if (!order.duplicate) performAutoBackup()
    // Owner sync, Telegram, analytics, queue broadcast, and printing are durable rows created
    // by the shared order transaction and delivered by the background workers.
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
      return ordersRepo.updateItems(id, items, discountAmount, discountDetails, info)
    }
  )

  // WP-F tested edit/status surface. These handlers call the same injected core used by
  // ordersRepo's legacy adapters, so renderer and non-renderer mutations cannot diverge.
  ipcMain.handle('orders:effects:updateHeader', (_, input) =>
    createOrderService({ db: getDb() }).updateOrderHeader(input)
  )
  ipcMain.handle('orders:effects:updateLines', (_, input) =>
    createOrderService({ db: getDb() }).updateOrderLines(input)
  )
  ipcMain.handle('orders:effects:updateStatus', (_, orderId: number, status) =>
    createOrderService({ db: getDb() }).updateOrderStatus(orderId, status)
  )
}
