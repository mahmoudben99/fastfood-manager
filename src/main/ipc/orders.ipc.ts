import { ipcMain } from 'electron'
import { ordersRepo, type CreateOrderInput } from '../database/repositories/orders.repo'
import { performAutoBackup } from './backup.ipc'

export function registerOrdersHandlers(): void {
  ipcMain.handle('orders:create', (_, input: CreateOrderInput) => {
    const order = ordersRepo.create(input)
    // Auto-backup after each order (overwrites today's file)
    performAutoBackup()
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
