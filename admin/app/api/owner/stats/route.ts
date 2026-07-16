import { createOwnerAuthSupabase, createOwnerStatsHandler } from '@/lib/owner-auth'
import { getOwnerSessionToken, verifyOwnerSession } from '@/lib/auth'

// Frozen seam (admin/tests/auth/auth.contract.d.ts): the acceptance tests import this factory
// directly and inject a mocked OwnerAuthSupabase.
export { createOwnerStatsHandler }

// See app/api/owner/data/route.ts: machineId is public, so the signed owner session is the real
// credential. A Supabase error answers 503 {stale:true,...} instead of an empty `{days: []}`.
//
// createOwnerStatsHandler shares OwnerRouteDependencies with the credential-verifying handler
// (frozen by auth.contract.d.ts); the login-only fields below are inert on this GET route.
export const GET = createOwnerStatsHandler({
  appOrigin: process.env.APP_ORIGIN || process.env.NEXT_PUBLIC_APP_URL || '',
  supabase: createOwnerAuthSupabase(),
  now: () => new Date(),
  compareCredential: () => false,
  createOwnerSession: async (machineId: string) => machineId,
  ownerCookieName: () => '',
  getOwnerSessionToken,
  verifyOwnerSession
})
