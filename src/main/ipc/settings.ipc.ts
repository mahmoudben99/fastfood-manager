import { ipcMain, dialog, app } from 'electron'
import { copyFileSync } from 'fs'
import { join, extname } from 'path'
import { randomUUID } from 'crypto'
import bcrypt from 'bcryptjs'
import { settingsRepo } from '../database/repositories/settings.repo'
import { getLogoPath } from '../database/connection'
import { syncAdminPassword, provisionOwnerCredential } from '../sync/owner-sync'

// Keys that can ONLY be set through proper activation/trial flows, never from renderer
const PROTECTED_KEYS = new Set([
  'activation_type',
  'activation_status',
  'activation_code',
  'machine_id',
  'trial_expires_at',
  'trial_status',
  '_integrity'
])

export function registerSettingsHandlers(): void {
  ipcMain.handle('settings:get', (_, key: string) => {
    return settingsRepo.get(key)
  })

  ipcMain.handle('settings:set', (_, key: string, value: string) => {
    if (PROTECTED_KEYS.has(key)) return false
    settingsRepo.set(key, value)
    // Sync admin password hash to cloud whenever it's updated
    if (key === 'admin_password_hash') {
      syncAdminPassword().catch(() => {})
    }
    return true
  })

  ipcMain.handle('settings:getAll', () => {
    return settingsRepo.getAll()
  })

  ipcMain.handle('settings:setMultiple', (_, settings: Record<string, string>) => {
    // Strip any protected keys from the batch
    const safe: Record<string, string> = {}
    for (const [k, v] of Object.entries(settings)) {
      if (!PROTECTED_KEYS.has(k)) safe[k] = v
    }
    settingsRepo.setMultiple(safe)
    // SetupWizard creates the first admin password through this batch path. Without this sync,
    // the owner dashboard rejects the correct password until the desktop is restarted.
    if (Object.prototype.hasOwnProperty.call(safe, 'admin_password_hash')) {
      syncAdminPassword().catch(() => {})
    }
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

  /**
   * Set/change the admin password AND provision the remote owner-dashboard credential in one step.
   * The plaintext is available here (unlike the hash-only `settings:set` path), so this is the site
   * that can bcrypt-hash it server-side into `owner_credentials` (via the device-token-authed admin
   * endpoint) — the bridge that makes the owner dashboard reachable. The plaintext is never logged.
   * `ownerDashboard` lets the renderer surface an i18n hint (e.g. 'too_short' → remote dashboard
   * needs a >= 8-char credential); a non-'provisioned' result never weakens local admin auth.
   */
  ipcMain.handle('settings:setAdminPassword', async (_, newPassword: string) => {
    if (typeof newPassword !== 'string' || newPassword.length < 4) {
      return { ok: false as const, error: 'too_short_local' as const }
    }
    const hash = bcrypt.hashSync(newPassword, 10)
    settingsRepo.set('admin_password_hash', hash)
    const provision = await provisionOwnerCredential(newPassword)
    return { ok: true as const, ownerDashboard: provision.ok ? ('provisioned' as const) : provision.reason }
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
    // Get from database with default of true
    const setting = settingsRepo.get('auto_launch')
    return setting !== 'false' // Default to true if not set or set to anything other than 'false'
  })

  ipcMain.handle('settings:setAutoLaunch', (_, enabled: boolean) => {
    // Save to database
    settingsRepo.set('auto_launch', enabled ? 'true' : 'false')

    // Update system setting
    app.setLoginItemSettings({
      openAtLogin: enabled,
      openAsHidden: false,
      name: 'Fast Food Manager'
    })
    return true
  })

  /**
   * Sign out and return to activation/setup without touching restaurant data.
   *
   * This path previously called resetAllData(), although the Settings screen explicitly says
   * orders, menu, stock and workers are kept. It also proceeded when the attempted backup
   * returned `{ ok: false }`. Logout is an entitlement transition, never a factory reset.
   */
  ipcMain.handle('settings:logout', () => {
    settingsRepo.setMultiple({
      activation_type: '',
      activation_status: '',
      activation_code: '',
      trial_expires_at: '',
      trial_status: '',
      _integrity: ''
    })
    return { success: true }
  })
}
