import { ipcMain, BrowserWindow, dialog } from 'electron'
import { copyFileSync } from 'fs'
import { extname, join } from 'path'
import { randomUUID } from 'crypto'
import {
  startTabletServer,
  stopTabletServer,
  isTabletServerRunning,
  getTabletServerStatus,
  pushDisplayUpdate
} from '../tablet/server'
import { settingsRepo } from '../database/repositories/settings.repo'
import { getDisplayImagesPath } from '../database/connection'
import { syncOwnerPin } from '../sync/owner-sync'
import { getMachineId } from '../activation/activation'

// getWindow is a lazy getter so we always grab the live BrowserWindow reference,
// not a stale null captured at registration time (createWindow() runs after registerAllHandlers()).
export function registerTabletHandlers(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle('tablet:start', async () => {
    try {
      const win = getWindow()
      if (!win) return { ok: false, error: 'Window not ready' }
      const result = await startTabletServer(win)
      settingsRepo.set('tablet_server_auto_start', '1')
      return { ok: true, ...result }
    } catch (e) {
      return { ok: false, error: String(e) }
    }
  })

  ipcMain.handle('tablet:stop', () => {
    stopTabletServer()
    settingsRepo.set('tablet_server_auto_start', '0')
    return { ok: true }
  })

  ipcMain.handle('tablet:status', async () => {
    return getTabletServerStatus()
  })

  ipcMain.handle('tablet:setPin', (_event, pin: string) => {
    if (!/^\d{4}$/.test(pin)) return { ok: false, error: 'PIN must be 4 digits' }
    settingsRepo.set('tablet_pin', pin)
    // Increment version to invalidate all existing browser sessions
    const current = parseInt(settingsRepo.get('tablet_pin_version') ?? '1', 10)
    settingsRepo.set('tablet_pin_version', String(current + 1))
    // Sync PIN to cloud for owner dashboard authentication
    syncOwnerPin(pin).catch(() => {})
    return { ok: true }
  })

  ipcMain.handle('tablet:setPinEnabled', (_event, enabled: boolean) => {
    settingsRepo.set('tablet_pin_enabled', enabled ? '1' : '0')
    return { ok: true }
  })

  ipcMain.handle('tablet:setAutoStart', (_event, enabled: boolean) => {
    settingsRepo.set('tablet_server_auto_start', enabled ? '1' : '0')
    return { ok: true }
  })

  ipcMain.handle('tablet:isRunning', () => {
    return isTabletServerRunning()
  })

  ipcMain.handle('tablet:pushDisplayUpdate', (_event, data: any) => {
    pushDisplayUpdate(data)
    return { ok: true }
  })

  ipcMain.handle('display:uploadImages', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp'] }]
    })
    if (result.canceled || result.filePaths.length === 0) return null

    const displayDir = getDisplayImagesPath()
    const savedPaths: string[] = []

    // Load existing paths
    let existing: string[] = []
    try {
      const raw = settingsRepo.get('display_slideshow_images')
      if (raw) existing = JSON.parse(raw)
    } catch { /* ignore */ }

    for (const sourcePath of result.filePaths) {
      const ext = extname(sourcePath)
      const fileName = `display_${randomUUID()}${ext}`
      const destPath = join(displayDir, fileName)
      copyFileSync(sourcePath, destPath)
      savedPaths.push(destPath)
    }

    const allPaths = [...existing, ...savedPaths].slice(0, 10)
    settingsRepo.set('display_slideshow_images', JSON.stringify(allPaths))
    return allPaths
  })

  ipcMain.handle('display:getImages', () => {
    try {
      const raw = settingsRepo.get('display_slideshow_images')
      if (raw) return JSON.parse(raw)
    } catch { /* ignore */ }
    return []
  })

  ipcMain.handle('display:removeImage', (_event, path: string) => {
    try {
      const raw = settingsRepo.get('display_slideshow_images')
      if (raw) {
        const paths: string[] = JSON.parse(raw)
        const filtered = paths.filter(p => p !== path)
        settingsRepo.set('display_slideshow_images', JSON.stringify(filtered))
        return filtered
      }
    } catch { /* ignore */ }
    return []
  })

  ipcMain.handle('owner:getQR', async () => {
    const machineId = getMachineId()
    const adminDomain = settingsRepo.get('owner_dashboard_domain') || 'https://fastfood-manager-admin.vercel.app'
    const url = `${adminDomain.replace(/\/$/, '')}/owner/${machineId}`
    const QRCode = (await import('qrcode')).default
    const qrDataUrl = await QRCode.toDataURL(url, { width: 256, margin: 1 })
    return { url, qrDataUrl, machineId }
  })
}
