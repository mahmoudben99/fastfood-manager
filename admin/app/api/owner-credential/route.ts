import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { getSessionToken, verifySession } from '@/lib/auth'
import { createOwnerAuthSupabase, isSameOriginRequest, MIN_CREDENTIAL_LENGTH } from '@/lib/owner-auth'

const MAX_CREDENTIAL_LENGTH = 256
const BCRYPT_COST = 12

/**
 * Admin-only endpoint to set or reset a restaurant's remote-owner credential
 * (`owner_credentials`, see supabase/migrations/0005_owner_auth.sql). This is the sole way to
 * provision/rotate that credential — there is no self-serve "forgot password" for it, and no
 * fallback to the retired tablet PIN.
 *
 * Not part of the frozen owner-admin-auth acceptance suite (see admin/tests/README.md: "the
 * brief also names no admin credential-reset endpoint"), so this route composes the same
 * building blocks (admin/lib/auth.ts session check, admin/lib/owner-auth.ts CSRF + Supabase
 * adapter) that ARE frozen, rather than introducing new ones.
 *
 * `admin/middleware.ts` already requires a valid admin session for this path (it is deliberately
 * NOT in the owner/tv/remote-order public bypass list); the check below is defense in depth in
 * case that ever changes.
 */
export async function POST(request: Request): Promise<Response> {
  const appOrigin = new URL(request.url).origin
  if (!isSameOriginRequest(request, appOrigin)) {
    return NextResponse.json({ error: 'cross_origin_rejected' }, { status: 403 })
  }

  const token = await getSessionToken()
  if (!token || !(await verifySession(token))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const machineId = typeof (body as Record<string, unknown>)?.machineId === 'string'
    ? ((body as Record<string, unknown>).machineId as string)
    : ''
  const credential = typeof (body as Record<string, unknown>)?.credential === 'string'
    ? ((body as Record<string, unknown>).credential as string)
    : ''

  if (!machineId || credential.length < MIN_CREDENTIAL_LENGTH || credential.length > MAX_CREDENTIAL_LENGTH) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  }

  const credentialHash = await bcrypt.hash(credential, BCRYPT_COST)
  const supabase = createOwnerAuthSupabase()
  try {
    await supabase.setOwnerCredential!(machineId, credentialHash)
  } catch {
    // MEDIUM-3 (security review): the upsert's result must be checked. An admin rotating a
    // compromised credential must never be told it worked when it didn't — the old credential
    // would silently keep working, which is exactly the scenario a reset exists to close.
    return NextResponse.json({ error: 'owner_credential_reset_failed' }, { status: 503 })
  }

  // The credential (and its hash) is never echoed back.
  return NextResponse.json({ ok: true })
}
