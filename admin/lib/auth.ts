import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'

const COOKIE_NAME = 'ffm_admin_session'
const ADMIN_ISSUER = 'fast-food-manager-admin'
const ADMIN_AUDIENCE = 'fast-food-manager-admin-portal'
const OWNER_ISSUER = 'fast-food-manager-owner'
const OWNER_AUDIENCE = 'fast-food-manager-owner-dashboard'

function adminSecret(): Uint8Array {
  const value = process.env.SESSION_SECRET
  if (!value || value.length < 32) throw new Error('SESSION_SECRET must contain at least 32 characters')
  return new TextEncoder().encode(value)
}

/**
 * Owner tokens deliberately use a different signing key. Falling back to a domain-separated
 * derivation preserves existing deployments while preventing an owner JWT from being replayed
 * under the `ffm_admin_session` cookie name.
 */
function ownerSecret(): Uint8Array {
  const admin = process.env.SESSION_SECRET
  if (!admin || admin.length < 32) throw new Error('SESSION_SECRET must contain at least 32 characters')
  const value = process.env.OWNER_SESSION_SECRET || `${admin}:owner-session:v1`
  return new TextEncoder().encode(value)
}

export async function createSession(): Promise<string> {
  const token = await new SignJWT({ admin: true })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(ADMIN_ISSUER)
    .setAudience(ADMIN_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(adminSecret())
  return token
}

export async function verifySession(token: string): Promise<boolean> {
  try {
    const { payload } = await jwtVerify(token, adminSecret(), {
      issuer: ADMIN_ISSUER,
      audience: ADMIN_AUDIENCE
    })
    return payload.admin === true
  } catch {
    return false
  }
}

export async function getSessionToken(): Promise<string | undefined> {
  const cookieStore = await cookies()
  return cookieStore.get(COOKIE_NAME)?.value
}

// ── Owner (restaurant) session ────────────────────────────────────────────────
//
// The owner dashboard asks for a PIN, but the PIN only ever gated the React screen: it set a
// localStorage flag, while /api/owner/* accepted a bare `machineId` and answered with the
// restaurant's orders and revenue using the SERVICE-ROLE Supabase client. machineId is not a
// secret — it is printed inside every public /tv/<machineId> and /r/<machineId> URL — so anyone
// who saw the TV link could read the day's takings.
//
// verify-pin now mints this signed, HttpOnly cookie bound to one machineId, and each owner API
// requires it.
const OWNER_COOKIE_PREFIX = 'ffm_owner_session_'

/** Cookie name for a specific restaurant, so one browser can hold sessions for several. */
export function ownerCookieName(machineId: string): string {
  return OWNER_COOKIE_PREFIX + machineId.replace(/[^A-Za-z0-9_-]/g, '')
}

export async function createOwnerSession(machineId: string): Promise<string> {
  return new SignJWT({ owner: true, mid: machineId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(OWNER_ISSUER)
    .setAudience(OWNER_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime('24h')
    .sign(ownerSecret())
}

/** True only for a valid, unexpired token issued for exactly this machineId. */
export async function verifyOwnerSession(token: string | undefined, machineId: string): Promise<boolean> {
  if (!token || !machineId) return false
  try {
    const { payload } = await jwtVerify(token, ownerSecret(), {
      issuer: OWNER_ISSUER,
      audience: OWNER_AUDIENCE
    })
    return payload.owner === true && payload.mid === machineId
  } catch {
    return false
  }
}

/** Read the owner token for `machineId` from the request's cookies. */
export async function getOwnerSessionToken(machineId: string): Promise<string | undefined> {
  const cookieStore = await cookies()
  return cookieStore.get(ownerCookieName(machineId))?.value
}

export { COOKIE_NAME }
