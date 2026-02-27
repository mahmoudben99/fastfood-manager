import { createClient } from '@supabase/supabase-js'

// ─── FILL IN YOUR SUPABASE CREDENTIALS ───────────────────────────────────────
// These are the "Project URL" and "anon/public" key from Supabase → Settings → API.
// The anon key is safe to be in the source — RLS policies enforce data security.
const SUPABASE_URL = 'REPLACE_WITH_SUPABASE_URL'
const SUPABASE_ANON_KEY = 'REPLACE_WITH_SUPABASE_ANON_KEY'
// ─────────────────────────────────────────────────────────────────────────────

const TRIAL_DAYS = 7

let _client: ReturnType<typeof createClient> | null = null

function getClient() {
  if (!_client) {
    _client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  }
  return _client
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
        // Already has a trial — fetch existing
        const existing = await checkTrialStatus(machineId)
        return {
          success: false,
          error: 'trial_exists',
          expiresAt: existing.expiresAt
        }
      }
      return { success: false, error: error.message }
    }

    return { success: true, expiresAt }
  } catch (err: any) {
    return { success: false, error: err?.message || 'Network error' }
  }
}

/** Check the current trial status from the cloud. */
export async function checkTrialStatus(machineId: string): Promise<TrialCheckResult> {
  try {
    const supabase = getClient()
    const { data, error } = await supabase
      .from('trials')
      .select('status, expires_at, paused_remaining_ms')
      .eq('machine_id', machineId)
      .single()

    if (error || !data) {
      return { status: 'not_found' }
    }

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
  } catch {
    // Network error — caller handles this case (offline timer)
    throw new Error('NETWORK_ERROR')
  }
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
