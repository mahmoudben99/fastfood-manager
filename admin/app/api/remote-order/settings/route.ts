/**
 * WP-G — Per-restaurant remote-ordering flag endpoint (red-team finding #5).
 *
 * GET  /api/remote-order/settings?machineId=ABC123      → { enabled }
 * POST /api/remote-order/settings { machineId, enabled } → { ok, enabled }
 *
 * The underlying RPCs (remote_order_get_enabled / remote_order_set_enabled) are
 * service_role-only; machine_ids are public identifiers (QR/owner/TV URLs) and
 * must never gate a mutation by themselves. Access here requires the WP-D device
 * access token bound to the SAME machineId.
 *
 * FAIL CLOSED: until WP-D integration wires real Ed25519 verification below, every
 * request is denied with 401. Never allow-by-default.
 */

interface DeviceAuthResult {
  ok: boolean
  reason: string
}

const MACHINE_ID_RE = /^[A-Z0-9]{6,64}$/

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
  })
}

/**
 * TODO(WP-D integration): verify device access token.
 * Required checks when wiring (CONTRACT §1.3):
 *   - `Authorization: Bearer <payload.sig>` present
 *   - Ed25519 signature valid against the baked [current, previous] pubkeys (kid select)
 *   - claims: typ === 'access', exp > now, mid === machineId (uppercased)
 *   - st ∈ {active, trial}
 * Until then this DENIES EVERYTHING — the endpoint fails closed by design.
 */
function verifyDeviceAccessToken(_request: Request, _machineId: string): DeviceAuthResult {
  return { ok: false, reason: 'device_token_verification_not_integrated' }
}

async function getServiceClient(): Promise<any | null> {
  try {
    const mod = await import('../../../../lib/supabase')
    return mod.isConfigured ? mod.supabase : null
  } catch {
    return null
  }
}

function parseMachineId(raw: unknown): string | null {
  const machineId = typeof raw === 'string' ? raw.trim().toUpperCase() : ''
  return MACHINE_ID_RE.test(machineId) ? machineId : null
}

export async function GET(request: Request): Promise<Response> {
  let machineIdRaw: string | null = null
  try {
    machineIdRaw = new URL(request.url).searchParams.get('machineId')
  } catch {
    machineIdRaw = null
  }
  const machineId = parseMachineId(machineIdRaw)
  if (!machineId) return jsonResponse({ error: 'bad_input', field: 'machineId' }, 400)

  const auth = verifyDeviceAccessToken(request, machineId)
  if (!auth.ok) return jsonResponse({ error: 'unauthorized' }, 401)

  const supabase = await getServiceClient()
  if (!supabase) return jsonResponse({ error: 'db_failure' }, 503)
  const { data, error } = await supabase.rpc('remote_order_get_enabled', {
    p_machine_id: machineId
  })
  if (error) return jsonResponse({ error: 'db_failure' }, 503)
  return jsonResponse({ enabled: data === true }, 200)
}

export async function POST(request: Request): Promise<Response> {
  let body: any
  try {
    body = await request.json()
  } catch {
    return jsonResponse({ error: 'bad_input', field: 'body' }, 400)
  }
  const machineId = parseMachineId(body?.machineId)
  if (!machineId) return jsonResponse({ error: 'bad_input', field: 'machineId' }, 400)
  if (typeof body?.enabled !== 'boolean') {
    return jsonResponse({ error: 'bad_input', field: 'enabled' }, 400)
  }

  const auth = verifyDeviceAccessToken(request, machineId)
  if (!auth.ok) return jsonResponse({ error: 'unauthorized' }, 401)

  const supabase = await getServiceClient()
  if (!supabase) return jsonResponse({ error: 'db_failure' }, 503)
  const { error } = await supabase.rpc('remote_order_set_enabled', {
    p_machine_id: machineId,
    p_enabled: body.enabled
  })
  if (error) return jsonResponse({ error: 'db_failure' }, 503)
  return jsonResponse({ ok: true, enabled: body.enabled }, 200)
}
