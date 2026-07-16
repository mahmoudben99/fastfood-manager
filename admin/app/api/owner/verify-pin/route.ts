import bcrypt from 'bcryptjs'
import { createOwnerAuthSupabase, createVerifyOwnerCredentialHandler } from '@/lib/owner-auth'
import { createOwnerSession, ownerCookieName, getOwnerSessionToken, verifyOwnerSession } from '@/lib/auth'

// Frozen seam (admin/tests/auth/auth.contract.d.ts): the acceptance tests import this factory
// directly and inject a mocked OwnerAuthSupabase, so they can exercise the real route logic
// without a Next server, Supabase project, or network access.
export { createVerifyOwnerCredentialHandler }

// This endpoint used to accept a bare 4-digit tablet PIN and compare it against `owner_pins`.
// machineId is public (it appears in every /tv/<id> and /r/<id> URL), so that PIN was the only
// thing standing between anyone with the link and the restaurant's live revenue. It is now a
// separate, longer, bcrypt-hashed remote-owner credential (`owner_credentials`, admin-resettable
// via /api/owner-credential) with durable per-machine + per-IP brute-force throttling
// (admin/lib/rate-limit.ts) — there is no fallback to the old PIN.
//
// The factory takes a static `appOrigin`, so it is (re)built per request with the origin derived
// from the request's own URL — see app/api/login/route.ts for why this avoids a separate
// "trusted origin" env var.
export async function POST(request: Request): Promise<Response> {
  const handler = createVerifyOwnerCredentialHandler({
    appOrigin: new URL(request.url).origin,
    supabase: createOwnerAuthSupabase(),
    now: () => new Date(),
    compareCredential: (credential, hash) => bcrypt.compare(credential, hash),
    createOwnerSession,
    ownerCookieName,
    getOwnerSessionToken,
    verifyOwnerSession
  })
  return handler(request)
}
