import type { DeviceTokenResult } from '@/lib/device-token'

/**
 * WP-4a — Owner-dashboard credential provisioning core (findings #2/#5).
 *
 * The pure, dependency-injected handler factory lives here (a `_handler.ts` sibling, mirroring the
 * remote-order route convention) so Next's route-export constraint on `route.ts` is satisfied and
 * the acceptance tests can drive it with injected deps.
 *
 * This is the missing bridge that makes the remote owner dashboard reachable: WP-E's owner auth
 * reads ONLY `owner_credentials`, but nothing provisioned that table from the desktop. Here the
 * desktop — authenticated by its WP-D device ACCESS token (not a session cookie, not a bare
 * machineId) — pushes the owner's chosen dashboard credential; it is bcrypt-hashed SERVER-side and
 * upserted into `owner_credentials`. The credential/hash is NEVER echoed back.
 */

const MACHINE_ID_RE = /^[A-Z0-9]{6,64}$/
export const MIN_CREDENTIAL_LENGTH = 8
export const MAX_CREDENTIAL_LENGTH = 256

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
  })
}

function parseMachineId(raw: unknown): string | null {
  const machineId = typeof raw === 'string' ? raw.trim().toUpperCase() : ''
  return MACHINE_ID_RE.test(machineId) ? machineId : null
}

export interface ProvisionOwnerCredentialDeps {
  /** Verify the Authorization header binds to machineId (the real Ed25519 helper in production). */
  verify: (authorizationHeader: string | null, machineId: string) => DeviceTokenResult
  /** bcrypt-hash the plaintext credential (server-side only). */
  hashCredential: (credential: string) => Promise<string>
  /** Durable upsert into owner_credentials(machine_id, credential_hash, updated_at). */
  setOwnerCredential: (machineId: string, credentialHash: string) => Promise<void>
}

export function createProvisionOwnerCredentialHandler(deps: ProvisionOwnerCredentialDeps) {
  return async (request: Request): Promise<Response> => {
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return jsonResponse({ error: 'bad_input', field: 'body' }, 400)
    }
    const record = (body ?? {}) as Record<string, unknown>

    const machineId = parseMachineId(record.machineId)
    if (!machineId) return jsonResponse({ error: 'bad_input', field: 'machineId' }, 400)

    // Authenticate BEFORE reading/validating the credential or touching storage. A bare machineId —
    // which is public — never provisions anything; only a token bound to THIS machine does.
    const auth = deps.verify(request.headers.get('authorization'), machineId)
    if (!auth.ok) return jsonResponse({ error: 'unauthorized' }, 401)

    const credential = typeof record.credential === 'string' ? record.credential : ''
    if (credential.length < MIN_CREDENTIAL_LENGTH || credential.length > MAX_CREDENTIAL_LENGTH) {
      return jsonResponse({ error: 'invalid_credential' }, 400)
    }

    let credentialHash: string
    try {
      credentialHash = await deps.hashCredential(credential)
    } catch {
      return jsonResponse({ error: 'provision_failed' }, 503)
    }

    try {
      // Bind to machineId, which equals the token's mid (the verify above rejects any mismatch).
      await deps.setOwnerCredential(machineId, credentialHash)
    } catch {
      // A write error must fail CLOSED (503) — never report success on a credential that didn't land.
      return jsonResponse({ error: 'provision_failed' }, 503)
    }

    return jsonResponse({ ok: true }, 200)
  }
}
