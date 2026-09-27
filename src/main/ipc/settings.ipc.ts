import { ipcMain, dialog, app } from 'electron'
import bcrypt from 'bcryptjs'
import { settingsRepo } from '../database/repositories/settings.repo'
import { syncAdminPassword, provisionOwnerCredential } from '../sync/owner-sync'
import { normalizeOrderAlertMinutes, orderAlertMinutesOrDefault } from '../../shared/settings-rules'
import { getLogoDataUrl, importLogo, removeLogo, resolveLogoFile } from '../services/logo'
import { APPROVAL_SETTING_KEYS } from '../services/approvals'

// Keys that can ONLY be set through proper activation/trial flows, never from renderer
const PROTECTED_KEYS = new Set([
  'activation_type',
  'activation_status',
  'activation_code',
  'machine_id',
  'trial_expires_at',
  'trial_status',
  '_integrity',
  // v4: approval policy + manager PIN change only through approvals:savePolicy / setManagerPin
  // (admin password), so a cashier cannot switch manager approval off from the renderer.
  ...APPROVAL_SETTING_KEYS
])

/**
 * Keys whose values are validated at this boundary. `order_alert_minutes` of 0 or a negative
 * number made every order on the order screen show as late; invalid writes are refused and an
 * invalid stored value reads back as the default.
 */
function sanitizeWrite(key: string, value: string): string | null {
  if (key === 'order_alert_minutes') {
    const minutes = normalizeOrderAlertMinutes(value)
    return minutes === null ? null : String(minutes)
  }
  return value
}

function sanitizeRead(key: string, value: string | null): string | null {
  if (key === 'order_alert_minutes') return String(orderAlertMinutesOrDefault(value))
  return value
}

export function registerSettingsHandlers(): void {
  // Migrate a legacy absolute logo_path into logo_data at startup, so the next backup carries it.
  try {
    resolveLogoFile()
  } catch (error) {
    console.error('[Logo] Startup logo check failed:', error)
  }

  ipcMain.handle('settings:get', (_, key: string) => {
    return sanitizeRead(key, settingsRepo.get(key))
  })

  ipcMain.handle('settings:set', (_, key: string, value: string) => {
    if (PROTECTED_KEYS.has(key)) return false
    const clean = sanitizeWrite(key, value)
    if (clean === null) return false
    value = clean
    settingsRepo.set(key, value)
    // Sync admin password hash to cloud whenever it's updated
    if (key === 'admin_password_hash') {
      syncAdminPassword().catch(() => {})
    }
    return true
  })

  ipcMain.handle('settings:getAll', () => {
    const all = settingsRepo.getAll()
    all.order_alert_minutes = sanitizeRead('order_alert_minutes', all.order_alert_minutes ?? null) as string
    return all
  })

  ipcMain.handle('settings:setMultiple', (_, settings: Record<string, string>) => {
    // Strip any protected keys from the batch
    const safe: Record<string, string> = {}
    for (const [k, v] of Object.entries(settings)) {
      if (PROTECTED_KEYS.has(k)) continue
      const clean = sanitizeWrite(k, v)
      if (clean !== null) safe[k] = clean
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

  // The logo is stored as a small resized PNG inside the settings table (logo_data) so it survives
  // a database-only backup/restore and a move to a new PC; logo_path is its materialized file.
  // Copying the original upload (multi-MB photos) made every receipt fail to load. See services/logo.ts.
  ipcMain.handle('settings:uploadLogo', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp'] }]
    })

    if (result.canceled || !result.filePaths[0]) return null
    // Rejects with a readable message when the image cannot be decoded.
    return importLogo(result.filePaths[0])
  })

  ipcMain.handle('settings:getLogoDataUrl', () => getLogoDataUrl())

  ipcMain.handle('settings:removeLogo', () => {
    removeLogo()
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
