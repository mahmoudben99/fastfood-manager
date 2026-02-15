import { ipcMain, dialog, app } from 'electron'
import { copyFileSync } from 'fs'
import { join, extname } from 'path'
import { randomUUID } from 'crypto'
import bcrypt from 'bcryptjs'
import { settingsRepo } from '../database/repositories/settings.repo'
import { getLogoPath } from '../database/connection'

export function registerSettingsHandlers(): void {
  ipcMain.handle('settings:get', (_, key: string) => {
    return settingsRepo.get(key)
  })

  ipcMain.handle('settings:set', (_, key: string, value: string) => {
    settingsRepo.set(key, value)
    return true
  })

  ipcMain.handle('settings:getAll', () => {
    return settingsRepo.getAll()
  })

  ipcMain.handle('settings:setMultiple', (_, settings: Record<string, string>) => {
    settingsRepo.setMultiple(settings)
    return true
  })

  ipcMain.handle('settings:getSchedule', () => {
    return settingsRepo.getSchedule()
  })

  ipcMain.handle('settings:setSchedule', (_, schedule) => {
    settingsRepo.setSchedule(schedule)
    return true
  })

  ipcMain.handle('settings:hashPassword', (_, password: string) => {
    return bcrypt.hashSync(password, 10)
  })

  ipcMain.handle('settings:verifyPassword', (_, password: string) => {
    const hash = settingsRepo.get('admin_password_hash')
    if (!hash) return false
    return bcrypt.compareSync(password, hash)
  })

  ipcMain.handle('settings:uploadLogo', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp'] }]
    })

    if (result.canceled || !result.filePaths[0]) return null

    const sourcePath = result.filePaths[0]
    const ext = extname(sourcePath)
    const fileName = `logo_${randomUUID()}${ext}`
    const destPath = join(getLogoPath(), fileName)

    copyFileSync(sourcePath, destPath)
    settingsRepo.set('logo_path', destPath)

    return destPath
  })

  ipcMain.handle('settings:selectFolder', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory']
    })
    if (result.canceled || !result.filePaths[0]) return null
    return result.filePaths[0]
  })

  ipcMain.handle('settings:getAutoLaunch', () => {
    return app.getLoginItemSettings().openAtLogin
  })

  ipcMain.handle('settings:setAutoLaunch', (_, enabled: boolean) => {
    app.setLoginItemSettings({
      openAtLogin: enabled,
      name: 'Fast Food Manager'
    })
    return true
  })
}
