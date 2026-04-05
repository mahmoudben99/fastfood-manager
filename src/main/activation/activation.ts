import { createHash, createHmac } from 'crypto'
import { cpus, hostname, userInfo } from 'os'
import { settingsRepo } from '../database/repositories/settings.repo'

const SECRET_KEY = 'FFM-2024-SERIAL-KEY-DO-NOT-SHARE'
const UNLOCK_KEY = 'FFM-2024-UNLOCK-KEY-DO-NOT-SHARE'
const INTEGRITY_SALT = 'FFM-INTEGRITY-2024-SALT'

/** Generate a checksum for critical activation settings to detect DB tampering */
export function computeIntegrityChecksum(): string {
  const type = settingsRepo.get('activation_type') || ''
  const status = settingsRepo.get('activation_status') || ''
  const code = settingsRepo.get('activation_code') || ''
  const machineId = getMachineId()
  const raw = `${INTEGRITY_SALT}::${type}::${status}::${code}::${machineId}`
  return createHash('sha256').update(raw).digest('hex').substring(0, 32)
}

/** Save the integrity checksum after a legitimate activation change */
export function saveIntegrityChecksum(): void {
  const checksum = computeIntegrityChecksum()
  settingsRepo.set('_integrity', checksum)
}

/** Verify the integrity checksum matches current activation settings */
export function verifyIntegrity(): boolean {
  const stored = settingsRepo.get('_integrity')
  if (!stored) {
    // No checksum yet — only valid if no activation set
    const type = settingsRepo.get('activation_type')
    return !type || type === ''
  }
  return stored === computeIntegrityChecksum()
}

export function getMachineId(): string {
  const cpuModel = cpus()[0]?.model || 'unknown'
  const host = hostname()
  const user = userInfo().username
  const raw = `${cpuModel}::${host}::${user}`
  return createHash('sha256').update(raw).digest('hex').substring(0, 16).toUpperCase()
}

export function generateSerialCode(machineId: string): string {
  const hmac = createHmac('sha256', SECRET_KEY).update(machineId.toUpperCase()).digest('hex')
  const code = hmac.substring(0, 20).toUpperCase()
  return `${code.slice(0, 5)}-${code.slice(5, 10)}-${code.slice(10, 15)}-${code.slice(15, 20)}`
}

export function validateActivation(serialCode: string): { valid: boolean; machineId: string } {
  const machineId = getMachineId()
  const expected = generateSerialCode(machineId)
  const normalized = serialCode.toUpperCase().trim()
  return { valid: expected === normalized, machineId }
}

export function isActivated(): boolean {
  return settingsRepo.get('activation_status') === 'activated'
}

export function activate(
  serialCode: string
): { success: boolean; machineId: string; error?: string } {
  const { valid, machineId } = validateActivation(serialCode)
  if (!valid) {
    return { success: false, machineId, error: 'Invalid activation code for this machine' }
  }
  settingsRepo.set('activation_status', 'activated')
  settingsRepo.set('activation_code', serialCode.toUpperCase().trim())
  settingsRepo.set('machine_id', machineId)
  saveIntegrityChecksum()
  return { success: true, machineId }
}

export function generateUnlockCode(machineId: string): string {
  const hmac = createHmac('sha256', UNLOCK_KEY).update(machineId.toUpperCase()).digest('hex')
  return hmac.substring(0, 8).toUpperCase()
}

export function validateUnlockCode(code: string): boolean {
  const machineId = getMachineId()
  const expected = generateUnlockCode(machineId)
  return code.toUpperCase().trim() === expected
}

// ─── Telegram self-service reset ─────────────────────────────────────────────
// Generates a random 6-digit code stored locally for 10 minutes.
// Main process sends it to the user's configured Telegram bot chat.

export function saveTelegramResetCode(): string {
  const code = String(Math.floor(100000 + Math.random() * 900000)) // 6 digits
  const expiresAt = Date.now() + 10 * 60 * 1000 // 10 minutes
  settingsRepo.set('telegram_reset_code', code)
  settingsRepo.set('telegram_reset_expires', String(expiresAt))
  return code
}

export function validateTelegramResetCode(code: string): boolean {
  const stored = settingsRepo.get('telegram_reset_code')
  const expiresAt = Number(settingsRepo.get('telegram_reset_expires') || '0')
  if (!stored || !expiresAt) return false
  if (Date.now() > expiresAt) {
    settingsRepo.set('telegram_reset_code', '')
    settingsRepo.set('telegram_reset_expires', '')
    return false
  }
  if (code.trim() !== stored) return false
  // Consume the code after successful validation
  settingsRepo.set('telegram_reset_code', '')
  settingsRepo.set('telegram_reset_expires', '')
  return true
}
