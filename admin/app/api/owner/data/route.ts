import { createOwnerAuthSupabase, createOwnerDataHandler } from '@/lib/owner-auth'
import { getOwnerSessionToken, verifyOwnerSession } from '@/lib/auth'

// Frozen seam (admin/tests/auth/auth.contract.d.ts): the acceptance tests import this factory
// directly and inject a mocked OwnerAuthSupabase.
export { createOwnerDataHandler }

// machineId is NOT a credential — it is embedded in the public /tv/<id> and /r/<id> URLs. This
// route requires the signed owner session cookie minted by /api/owner/verify-pin, fails closed
// with `setup_required` until an owner credential exists for the machine, and on a Supabase
// error answers 503 {stale:true,...} rather than a fabricated zero-orders snapshot.
// createOwnerDataHandler shares OwnerRouteDependencies with the credential-verifying handler
// (frozen by auth.contract.d.ts), but this GET route never logs anyone in — the login-only
// fields below (appOrigin/compareCredential/createOwnerSession/ownerCookieName) are inert here.
export const GET = createOwnerDataHandler({
  appOrigin: process.env.APP_ORIGIN || process.env.NEXT_PUBLIC_APP_URL || '',
  supabase: createOwnerAuthSupabase(),
  now: () => new Date(),
  compareCredential: () => false,
  createOwnerSession: async (machineId: string) => machineId,
  ownerCookieName: () => '',
  getOwnerSessionToken,
  verifyOwnerSession
})
