import { createPublicKey, verify as edVerify, type KeyObject } from 'node:crypto'

/**
 * WP-4a — Device access-token verification (CONTRACT §1.3).
 *
 * The desktop license client (WP-D) obtains a short-lived (~1h) Ed25519 ACCESS token from the
 * deployed license server on every successful `/v1/license/check`. That token is the ONLY thing
 * that authorises a desktop → admin mutation (enabling remote ordering, provisioning the owner
 * dashboard credential): a bare machineId can never gate a mutation because machineIds are public
 * (they travel in every /r/<id>, /tv/<id> and owner URL).
 *
 * Wire format: `payloadB64url.sigB64url` where payload is the UTF-8 JSON of the claims
 *   { v, kid:'k1', typ:'access', mid, plan, st, rev, iat, exp }
 * and sig is the raw Ed25519 signature over the payload BYTES.
 *
 * This module verifies that artifact against the BAKED k1 public key and fails CLOSED on anything
 * that is not a currently-valid access token bound to the expected machine. It is intentionally
 * self-contained (only node:crypto) so the frozen route tests and the new device-token tests can
 * exercise it without a Supabase project, a Next server, or the network.
 */

// DER SPKI header for an Ed25519 public key; prepended to the raw 32 bytes to build a KeyObject.
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex')

// The baked k1 public key (raw 32-byte Ed25519 key, base64url, no padding) — the SAME key the
// desktop bakes in src/main/activation/license-keys.ts. Overridable via env for key rotation, but
// it defaults to the live production key so the endpoint verifies correctly with no configuration.
const DEFAULT_K1_PUBLIC_KEY = 'n5iperrudd9ibATzrDltSq4ZeuX8ok33etbDxpcsR-0'
const K1_KID = 'k1'

// A few seconds of clock skew between the admin server and the license server is tolerated so a
// token that has just reached its exp is not spuriously rejected; anything older still fails.
const CLOCK_SKEW_SECONDS = 60

export type DeviceTokenResult =
  | { ok: true; mid: string; plan: string | null; st: string }
  | { ok: false; reason: string }

export interface VerifyDeviceTokenOptions {
  /** Override current time (unix ms) for deterministic tests. Defaults to Date.now(). */
  now?: () => number
  /** Override the baked k1 public key (base64url raw 32 bytes). Defaults to env or DEFAULT. */
  publicKeyK1?: string
}

let cachedKey: { source: string; key: KeyObject | null } | null = null

/** Build (and memoise) the k1 KeyObject from the configured raw public key. Null when unusable. */
function loadK1Key(override?: string): KeyObject | null {
  const source = override ?? process.env.LICENSE_PUBLIC_KEY_K1 ?? DEFAULT_K1_PUBLIC_KEY
  if (cachedKey && cachedKey.source === source) return cachedKey.key
  let key: KeyObject | null = null
  try {
    const raw = Buffer.from(source, 'base64url')
    if (raw.length === 32) {
      key = createPublicKey({
        key: Buffer.concat([ED25519_SPKI_PREFIX, raw]),
        format: 'der',
        type: 'spki'
      })
    }
  } catch {
    key = null
  }
  cachedKey = { source, key }
  return key
}

function fail(reason: string): DeviceTokenResult {
  return { ok: false, reason }
}

/**
 * Verify a `Authorization: Bearer <payload.sig>` device access token.
 *
 * @param authorizationHeader the raw Authorization header value (or null/undefined if absent)
 * @param expectedMachineId   when provided, the token's `mid` MUST equal it (case-insensitive)
 * @returns {ok:true, mid, plan, st} on a valid, unexpired, k1-signed access token; else {ok:false, reason}
 */
export function verifyDeviceAccessToken(
  authorizationHeader: string | null | undefined,
  expectedMachineId?: string,
  options: VerifyDeviceTokenOptions = {}
): DeviceTokenResult {
  const nowSec = Math.floor((options.now ? options.now() : Date.now()) / 1000)

  if (typeof authorizationHeader !== 'string' || authorizationHeader.length === 0) {
    return fail('missing_authorization')
  }
  const match = /^Bearer\s+(.+)$/i.exec(authorizationHeader.trim())
  if (!match) return fail('bad_authorization_scheme')
  const artifact = match[1].trim()

  const parts = artifact.split('.')
  if (parts.length !== 2 || parts[0].length === 0 || parts[1].length === 0) {
    return fail('malformed_token')
  }

  let payload: Buffer
  let signature: Buffer
  let claims: Record<string, unknown>
  try {
    payload = Buffer.from(parts[0], 'base64url')
    signature = Buffer.from(parts[1], 'base64url')
    const parsed: unknown = JSON.parse(payload.toString('utf8'))
    if (!parsed || typeof parsed !== 'object') return fail('malformed_token')
    claims = parsed as Record<string, unknown>
  } catch {
    return fail('malformed_token')
  }

  // kid selection: only k1 is baked. An unknown kid is a verification failure, never trusted.
  if (claims.kid !== K1_KID) return fail('unknown_kid')

  const key = loadK1Key(options.publicKeyK1)
  if (!key) return fail('key_config_error') // misconfigured/rotated-away key → fail closed

  // Verify the Ed25519 signature over the payload BYTES before trusting any claim.
  let signatureValid = false
  try {
    signatureValid = edVerify(null, payload, key, signature)
  } catch {
    signatureValid = false
  }
  if (!signatureValid) return fail('bad_signature')

  // Signature is valid — now enforce the claim rules. Fail closed on any deviation.
  if (claims.typ !== 'access') return fail('wrong_typ')

  const mid = claims.mid
  if (typeof mid !== 'string' || mid.length === 0) return fail('malformed_token')

  const exp = claims.exp
  if (typeof exp !== 'number' || !Number.isFinite(exp)) return fail('malformed_token')
  if (nowSec >= exp + CLOCK_SKEW_SECONDS) return fail('expired')

  if (expectedMachineId !== undefined && mid.toUpperCase() !== expectedMachineId.toUpperCase()) {
    return fail('machine_mismatch')
  }

  const plan = typeof claims.plan === 'string' ? claims.plan : null
  const st = typeof claims.st === 'string' ? claims.st : ''
  return { ok: true, mid, plan, st }
}
