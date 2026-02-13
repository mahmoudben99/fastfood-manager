import { ipcMain } from 'electron'
import bcrypt from 'bcryptjs'
import { getMachineId, isActivated, activate, validateUnlockCode } from '../activation/activation'
import { settingsRepo } from '../database/repositories/settings.repo'

export function registerActivationHandlers(): void {
  ipcMain.handle('activation:getMachineId', () => {
    return getMachineId()
  })

  ipcMain.handle('activation:isActivated', () => {
    return isActivated()
  })

  ipcMain.handle('activation:activate', (_, serialCode: string) => {
    return activate(serialCode)
  })

  ipcMain.handle('activation:validateUnlockCode', (_, code: string) => {
    return validateUnlockCode(code)
  })

  ipcMain.handle('activation:resetPassword', (_, unlockCode: string, newPassword: string) => {
    if (!validateUnlockCode(unlockCode)) {
      return { success: false, error: 'Invalid unlock code' }
    }
    const hash = bcrypt.hashSync(newPassword, 10)
    settingsRepo.set('admin_password_hash', hash)
    return { success: true }
  })
}
