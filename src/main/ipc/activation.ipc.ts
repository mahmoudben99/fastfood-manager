import { ipcMain } from 'electron'
import bcrypt from 'bcryptjs'
import {
  getMachineId,
  isActivated,
  activate,
  validateUnlockCode,
  saveTelegramResetCode,
  validateTelegramResetCode,
  saveIntegrityChecksum
} from '../activation/activation'
import { issueResetTicket, redeemResetTicket } from '../activation/reset-ticket'
import { settingsRepo } from '../database/repositories/settings.repo'
import { recordActivation } from '../activation/cloud'
import { sendMessageToChat } from '../telegram/bot'
import { provisionOwnerCredential } from '../sync/owner-sync'

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
      saveIntegrityChecksum()
      // Record full license in cloud (fire-and-forget — works offline too)
      recordActivation(result.machineId).catch(() => {})
    }
    return result
  })

  /** Validate an 8-char HMAC support unlock code. Mints the ticket reset:resetPassword redeems. */
  ipcMain.handle('activation:validateUnlockCode', (_, code: string) => {
    const valid = validateUnlockCode(code)
    return valid ? { valid: true, token: issueResetTicket() } : { valid: false }
  })

  ipcMain.handle('activation:resetPassword', (_, unlockCode: string, newPassword: string) => {
    if (!validateUnlockCode(unlockCode)) {
      return { success: false, error: 'Invalid unlock code' }
    }
    const hash = bcrypt.hashSync(newPassword, 10)
    settingsRepo.set('admin_password_hash', hash)
    // Provision the remote owner-dashboard credential (owner_credentials) with the new password.
    provisionOwnerCredential(newPassword).catch(() => {})
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

  /** Validate a 6-digit Telegram reset code (stored locally). Consumes the code and, on success,
   *  mints the one-shot ticket that reset:resetPassword redeems. */
  ipcMain.handle('reset:validateTelegram', (_, code: string) => {
    const valid = validateTelegramResetCode(code)
    return valid ? { valid: true, token: issueResetTicket() } : { valid: false }
  })

  /**
   * Set the new password. Authorised by the ticket minted when the reset code was validated —
   * NOT by re-checking the code, which is single-use and already consumed by then.
   */
  ipcMain.handle('reset:resetPassword', (_, token: string, newPassword: string) => {
    if (!redeemResetTicket(token)) {
      return { success: false, error: 'Reset session expired. Request a new code.' }
    }
    if (typeof newPassword !== 'string' || newPassword.length < 4) {
      return { success: false, error: 'Password too short' }
    }
    const hash = bcrypt.hashSync(newPassword, 10)
    settingsRepo.set('admin_password_hash', hash)
    // Provision the remote owner-dashboard credential (owner_credentials) with the new password.
    provisionOwnerCredential(newPassword).catch(() => {})
    return { success: true }
  })
}
