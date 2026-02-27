import { ipcMain } from 'electron'
import bcrypt from 'bcryptjs'
import {
  getMachineId,
  isActivated,
  activate,
  validateUnlockCode,
  saveTelegramResetCode,
  validateTelegramResetCode
} from '../activation/activation'
import { settingsRepo } from '../database/repositories/settings.repo'
import { recordActivation } from '../activation/cloud'
import { sendMessageToChat } from '../telegram/bot'

export function registerActivationHandlers(): void {
  ipcMain.handle('activation:getMachineId', () => {
    return getMachineId()
  })

  ipcMain.handle('activation:isActivated', () => {
    return isActivated()
  })

  ipcMain.handle('activation:activate', async (_, serialCode: string) => {
    const result = activate(serialCode)
    if (result.success) {
      settingsRepo.set('activation_type', 'full')
      // Record full license in cloud (fire-and-forget — works offline too)
      recordActivation(result.machineId).catch(() => {})
    }
    return result
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

  /** Telegram self-service: generate 6-digit code and send via bot. */
  ipcMain.handle('reset:telegram', async () => {
    const chatId = settingsRepo.get('telegram_chat_id')
    const token = settingsRepo.get('telegram_bot_token')
    if (!chatId || !token) {
      return { sent: false, error: 'Telegram bot not configured' }
    }
    const code = saveTelegramResetCode()
    const sent = await sendMessageToChat(
      `🔐 *Fast Food Manager — Password Reset*\n\nYour reset code: *${code}*\n\n⚠️ This code expires in 10 minutes.`
    )
    return { sent }
  })

  /** Validate a 6-digit Telegram reset code (stored locally). */
  ipcMain.handle('reset:validateTelegram', (_, code: string) => {
    return { valid: validateTelegramResetCode(code) }
  })

  /**
   * Reset password after validation.
   * method='telegram': validate with local 6-digit code (already validated in renderer, just hash+save)
   * method='support': validate with 8-char HMAC unlock code
   */
  ipcMain.handle('reset:resetPassword', (_, code: string, newPassword: string, method: 'telegram' | 'support') => {
    let valid = false
    if (method === 'telegram') {
      valid = validateTelegramResetCode(code)
    } else {
      valid = validateUnlockCode(code)
    }
    if (!valid) {
      return { success: false, error: 'Invalid or expired code' }
    }
    const hash = bcrypt.hashSync(newPassword, 10)
    settingsRepo.set('admin_password_hash', hash)
    return { success: true }
  })
}
