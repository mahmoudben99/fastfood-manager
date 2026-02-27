import { ipcMain } from 'electron'
import { getMachineId } from '../activation/activation'
import { settingsRepo } from '../database/repositories/settings.repo'
import {
  startTrial,
  checkTrialStatus,
  validateCloudResetCode
} from '../activation/cloud'

export function registerTrialHandlers(): void {
  /** Start a 7-day free trial. Stores activation_type='trial' locally on success. */
  ipcMain.handle('trial:start', async () => {
    const machineId = getMachineId()

    // First, always check the cloud for any existing trial on this machine.
    // This prevents a reset when local data is cleared (reinstall, etc.)
    try {
      const existing = await checkTrialStatus(machineId)
      if (existing.status === 'active' && existing.expiresAt) {
        // Machine already has an active trial — restore it locally without inserting
        settingsRepo.set('activation_status', 'activated')
        settingsRepo.set('activation_type', 'trial')
        settingsRepo.set('trial_expires_at', existing.expiresAt)
        settingsRepo.set('machine_id', machineId)
        return { success: true, expiresAt: existing.expiresAt, alreadyStarted: true }
      }
      if (existing.status === 'expired') {
        return { success: false, error: 'trial_expired' }
      }
      if (existing.status === 'paused') {
        return { success: false, error: 'trial_paused' }
      }
      // status === 'not_found' → fall through to insert a new trial below
    } catch {
      return { success: false, error: 'Could not reach server. Check your internet connection.' }
    }

    const result = await startTrial(machineId)

    if (result.success && result.expiresAt) {
      settingsRepo.set('activation_status', 'activated')
      settingsRepo.set('activation_type', 'trial')
      settingsRepo.set('trial_expires_at', result.expiresAt)
      settingsRepo.set('machine_id', machineId)
      return { success: true, expiresAt: result.expiresAt }
    }

    // Belt-and-suspenders: race condition where two processes insert at same time
    if (result.error === 'trial_exists' && result.expiresAt) {
      settingsRepo.set('activation_status', 'activated')
      settingsRepo.set('activation_type', 'trial')
      settingsRepo.set('trial_expires_at', result.expiresAt)
      settingsRepo.set('machine_id', machineId)
      return { success: true, expiresAt: result.expiresAt, alreadyStarted: true }
    }

    return { success: false, error: result.error || 'Could not start trial. Check your internet connection.' }
  })

  /** Check trial status from the cloud. Used by the trial watcher. */
  ipcMain.handle('trial:check', async () => {
    const machineId = getMachineId()
    return await checkTrialStatus(machineId)
  })

  /** Get trial status from local DB only (fast, no network). */
  ipcMain.handle('trial:getLocalStatus', () => {
    return {
      activationType: settingsRepo.get('activation_type') || null,
      trialExpiresAt: settingsRepo.get('trial_expires_at') || null,
      activationStatus: settingsRepo.get('activation_status') || null
    }
  })

  /** Validate a cloud-generated reset code (from admin dashboard). */
  ipcMain.handle('reset:validateCloud', async (_, code: string) => {
    const machineId = getMachineId()
    return await validateCloudResetCode(machineId, code)
  })
}
