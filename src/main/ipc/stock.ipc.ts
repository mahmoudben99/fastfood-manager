import { ipcMain } from 'electron'
import { stockRepo, type CreateStockItemInput } from '../database/repositories/stock.repo'

export function registerStockHandlers(): void {
  ipcMain.handle('stock:getAll', () => {
    return stockRepo.getAll()
  })

  ipcMain.handle('stock:getById', (_, id: number) => {
    return stockRepo.getById(id)
  })

  ipcMain.handle('stock:getLowStock', () => {
    return stockRepo.getLowStock()
  })

  ipcMain.handle('stock:getLowStockCount', () => {
    return stockRepo.getLowStockCount()
  })

  ipcMain.handle('stock:create', (_, input: CreateStockItemInput) => {
    return stockRepo.create(input)
  })

  ipcMain.handle('stock:update', (_, id: number, input: Partial<CreateStockItemInput>) => {
    return stockRepo.update(id, input)
  })

  ipcMain.handle('stock:delete', (_, id: number) => {
    return stockRepo.delete(id)
  })

  ipcMain.handle('stock:fix', (_, id: number, newQuantity: number, reason: string) => {
    return stockRepo.fix(id, newQuantity, reason)
  })

  ipcMain.handle('stock:adjust', (_, id: number, newQuantity: number, reason: string) => {
    return stockRepo.adjust(id, newQuantity, reason)
  })

  ipcMain.handle('stock:addPurchase', (_, id: number, quantity: number, pricePerUnit: number) => {
    return stockRepo.addPurchase(id, quantity, pricePerUnit)
  })
}
