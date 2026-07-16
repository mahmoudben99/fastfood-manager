import { SignJWT, jwtVerify, errors as joseErrors } from 'jose'
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
 *
 * A *set* `OWNER_SESSION_SECRET` must clear the same 32-char floor as `SESSION_SECRET` — an
 * override that is merely "defined" but short/weak would otherwise be an offline-forgeable
 * signing key, silently weaker than the derived default it was meant to strengthen.
 */
function ownerSecret(): Uint8Array {
  const admin = process.env.SESSION_SECRET
  if (!admin || admin.length < 32) throw new Error('SESSION_SECRET must contain at least 32 characters')
  const override = process.env.OWNER_SESSION_SECRET
  if (override !== undefined && override.length < 32) {
    throw new Error('OWNER_SESSION_SECRET must contain at least 32 characters')
  }
  const value = override || `${admin}:owner-session:v1`
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

/**
 * `credentialVersion`, when supplied, is stamped into the token as `cv` (opaque to this module —
 * callers use the owner credential row's `updated_at`). It lets a caller detect and reject a
 * session that predates a credential reset (see `SessionCheck.credentialVersion` below) even
 * though the JWT itself is still cryptographically valid and unexpired: a stolen/leaked session
 * cookie must not keep working forever just because its 24h TTL hasn't elapsed yet.
 */
export async function createOwnerSession(machineId: string, credentialVersion?: string): Promise<string> {
  return new SignJWT({ owner: true, mid: machineId, ...(credentialVersion ? { cv: credentialVersion } : {}) })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(OWNER_ISSUER)
    .setAudience(OWNER_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime('24h')
    .sign(ownerSecret())
}

/** Structured result of validating an owner session token against one machineId. */
export type SessionCheck =
  | { ok: true; machineId: string; credentialVersion?: string }
  | { ok: false; reason: 'missing' | 'expired' | 'invalid' | 'wrong_machine' }

/**
 * Validates an owner session token for exactly one machineId, distinguishing why a token was
 * rejected. `wrong_machine` fires only for a token that is otherwise cryptographically valid but
 * was issued for a different machine — e.g. a stolen/replayed cookie sent to the wrong dashboard.
 *
 * Returns whatever `cv` (credential version) the token was minted with, if any, so a caller that
 * also knows the CURRENT credential row's version can reject a still-unexpired token that was
 * issued before the credential was reset (this function alone is deliberately kept pure/offline —
 * it does no Supabase I/O — so that comparison happens one layer up, in owner-auth.ts).
 */
export async function verifyOwnerSession(token: string | undefined, machineId: string): Promise<SessionCheck> {
  if (!token) return { ok: false, reason: 'missing' }
  try {
    const { payload } = await jwtVerify(token, ownerSecret(), {
      issuer: OWNER_ISSUER,
      audience: OWNER_AUDIENCE
    })
    if (payload.owner !== true) return { ok: false, reason: 'invalid' }
    if (payload.mid !== machineId) return { ok: false, reason: 'wrong_machine' }
    return { ok: true, machineId, credentialVersion: typeof payload.cv === 'string' ? payload.cv : undefined }
  } catch (err) {
    if (err instanceof joseErrors.JWTExpired) return { ok: false, reason: 'expired' }
    return { ok: false, reason: 'invalid' }
  }
}

/**
 * Read the owner token for `machineId` directly off an incoming Request's `Cookie` header. Route
 * handlers receive a bare `Request` (not the `next/headers` request-context helper), and the
 * frozen auth test seam (admin/tests/auth/auth.contract.d.ts) requires this exact signature so
 * the handler factories are callable without a Next server.
 */
export function getOwnerSessionToken(request: Request, machineId: string): string | undefined {
  const header = request.headers.get('cookie')
  if (!header) return undefined
  const target = ownerCookieName(machineId)
  for (const part of header.split(';')) {
    const eq = part.indexOf('=')
    if (eq === -1) continue
    const name = part.slice(0, eq).trim()
    if (name === target) return decodeURIComponent(part.slice(eq + 1).trim())
  }
  return undefined
}

export { COOKIE_NAME }
