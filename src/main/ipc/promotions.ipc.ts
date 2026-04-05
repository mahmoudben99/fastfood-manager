import { ipcMain } from 'electron'
import {
  promotionsRepo,
  type CreatePromotionInput,
  type CreatePackInput
} from '../database/repositories/promotions.repo'

export function registerPromotionsHandlers(): void {
  // ── Promotions ──────────────────────────────────────────────

  ipcMain.handle('promotions:getAll', () => {
    return promotionsRepo.getAllPromotions()
  })

  ipcMain.handle('promotions:getActive', () => {
    return promotionsRepo.getActivePromotions()
  })

  ipcMain.handle('promotions:create', (_, input: CreatePromotionInput) => {
    return promotionsRepo.createPromotion(input)
  })

  ipcMain.handle('promotions:update', (_, id: number, input: Partial<CreatePromotionInput>) => {
    return promotionsRepo.updatePromotion(id, input)
  })

  ipcMain.handle('promotions:delete', (_, id: number) => {
    return promotionsRepo.deletePromotion(id)
  })

  ipcMain.handle('promotions:toggle', (_, id: number) => {
    return promotionsRepo.togglePromotion(id)
  })

  // ── Packs ───────────────────────────────────────────────────

  ipcMain.handle('packs:getAll', () => {
    return promotionsRepo.getAllPacks()
  })

  ipcMain.handle('packs:getActive', () => {
    return promotionsRepo.getActivePacks()
  })

  ipcMain.handle('packs:create', (_, input: CreatePackInput) => {
    return promotionsRepo.createPack(input)
  })

  ipcMain.handle('packs:update', (_, id: number, input: Partial<CreatePackInput>) => {
    return promotionsRepo.updatePack(id, input)
  })

  ipcMain.handle('packs:delete', (_, id: number) => {
    return promotionsRepo.deletePack(id)
  })

  ipcMain.handle('packs:toggle', (_, id: number) => {
    return promotionsRepo.togglePack(id)
  })
}
