import { createPublicKey, verify as edVerify, type KeyObject } from 'node:crypto'
import { performance } from 'node:perf_hooks'

/**
 * Desktop entitlement client (CONTRACT.md §1.3 / §1.4 + ADDENDUM #9/#10).
 *
 * Threat model this file exists to survive:
 *  - A leaked machine_id (it travels in QR/owner/TV URLs) must never license a device — the device
 *    secret is the only credential, sent solely as `Authorization: Device <secret>` and never logged.
 *  - Network failure / DNS / 5xx is INCONCLUSIVE: it may keep a still-valid cached entitlement alive
 *    (offline grace runs to the signed `exp`) but must NEVER flip a licensed machine to locked, and
 *    must NEVER be mistaken for a revocation.
 *  - A replayed older but signature-valid artifact must not roll a machine back below its monotonic
 *    floor (max verified iat + max verified rev), so it can't un-revoke or resurrect a lapsed plan.
 *  - A definitively revoked/expired signed artifact locks within one check and discards the cache.
 *
 * The exported surface is frozen by test-harness/unit/license-client/license-client.contract.d.ts.
 */

export type LicenseState = 'licensed' | 'locked' | 'migration'
export type LicenseReason =
  | 'valid_entitlement'
  | 'revoked'
  | 'expired'
  | 'not_found'
  | 'migration_expired'
  | 'inconclusive'
  | 'invalid_entitlement'
  | 'replay'

export interface EntitlementClaims {
  v: 1
  kid: string
  typ: 'entitlement'
  mid: string
  st: 'active' | 'trial' | 'expired' | 'revoked'
  plan: 'trial' | 'monthly' | 'yearly' | 'lifetime' | null
  sub: string | null
  rev: number
  name: string | null
  iat: number
  exp: number
}

export interface LicenseDecision {
  state: LicenseState
  reason: LicenseReason
  entitlement?: EntitlementClaims
  machineIdMismatch: boolean
  deviceSecretStorageFallback: boolean
}

export interface Key {
  kid: string
  /** raw 32-byte Ed25519 public key, base64url */
  pub: string
}

export interface KeyValueStorage {
  get(key: string): string | undefined
  set(key: string, value: string): void
  delete(key: string): void
}

export interface DeviceSecretStorage {
  load(): string | undefined
  save(secret: string): void
  clear(): void
  readonly fallback: boolean
}

export interface Clock {
  now(): number
}

export interface LicenseClientOptions {
  licenseServerUrl: string
  appVersion: string
  publicKeys: readonly Key[]
  storage: KeyValueStorage
  deviceSecretStorage: DeviceSecretStorage
  clock: Clock
  recomputeMachineId(): string
  fetch?: typeof fetch
  log?(message: string): void
  legacySerialIsValid?(): boolean
}

export interface LicenseClient {
  check(): Promise<LicenseDecision>
  startTrial(input: { restaurantName?: string; phone?: string }): Promise<LicenseDecision>
  diagnostics(): Pick<LicenseDecision, 'machineIdMismatch' | 'deviceSecretStorageFallback'>
}

// Storage keys (all namespaced under license_*; activation_* are pre-existing legacy keys).
const K_MACHINE_ID = 'machine_id'
const K_FLOOR_IAT = 'license_floor_iat'
const K_FLOOR_REV = 'license_floor_rev'
const K_CACHED_ENTITLEMENT = 'license_cached_entitlement'
const K_MIGRATION_STARTED = 'license_migration_started_at'
const K_ACTIVATION_TYPE = 'activation_type'

const MIGRATION_GRACE_DAYS = 7
const DAY_SECONDS = 86_400
const GRACE_MAX_SECONDS = 7 * DAY_SECONDS // hard cap on offline grace, independent of wall-clock jumps
const FETCH_TIMEOUT_MS = 10_000 // a hung request resolves INCONCLUSIVE, never wedges single-in-flight
// A floor beyond these horizons is corruption (probe: floor_iat='9999999999'); it must fail TOWARD
// a still-valid cached entitlement, not lock a paying customer forever via a phantom replay.
const FLOOR_MAX_IAT_SKEW_SECONDS = 400 * DAY_SECONDS
const FLOOR_MAX_REV = 10_000_000

const ST_VALUES = new Set(['active', 'trial', 'expired', 'revoked'])
const PLAN_VALUES = new Set(['trial', 'monthly', 'yearly', 'lifetime'])

// DER SPKI header for an Ed25519 public key; prepended to the raw 32 bytes to build a KeyObject.
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex')

type VerifyResult = { ok: true; claims: EntitlementClaims } | { ok: false }

interface CheckResponseBody {
  entitlement?: unknown
  accessToken?: unknown
  deviceSecret?: unknown
  serverTime?: unknown
}

/** Strict schema gate (M5): anything that is not a well-formed entitlement is untrusted. */
function isWellFormedEntitlement(claims: unknown): claims is EntitlementClaims {
  if (!claims || typeof claims !== 'object') return false
  const c = claims as Record<string, unknown>
  if (c.v !== 1) return false
  if (c.typ !== 'entitlement') return false
  if (typeof c.kid !== 'string' || c.kid.length === 0) return false
  if (typeof c.mid !== 'string' || c.mid.length === 0) return false
  if (typeof c.st !== 'string' || !ST_VALUES.has(c.st)) return false
  if (!(c.plan === null || (typeof c.plan === 'string' && PLAN_VALUES.has(c.plan)))) return false
  if (!Number.isInteger(c.iat) || (c.iat as number) <= 0) return false
  if (!Number.isInteger(c.exp) || (c.exp as number) <= 0) return false
  if (!Number.isInteger(c.rev) || (c.rev as number) < 0) return false
  if (!(c.name === null || typeof c.name === 'string')) return false
  if (!(c.sub === null || (typeof c.sub === 'string' && Number.isFinite(Date.parse(c.sub))))) return false
  return true
}

/** Subscription-until in unix seconds, or null when lifetime/absent. */
function subSeconds(sub: string | null): number | null {
  if (sub === null) return null
  const ms = Date.parse(sub)
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : null
}

export function createLicenseClient(options: LicenseClientOptions): LicenseClient {
  const {
    licenseServerUrl,
    appVersion,
    publicKeys,
    storage,
    deviceSecretStorage,
    clock,
    recomputeMachineId,
    log,
    legacySerialIsValid
  } = options
  const doFetch: typeof fetch = options.fetch ?? globalThis.fetch

  // ── Machine-id pinning: the stored id wins; a recompute mismatch is surfaced, never acted on. ──
  const storedMachineId = storage.get(K_MACHINE_ID)
  const recomputed = safeRecompute()
  let machineId: string
  let machineIdMismatch = false
  if (storedMachineId) {
    machineId = storedMachineId
    machineIdMismatch = recomputed !== undefined && recomputed !== storedMachineId
  } else if (recomputed) {
    machineId = recomputed
    storage.set(K_MACHINE_ID, recomputed)
  } else {
    machineId = ''
  }

  function safeRecompute(): string | undefined {
    try {
      return recomputeMachineId()
    } catch {
      return undefined
    }
  }

  // ── Trusted key set: kid -> KeyObject, built once from the baked raw public keys. ──
  const keys = new Map<string, KeyObject>()
  for (const key of publicKeys) {
    try {
      const raw = Buffer.from(key.pub, 'base64url')
      if (raw.length !== 32) continue
      keys.set(key.kid, createPublicKey({ key: Buffer.concat([ED25519_SPKI_PREFIX, raw]), format: 'der', type: 'spki' }))
    } catch {
      // A malformed baked key is simply unusable; artifacts naming its kid become unverifiable.
    }
  }

  function nowSeconds(): number {
    return Math.floor(clock.now() / 1000)
  }

  // M7: after a real online verify we anchor server-time to a MONOTONIC reading. Offline grace is
  // then measured by monotonic elapsed (clamped to the 7-day cap), so a forward OS-clock jump can't
  // prematurely expire a fresh cached entitlement, and a rollback can't stretch grace within a
  // session. Falls back to wall-clock when nothing has been verified this session (fresh start).
  let sessionAnchor: { serverSec: number; mono: number } | null = null

  function monotonicMs(): number {
    try {
      return performance.now()
    } catch {
      return clock.now()
    }
  }

  function anchorServerTime(serverSec: number): void {
    if (Number.isFinite(serverSec) && serverSec > 0) sessionAnchor = { serverSec, mono: monotonicMs() }
  }

  /** Best estimate of current server time for OFFLINE grace decisions (monotonic when anchored). */
  function graceNowSeconds(): number {
    if (sessionAnchor) {
      const elapsed = Math.max(0, (monotonicMs() - sessionAnchor.mono) / 1000)
      return sessionAnchor.serverSec + Math.min(elapsed, GRACE_MAX_SECONDS)
    }
    return nowSeconds()
  }

  function floorIat(): number {
    const value = Number(storage.get(K_FLOOR_IAT))
    if (!Number.isFinite(value) || value <= 0) return 0
    // M6: an implausibly-future floor is corruption — ignore it (fail toward the cached entitlement).
    if (value > nowSeconds() + FLOOR_MAX_IAT_SKEW_SECONDS) return 0
    return value
  }

  function floorRev(): number {
    const value = Number(storage.get(K_FLOOR_REV))
    if (!Number.isFinite(value) || value < 0) return 0
    if (value > FLOOR_MAX_REV) return 0 // absurd revision = corruption; fail toward the cache
    return value
  }

  function decision(state: LicenseState, reason: LicenseReason, entitlement?: EntitlementClaims): LicenseDecision {
    return { state, reason, entitlement, machineIdMismatch, deviceSecretStorageFallback: deviceSecretStorage.fallback }
  }

  /** Verify wire format `base64url(payloadJSON).base64url(rawSig)` against the trusted key set. */
  function verifyArtifact(artifact: unknown): VerifyResult {
    if (typeof artifact !== 'string') return { ok: false }
    const parts = artifact.split('.')
    if (parts.length !== 2) return { ok: false }
    let payload: Buffer
    let claims: unknown
    try {
      payload = Buffer.from(parts[0], 'base64url')
      claims = JSON.parse(payload.toString('utf8'))
    } catch {
      return { ok: false }
    }
    if (!claims || typeof claims !== 'object') return { ok: false }
    const kid = (claims as { kid?: unknown }).kid
    if (typeof kid !== 'string') return { ok: false }
    const key = keys.get(kid)
    if (!key) return { ok: false } // unknown kid → verification failure (inconclusive, not revocation)
    let signature: Buffer
    try {
      signature = Buffer.from(parts[1], 'base64url')
    } catch {
      return { ok: false }
    }
    try {
      if (!edVerify(null, payload, key, signature)) return { ok: false }
    } catch {
      return { ok: false }
    }
    // M5: a signature-valid but malformed/out-of-enum payload is NOT trustworthy.
    if (!isWellFormedEntitlement(claims)) return { ok: false }
    return { ok: true, claims }
  }

  /**
   * The cached entitlement, re-verified: bound to us, still active/trial, and within BOTH its signed
   * expiry and its subscription window, measured against monotonic grace time and above the floor.
   */
  function validCachedEntitlement(): EntitlementClaims | null {
    const raw = storage.get(K_CACHED_ENTITLEMENT)
    if (!raw) return null
    const verified = verifyArtifact(raw)
    if (!verified.ok) return null
    const claims = verified.claims
    if (claims.mid !== machineId) return null
    if (claims.st !== 'active' && claims.st !== 'trial') return null
    // Hard offline cap: at most GRACE_MAX_SECONDS of MONOTONIC elapsed since the last online verify,
    // independent of the signed exp — so even a (mis)issued long-TTL entitlement can never grant more
    // than 7 days of offline runtime within a session.
    if (sessionAnchor) {
      const elapsed = (monotonicMs() - sessionAnchor.mono) / 1000
      if (elapsed >= GRACE_MAX_SECONDS) return null
    }
    const now = graceNowSeconds()
    if (now >= claims.exp) return null
    const sub = subSeconds(claims.sub) // M4: a lapsed subscription locks even within exp
    if (sub !== null && now >= sub) return null
    if (claims.iat < floorIat() || claims.rev < floorRev()) return null
    return claims
  }

  function advanceFloor(claims: EntitlementClaims): void {
    if (claims.iat > floorIat()) storage.set(K_FLOOR_IAT, String(claims.iat))
    if (claims.rev > floorRev()) storage.set(K_FLOOR_REV, String(claims.rev))
  }

  function clearCache(): void {
    storage.delete(K_CACHED_ENTITLEMENT)
  }

  /** INCONCLUSIVE outcome: keep the machine licensed on a still-valid cache, else lock. */
  function inconclusive(): LicenseDecision {
    const cached = validCachedEntitlement()
    if (cached) return decision('licensed', 'inconclusive', cached)
    return decision('locked', 'inconclusive')
  }

  /** A trustworthy-but-unusable server answer (bad artifact, wrong mid, 401/403): grace, else lock. */
  function inconclusiveOrLock(lockReason: LicenseReason): LicenseDecision {
    const cached = validCachedEntitlement()
    if (cached) return decision('licensed', 'inconclusive', cached)
    return decision('locked', lockReason)
  }

  /** Server's own notion of "now" for an ONLINE decision — immune to a skewed local wall-clock. */
  function serverNowSeconds(body: CheckResponseBody, claims: EntitlementClaims): number {
    const st = body.serverTime
    return typeof st === 'number' && Number.isFinite(st) && st > 0 ? Math.floor(st) : claims.iat
  }

  /** Decide from a verified 200 (or trial/start 2xx) body carrying a signed entitlement artifact. */
  function decideFromArtifactBody(body: CheckResponseBody): LicenseDecision {
    const verified = verifyArtifact(body.entitlement)
    if (!verified.ok) {
      log?.('license: server artifact failed verification')
      return inconclusiveOrLock('invalid_entitlement')
    }
    const claims = verified.claims
    if (claims.mid !== machineId) {
      log?.('license: artifact not bound to this machine')
      return inconclusiveOrLock('invalid_entitlement')
    }

    // Monotonic floor: reject any signature-valid artifact that rolls iat OR rev backwards.
    if (claims.iat < floorIat() || claims.rev < floorRev()) {
      log?.('license: rejected replayed/rolled-back artifact')
      const cached = validCachedEntitlement()
      return decision(cached ? 'licensed' : 'locked', 'replay', cached ?? undefined)
    }

    const serverNow = serverNowSeconds(body, claims)
    const sub = subSeconds(claims.sub)

    // Definitive revoked (addendum #10): advance the floor FIRST so a replayed older "active" token
    // can't un-revoke, THEN discard the cache. A crash between the two leaves the cache below the
    // higher floor → still locked. reason 'revoked'.
    if (claims.st === 'revoked') {
      advanceFloor(claims)
      clearCache()
      log?.('license: revoked — locking and discarding cache')
      return decision('locked', 'revoked', claims)
    }

    // Definitive expiry: past exp, past subscription-until (M4), or any status that is not
    // active/trial (M5: never license an unexpected status).
    if (serverNow >= claims.exp || (sub !== null && serverNow >= sub) || (claims.st !== 'active' && claims.st !== 'trial')) {
      advanceFloor(claims)
      clearCache()
      log?.('license: expired/ineligible — locking')
      return decision('locked', 'expired', claims)
    }

    // Active / trial and within BOTH its signed windows → licensed. M6: persist the cache BEFORE the
    // floor so a power loss between the two writes leaves a valid cache under an OLDER (never higher)
    // floor — the paying customer keeps running, never a phantom-replay lockout.
    storage.set(K_CACHED_ENTITLEMENT, String(body.entitlement))
    advanceFloor(claims)
    anchorServerTime(claims.iat) // M7: monotonic grace anchor for subsequent offline checks
    return decision('licensed', 'valid_entitlement', claims)
  }

  function handleNotFound(): LicenseDecision {
    // Legacy HMAC-serial paid machine unknown to the new server → one bounded migration window,
    // never a fresh-trial downgrade and never an immediate lock. Only /check reaches here.
    const isLegacyPaid =
      storage.get(K_ACTIVATION_TYPE) === 'full' &&
      typeof legacySerialIsValid === 'function' &&
      safeLegacyValid()
    if (isLegacyPaid) {
      let startedAt = Number(storage.get(K_MIGRATION_STARTED))
      if (!Number.isFinite(startedAt) || startedAt <= 0) {
        startedAt = nowSeconds()
        storage.set(K_MIGRATION_STARTED, String(startedAt))
        log?.('license: legacy machine unknown to server — starting 7-day migration window')
      }
      if (nowSeconds() >= startedAt + MIGRATION_GRACE_DAYS * DAY_SECONDS) {
        return decision('locked', 'migration_expired')
      }
      return decision('migration', 'not_found')
    }
    // Truly unknown machine: definitive, but never auto-enrol. Keep a valid cache alive as grace.
    const cached = validCachedEntitlement()
    if (cached) return decision('licensed', 'inconclusive', cached)
    return decision('locked', 'not_found')
  }

  function safeLegacyValid(): boolean {
    try {
      return legacySerialIsValid ? legacySerialIsValid() : false
    } catch {
      return false
    }
  }

  /** M8: bound every request so a hung socket resolves INCONCLUSIVE instead of wedging in-flight. */
  async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    try {
      return await doFetch(url, { ...init, signal: controller.signal })
    } finally {
      clearTimeout(timer)
    }
  }

  async function postTrialStart(input: { restaurantName?: string; phone?: string }): Promise<LicenseDecision> {
    // Enrollment presents NO device credential: /trial/start is the moment the server MINTS and
    // returns a fresh secret (binding case). Sending a Device header here is wrong even if one is
    // stored (the frozen device_secret_storage test asserts no Authorization on this call).
    const body: Record<string, unknown> = { machineId, appVersion }
    if (input.restaurantName !== undefined) body.restaurantName = input.restaurantName
    if (input.phone !== undefined) body.phone = input.phone

    let response: Response
    try {
      response = await fetchWithTimeout(`${licenseServerUrl}/v1/trial/start`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body)
      })
    } catch {
      return inconclusive()
    }

    if (response.status >= 500 || response.status === 429) return inconclusive()

    const parsed = await parseJson(response)
    if (response.status >= 200 && response.status < 300) {
      const decision = decideFromArtifactBody((parsed ?? {}) as CheckResponseBody)
      // M5: only persist the freshly-minted device secret AFTER the entitlement verifies, so a
      // malformed 2xx can never poison credential state.
      const secretValue = (parsed as CheckResponseBody | undefined)?.deviceSecret
      if (decision.reason === 'valid_entitlement' && typeof secretValue === 'string' && secretValue.length > 0) {
        deviceSecretStorage.save(secretValue)
      }
      return decision
    }
    // 403 not_eligible / device_bound, 409 trial_not_available → definitive, but honour grace.
    return inconclusiveOrLock('invalid_entitlement')
  }

  async function performCheck(): Promise<LicenseDecision> {
    const secret = deviceSecretStorage.load()
    let response: Response
    try {
      response = await fetchWithTimeout(`${licenseServerUrl}/v1/license/check`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(secret ? { authorization: `Device ${secret}` } : {})
        },
        body: JSON.stringify({ machineId, appVersion })
      })
    } catch {
      // Network / DNS / timeout failure — inconclusive, never a revocation.
      return inconclusive()
    }

    const status = response.status
    if (status >= 500 || status === 429) return inconclusive() // 503 db_failure, throttle: transient

    const parsed = await parseJson(response)

    if (status === 200) return decideFromArtifactBody((parsed ?? {}) as CheckResponseBody)

    if (status === 401) {
      const enroll = (parsed as { enroll?: unknown } | undefined)?.enroll === true
      if (enroll) {
        // Known-but-unbound: bind by starting a trial. This is the ONLY path /check may take to
        // /v1/trial/start (per the frozen contract .d.ts).
        return await postTrialStart({})
      }
      return inconclusiveOrLock('invalid_entitlement')
    }

    if (status === 404) return handleNotFound()

    // 403 device_bound and any other definitive 4xx: never auto-retrial; honour cache grace.
    if (status === 403) return inconclusiveOrLock('invalid_entitlement')
    return inconclusive()
  }

  async function parseJson(response: Response): Promise<unknown> {
    try {
      return await response.json()
    } catch {
      return undefined
    }
  }

  // Single in-flight check: concurrent triggers (startup + periodic + resume) share one request.
  let inflight: Promise<LicenseDecision> | null = null

  return {
    check(): Promise<LicenseDecision> {
      if (inflight) return inflight
      inflight = performCheck().finally(() => {
        inflight = null
      })
      return inflight
    },
    startTrial(input): Promise<LicenseDecision> {
      return postTrialStart(input ?? {})
    },
    diagnostics(): Pick<LicenseDecision, 'machineIdMismatch' | 'deviceSecretStorageFallback'> {
      return { machineIdMismatch, deviceSecretStorageFallback: deviceSecretStorage.fallback }
    }
  }
}
