import { ipcMain } from 'electron'
import { customersRepo } from '../database/repositories/customers.repo'

export function registerCustomersHandlers(): void {
  ipcMain.handle('customers:getAll', (_, sortBy?) => {
    return customersRepo.getAll(sortBy)
  })

  ipcMain.handle('customers:search', (_, query: string) => {
    return customersRepo.search(query)
  })

  ipcMain.handle('customers:getById', (_, id: number) => {
    return customersRepo.getById(id)
  })

  ipcMain.handle('customers:getOrders', (_, customerId: number) => {
    return customersRepo.getCustomerOrders(customerId)
  })

  ipcMain.handle('customers:getFavorites', (_, customerId: number) => {
    return customersRepo.getFavoriteItems(customerId)
  })

  ipcMain.handle('customers:update', (_, id: number, data: { name?: string; notes?: string }) => {
    return customersRepo.update(id, data)
  })
}
