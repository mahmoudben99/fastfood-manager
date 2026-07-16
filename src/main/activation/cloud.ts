import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { net } from 'electron'
import { checkLicense, startLicenseTrial } from './license-service'
import type { LicenseDecision } from './license-client'
import { getEndpoints } from '../config/endpoints'

let _client: SupabaseClient<any, any, any> | null = null

export function getClient(): SupabaseClient<any, any, any> {
  if (!_client) {
    // M9/§4: all endpoint values (incl. Supabase) resolve through the endpoints module (env>file>baked).
    const { supabaseUrl, supabaseAnonKey } = getEndpoints()
    _client = createClient<any, any, any>(supabaseUrl, supabaseAnonKey)
  }
  return _client
}

/**
 * postgrest-js RESOLVES (never rejects) when the network fails: it hands back `status: 0` and an
 * error with an empty `code`. Every license/trial check below therefore has to treat "I could not
 * get an answer" as its own outcome, distinct from "the server answered: no such row".
 *
 * Conflating the two is how a paying restaurant gets locked out: a 3-second WiFi drop makes the
 * activations lookup return "no row", the startup check reads that as "license revoked", and it
 * erases activation_type. So these functions THROW on any inconclusive result and only return a
 * value when the server actually answered.
 */
function inconclusive(): Error {
  return new Error('NETWORK_ERROR')
}

export type TrialStatus = 'active' | 'expired' | 'paused' | 'not_found'

export interface TrialCheckResult {
  status: TrialStatus
  expiresAt?: string
  pausedRemainingMs?: number
}

/** Register / update this installation in the cloud. Fire-and-forget. */
export async function registerInstallation(
  machineId: string,
  restaurantName?: string,
  phone?: string,
  appVersion?: string
): Promise<void> {
  try {
    const supabase = getClient()
    const now = new Date().toISOString()
    await supabase.from('installations').upsert(
      {
        machine_id: machineId,
        restaurant_name: restaurantName || null,
        phone: phone || null,
        app_version: appVersion || null,
        updated_at: now
      },
      { onConflict: 'machine_id' }
    )
  } catch {
    // Silently ignore — non-critical, app works without it
  }
}

function entitlementExpiresAt(decision: LicenseDecision): string | undefined {
  return decision.entitlement ? new Date(decision.entitlement.exp * 1000).toISOString() : undefined
}

/**
 * Start a free trial for this machine via the license server's /v1/trial/start (the ONLY path that
 * creates a fresh trial). Delegates to the entitlement client; `restaurantName`/`phone` are optional
 * enrollment metadata. Never downgrades an already-migrated paid row (the server enforces that).
 */
export async function startTrial(
  _machineId: string,
  info: { restaurantName?: string; phone?: string } = {}
): Promise<{ success: boolean; expiresAt?: string; error?: string }> {
  try {
    const decision = await startLicenseTrial(info)
    if (decision.state === 'licensed' || decision.state === 'migration') {
      return { success: true, expiresAt: entitlementExpiresAt(decision) }
    }
    if (decision.reason === 'inconclusive') {
      return { success: false, error: 'Network error' }
    }
    return { success: false, error: decision.reason }
  } catch (err: any) {
    return { success: false, error: err?.message || 'Network error' }
  }
}

/**
 * Check the current trial status from the cloud.
 * @throws Error('NETWORK_ERROR') when the answer is inconclusive (offline / server error).
 *   Returns 'not_found' ONLY when the server confirmed there is no trial row.
 */
export async function checkTrialStatus(_machineId: string): Promise<TrialCheckResult> {
  if (!net.isOnline()) throw inconclusive()

  const decision = await checkLicense()

  // The client already encodes the tri-state. A licensed decision — including offline-grace on a
  // still-valid cached entitlement — keeps the machine running. A migration window also runs.
  if (decision.state === 'licensed' || decision.state === 'migration') {
    return { status: 'active', expiresAt: entitlementExpiresAt(decision) }
  }

  // Locked. Only a DEFINITIVE answer may lock: an inconclusive lock (server unreachable/unverifiable
  // AND no valid cache) must NOT be mistaken for revocation, so surface it as inconclusive → throw.
  if (decision.reason === 'inconclusive') throw inconclusive()

  // Definitive revoked / expired / not_found / migration_expired / invalid / replay → lock.
  return { status: 'expired', expiresAt: entitlementExpiresAt(decision) }
}

/**
 * Check if this machine has a full license granted via admin dashboard.
 * @throws Error('NETWORK_ERROR') when the answer is inconclusive.
 *   NEVER returns false because the network was down — callers revoke licenses on `false`.
 */
export async function checkCloudActivation(_machineId: string): Promise<boolean> {
  if (!net.isOnline()) throw inconclusive()

  const decision = await checkLicense()
  if (decision.state === 'licensed') {
    // A non-trial plan is a full (admin-granted / paid) license.
    return decision.entitlement?.plan != null && decision.entitlement.plan !== 'trial'
  }
  if (decision.state === 'migration') return true
  if (decision.reason === 'inconclusive') throw inconclusive()
  return false
}

/** Record that this machine has been fully activated (fire-and-forget). */
export async function recordActivation(machineId: string): Promise<void> {
  try {
    const supabase = getClient()
    // Ensure installation row
    await supabase.from('installations').upsert(
      { machine_id: machineId, updated_at: new Date().toISOString() },
      { onConflict: 'machine_id' }
    )
    await supabase.from('activations').upsert(
      { machine_id: machineId },
      { onConflict: 'machine_id' }
    )
  } catch {
    // Silently ignore
  }
}

/**
 * Validate a support-generated reset code from the cloud.
 * If valid, marks it as used so it can't be reused.
 */
export async function validateCloudResetCode(
  machineId: string,
  code: string
): Promise<{ valid: boolean }> {
  try {
    const supabase = getClient()
    const upperCode = code.toUpperCase().trim()

    const { data, error } = await supabase
      .from('reset_codes')
      .select('id, used, expires_at')
      .eq('machine_id', machineId)
      .eq('code', upperCode)
      .eq('used', false)
      .single()

    if (error || !data) {
      return { valid: false }
    }

    // Check expiry
    if (new Date(data.expires_at) < new Date()) {
      return { valid: false }
    }

    // Mark as used
    await supabase.from('reset_codes').update({ used: true }).eq('id', data.id)

    return { valid: true }
  } catch {
    return { valid: false }
  }
}
