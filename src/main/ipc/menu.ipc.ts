import { ipcMain, dialog } from 'electron'
import { copyFileSync } from 'fs'
import { join, extname } from 'path'
import { randomUUID } from 'crypto'
import { menuRepo, type CreateMenuItemInput } from '../database/repositories/menu.repo'
import { getMenuImagesPath } from '../database/connection'

export function registerMenuHandlers(): void {
  ipcMain.handle('menu:getAll', (_, categoryId?: number) => {
    return menuRepo.getAll(categoryId)
  })

  ipcMain.handle('menu:getById', (_, id: number) => {
    return menuRepo.getById(id)
  })

  ipcMain.handle('menu:create', (_, input: CreateMenuItemInput) => {
    return menuRepo.create(input)
  })

  ipcMain.handle('menu:update', (_, id: number, input: Partial<CreateMenuItemInput>) => {
    return menuRepo.update(id, input)
  })

  ipcMain.handle('menu:delete', (_, id: number) => {
    return menuRepo.delete(id)
  })

  ipcMain.handle('menu:getDeleted', () => {
    return menuRepo.getDeleted()
  })

  ipcMain.handle('menu:restore', (_, id: number) => {
    if (!Number.isInteger(id) || id <= 0) throw new Error('A valid menu item id is required')
    const restored = menuRepo.restore(id)
    if (!restored) throw new Error('That menu item no longer exists')
    return restored
  })

  ipcMain.handle('menu:uploadImage', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp'] }]
    })

    if (result.canceled || !result.filePaths[0]) return null

    const sourcePath = result.filePaths[0]
    const ext = extname(sourcePath)
    const fileName = `food_${randomUUID()}${ext}`
    const destPath = join(getMenuImagesPath(), fileName)

    copyFileSync(sourcePath, destPath)
    return destPath
  })
}
