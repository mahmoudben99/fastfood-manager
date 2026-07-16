import { ipcMain } from 'electron'
import { getMachineId, getPinnedMachineId } from '../activation/activation'
import { settingsRepo } from '../database/repositories/settings.repo'
import { checkTrialStatus, validateCloudResetCode } from '../activation/cloud'
import { startLicenseTrial } from '../activation/license-service'
import { activationTypeForEntitlement, expiresAtForEntitlement } from '../activation/license-outcome'
import { issueResetTicket } from '../activation/reset-ticket'

export function registerTrialHandlers(): void {
  /**
   * Explicit "Start free trial" action → license server /v1/trial/start (the ONLY path that creates
   * a trial). The server call is idempotent: a machine that already has a trial or a migrated PAID
   * row is bound and returned as-is (never re-trialed, never downgraded). We tag activation_type from
   * the SIGNED plan (B1: a bound paid row must become 'full', never 'trial'), and we PIN — never
   * overwrite — the machine id (B3). Never invoked by the periodic watcher.
   */
  ipcMain.handle('trial:start', async (_, info?: { restaurantName?: string; phone?: string }) => {
    // Pin the identity: seed it once if absent, but never clobber an existing pin with a recompute.
    if (!settingsRepo.get('machine_id')) settingsRepo.set('machine_id', getMachineId())

    const decision = await startLicenseTrial(info ?? {})

    if (decision.state === 'licensed' || decision.state === 'migration') {
      const activationType = activationTypeForEntitlement(decision.entitlement)
      const expiresAt = expiresAtForEntitlement(decision.entitlement)
      settingsRepo.set('activation_status', 'activated')
      settingsRepo.set('activation_type', activationType)
      if (activationType === 'full') settingsRepo.set('activation_code', 'CLOUD-VERIFIED')
      if (expiresAt) settingsRepo.set('trial_expires_at', expiresAt)
      settingsRepo.set('license_lock', '')
      return { success: true, expiresAt, plan: decision.entitlement?.plan ?? 'trial', activationType }
    }

    const error = decision.reason === 'inconclusive' ? 'Network error' : decision.reason
    return { success: false, error: error || 'Could not start trial. Check your internet connection.' }
  })

  /** Check trial status from the cloud. Used by the trial watcher. */
  ipcMain.handle('trial:check', async () => {
    return await checkTrialStatus(getPinnedMachineId())
  })

  /** Get trial status from local DB only (fast, no network). */
  ipcMain.handle('trial:getLocalStatus', () => {
    return {
      activationType: settingsRepo.get('activation_type') || null,
      trialExpiresAt: settingsRepo.get('trial_expires_at') || null,
      activationStatus: settingsRepo.get('activation_status') || null
    }
  })

  /** Validate a cloud-generated reset code (from admin dashboard). The code is single-use, so on
   *  success mint the ticket that reset:resetPassword redeems — re-checking the (now consumed)
   *  code on the new-password screen could never succeed. */
  ipcMain.handle('reset:validateCloud', async (_, code: string) => {
    const machineId = getPinnedMachineId()
    const result = await validateCloudResetCode(machineId, code)
    return result.valid ? { valid: true, token: issueResetTicket() } : { valid: false }
  })
}
