import { ipcMain, BrowserWindow } from 'electron'
import {
  startTabletServer,
  stopTabletServer,
  isTabletServerRunning,
  getTabletServerStatus
} from '../tablet/server'
import { settingsRepo } from '../database/repositories/settings.repo'

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
}
