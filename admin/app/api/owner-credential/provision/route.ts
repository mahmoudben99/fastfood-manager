import bcrypt from 'bcryptjs'
import { verifyDeviceAccessToken } from '@/lib/device-token'
import { createProvisionOwnerCredentialHandler } from './_handler'

/**
 * WP-4a — POST /api/owner-credential/provision
 *   Authorization: Bearer <device access token>
 *   body: { machineId, credential }   // credential = plaintext, 8..256 chars
 *   → { ok: true }                    // credential/hash is NEVER echoed back
 *
 * Only exports the route handler (Next constraint); the injectable core is in ./_handler.ts.
 * The device token (verified against the baked k1 pubkey and bound to machineId) is the sole auth —
 * a machineId alone is public and can never provision a credential for another shop. Fails CLOSED.
 */

const BCRYPT_COST = 12

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
  })
}

let productionHandler: ((request: Request) => Promise<Response>) | null = null

export async function POST(request: Request): Promise<Response> {
  if (!productionHandler) {
    const supa = await import('@/lib/supabase')
    if (!supa.isConfigured) return jsonResponse({ error: 'db_failure' }, 503)
    const { createOwnerAuthSupabase } = await import('@/lib/owner-auth')
    const adapter = createOwnerAuthSupabase()
    productionHandler = createProvisionOwnerCredentialHandler({
      verify: (authorizationHeader, machineId) => verifyDeviceAccessToken(authorizationHeader, machineId),
      hashCredential: (credential) => bcrypt.hash(credential, BCRYPT_COST),
      setOwnerCredential: (machineId, credentialHash) => adapter.setOwnerCredential!(machineId, credentialHash)
    })
  }
  return productionHandler(request)
}
