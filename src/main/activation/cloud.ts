import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { net } from 'electron'

const SUPABASE_URL = 'https://ijdiiixkemrmkhhkbcng.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_xmW71xs0XzNYbTEwnmbLCA_ZmphJkIV'

const TRIAL_DAYS = 7

let _client: SupabaseClient<any, any, any> | null = null

export function getClient(): SupabaseClient<any, any, any> {
  if (!_client) {
    _client = createClient<any, any, any>(SUPABASE_URL, SUPABASE_ANON_KEY)
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

/** Start a 7-day free trial for this machine. Fails silently if already exists. */
export async function startTrial(
  machineId: string
): Promise<{ success: boolean; expiresAt?: string; error?: string }> {
  try {
    const supabase = getClient()

    // First ensure the installation row exists
    await supabase.from('installations').upsert(
      { machine_id: machineId, updated_at: new Date().toISOString() },
      { onConflict: 'machine_id' }
    )

    const expiresAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString()

    const { error } = await supabase.from('trials').insert({
      machine_id: machineId,
      expires_at: expiresAt,
      status: 'active'
    })

    if (error) {
      if (error.code === '23505') {
        // Already has a trial — fetch existing. checkTrialStatus now throws when it can't get a
        // definitive answer, so guard it: we still know the trial exists from the 23505 conflict.
        let expiresAt: string | undefined
        try { expiresAt = (await checkTrialStatus(machineId)).expiresAt } catch { /* inconclusive */ }
        return { success: false, error: 'trial_exists', expiresAt }
      }
      return { success: false, error: error.message }
    }

    return { success: true, expiresAt }
  } catch (err: any) {
    return { success: false, error: err?.message || 'Network error' }
  }
}

/**
 * Check the current trial status from the cloud.
 * @throws Error('NETWORK_ERROR') when the answer is inconclusive (offline / server error).
 *   Returns 'not_found' ONLY when the server confirmed there is no trial row.
 */
export async function checkTrialStatus(machineId: string): Promise<TrialCheckResult> {
  if (!net.isOnline()) throw inconclusive()

  let data: any, error: any
  try {
    // maybeSingle(): zero rows is a real answer (data=null, error=null), not an error.
    ;({ data, error } = await getClient()
      .from('trials')
      .select('status, expires_at, paused_remaining_ms')
      .eq('machine_id', machineId)
      .maybeSingle())
  } catch {
    throw inconclusive()
  }

  // Any error at all (transport, RLS, 5xx) means we did not get a trustworthy answer.
  if (error) throw inconclusive()
  if (!data) return { status: 'not_found' }

  // If status is 'active', double-check the expiry server-side
  if (data.status === 'active' && data.expires_at) {
    const expiresAt = new Date(data.expires_at)
    if (expiresAt < new Date()) {
      // Expired but status not yet updated — treat as expired
      return { status: 'expired', expiresAt: data.expires_at }
    }
  }

  return {
    status: data.status as TrialStatus,
    expiresAt: data.expires_at || undefined,
    pausedRemainingMs: data.paused_remaining_ms || undefined
  }
}

/**
 * Check if this machine has a full license granted via admin dashboard.
 * @throws Error('NETWORK_ERROR') when the answer is inconclusive.
 *   NEVER returns false because the network was down — callers revoke licenses on `false`.
 */
export async function checkCloudActivation(machineId: string): Promise<boolean> {
  if (!net.isOnline()) throw inconclusive()

  let data: any, error: any
  try {
    ;({ data, error } = await getClient()
      .from('activations')
      .select('machine_id')
      .eq('machine_id', machineId)
      .maybeSingle())
  } catch {
    throw inconclusive()
  }

  if (error) throw inconclusive()
  return !!data
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
