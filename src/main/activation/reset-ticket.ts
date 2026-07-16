import { randomBytes } from 'crypto'

/**
 * One-shot ticket bridging "the reset code was accepted" and "set the new password".
 *
 * The password-reset UI is two screens: enter the code, then choose a new password. Both the
 * Telegram code (validateTelegramResetCode) and the support code (validateCloudResetCode) are
 * single-use and are CONSUMED on the first screen. The second screen then re-validated the same,
 * now-burnt code — so every Telegram reset failed with "Invalid or expired code", and the cloud
 * support code additionally hit the HMAC validator that could never accept it.
 *
 * Validation now mints a ticket; the reset screen redeems it. The code is checked exactly once.
 */
const TICKET_TTL_MS = 5 * 60 * 1000

let pending: { token: string; expiresAt: number } | null = null

export function issueResetTicket(): string {
  const token = randomBytes(16).toString('hex')
  pending = { token, expiresAt: Date.now() + TICKET_TTL_MS }
  return token
}

/** True exactly once per issued ticket, and only before it expires. */
export function redeemResetTicket(token: string): boolean {
  if (!pending || !token) return false
  if (Date.now() > pending.expiresAt) {
    pending = null
    return false
  }
  // Compare full length; tokens are fixed-size hex so a plain compare leaks nothing useful.
  if (token !== pending.token) return false
  pending = null
  return true
}

export function clearResetTicket(): void {
  pending = null
}
