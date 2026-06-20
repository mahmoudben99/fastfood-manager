import { settingsRepo } from '../database/repositories/settings.repo'

/**
 * 4-digit pairing code for the TV display.
 *
 * The code + connection info (LAN IPs, port, cloud fallback URL) are published inside the
 * existing `display_settings` row by cloud-sync (no separate table needed). The TV app sends
 * this code to /api/pair, gets the LAN IPs, probes them (instant, free), and only falls back
 * to the cloud URL if none answer. So setup is a 4-digit code instead of a long URL, and
 * Supabase load stays near-zero in the normal LAN case.
 *
 * Collision note: the code is a locally-persisted random 4-digit (10000 space). With a small
 * fleet the odds two restaurants share a code are tiny; the resolver takes the freshest row.
 * Bump to 5 digits here if the fleet ever grows enough to matter.
 */
export function getPairingCode(): string {
  let code = settingsRepo.get('pairing_code')
  if (!code) {
    code = String(Math.floor(1000 + Math.random() * 9000))
    settingsRepo.set('pairing_code', code)
  }
  return code
}
