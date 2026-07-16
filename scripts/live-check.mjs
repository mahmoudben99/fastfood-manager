/**
 * LIVE round-trip against the REAL license worker — the pre-mortem F2 anti-lockout gate.
 *
 * The 7-day offline grace MUST NOT be able to mask a broken/misconfigured license URL. If the baked
 * URL were wrong, the client's check() would throw at the transport layer and return a GRACE
 * (inconclusive) decision — silently keeping a machine "licensed" while never actually reaching the
 * server. This script proves the opposite end-to-end online:
 *   1. the baked endpoints resolve to the live worker URL,
 *   2. GET /health answers 200 { ok: true },
 *   3. the real license CLIENT (baked key set, real transport, real JSON parsing) gets a DEFINITIVE
 *      404 not_found for an unknown machine — reason 'not_found', NOT 'inconclusive'.
 *
 * A full /trial/start is deliberately NOT exercised (it is IP-throttled 5/hour); reachable
 * definitive responses are the correct assertion for this gate.
 *
 * Run: node scripts/live-check.mjs
 */
import { createPublicKey, verify as edVerify } from 'node:crypto'
import { getEndpoints, BAKED_DEFAULTS } from '../src/main/config/endpoints.ts'
import { createLicenseClient } from '../src/main/activation/license-client.ts'
import { BAKED_LICENSE_KEYS } from '../src/main/activation/license-keys.ts'

const EXPECTED_URL = 'https://ffm-license.xilentm20.workers.dev'
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex')
let failures = 0
function check(label, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

/** Verify a `payload.sig` artifact against a baked raw-32-byte Ed25519 pubkey. Returns claims or null. */
function verifyArtifactAgainstBakedKey(artifact, kid) {
  const key = BAKED_LICENSE_KEYS.find((k) => k.kid === kid)
  if (!key || typeof artifact !== 'string') return null
  const parts = artifact.split('.')
  if (parts.length !== 2) return null
  const payload = Buffer.from(parts[0], 'base64url')
  const sig = Buffer.from(parts[1], 'base64url')
  const raw = Buffer.from(key.pub, 'base64url')
  const pub = createPublicKey({ key: Buffer.concat([ED25519_SPKI_PREFIX, raw]), format: 'der', type: 'spki' })
  if (!edVerify(null, payload, pub, sig)) return null
  return JSON.parse(payload.toString('utf8'))
}

// 1. Baked URL resolves through the real endpoints module (no env/file override present).
const { licenseServerUrl } = getEndpoints()
check('baked licenseServerUrl resolves to live worker', licenseServerUrl === EXPECTED_URL, licenseServerUrl)
check('BAKED_DEFAULTS.licenseServerUrl is the live worker', BAKED_DEFAULTS.licenseServerUrl === EXPECTED_URL, BAKED_DEFAULTS.licenseServerUrl)

// 2. /health is reachable and healthy.
let health
try {
  const res = await fetch(`${licenseServerUrl}/health`)
  const body = await res.json()
  health = { status: res.status, body }
  check('GET /health → 200 { ok: true }', res.status === 200 && body?.ok === true, `${res.status} ${JSON.stringify(body)}`)
} catch (error) {
  check('GET /health reachable', false, String(error))
}

// 3. The real client gets a DEFINITIVE 404 (not a network-error grace) for an unknown machine.
const unknownMachineId = `ZZLIVECHECK${Date.now().toString(36).toUpperCase()}`
const storage = new Map([['machine_id', unknownMachineId]])
const client = createLicenseClient({
  licenseServerUrl,
  appVersion: '3.2.0-live-check',
  publicKeys: BAKED_LICENSE_KEYS,
  storage: { get: (k) => storage.get(k), set: (k, v) => storage.set(k, v), delete: (k) => storage.delete(k) },
  deviceSecretStorage: { load: () => undefined, save() {}, clear() {}, fallback: false },
  clock: { now: () => Date.now() },
  recomputeMachineId: () => unknownMachineId
})

const decision = await client.check()
check(
  'client.check() unknown machine → DEFINITIVE lock (reason not_found), NOT inconclusive grace',
  decision.state === 'locked' && decision.reason === 'not_found',
  `state=${decision.state} reason=${decision.reason}`
)
check(
  'grace did NOT mask the URL (reason is not inconclusive)',
  decision.reason !== 'inconclusive',
  `reason=${decision.reason}`
)

// 4. M10 — verify a REAL signed artifact from the worker against the BAKED kid=k1 key. This is the
// only assertion that catches a WRONG baked public key: URL/health/404 all pass even then, but every
// real paying 200 would fail verification and lock customers. Uses a pre-seeded, device-bound
// throwaway machine; creds come from env (never hardcoded). Skips with a clear message if unset.
const harnessMachine = process.env.WPD_HARNESS_MACHINE
const harnessSecret = process.env.WPD_HARNESS_SECRET
if (!harnessMachine || !harnessSecret) {
  console.log(
    'SKIP  signed-artifact verification against baked kid=k1 — set WPD_HARNESS_MACHINE + WPD_HARNESS_SECRET to run it'
  )
} else {
  try {
    const res = await fetch(`${licenseServerUrl}/v1/license/check`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Device ${harnessSecret}` },
      body: JSON.stringify({ machineId: harnessMachine, appVersion: '3.2.0-live-check' })
    })
    const body = await res.json()
    check('harness /check → 200 with entitlement', res.status === 200 && typeof body?.entitlement === 'string', `status=${res.status}`)
    const claims = verifyArtifactAgainstBakedKey(body?.entitlement, 'k1')
    check('entitlement signature verifies against baked kid=k1 (catches a wrong baked key)', claims !== null)
    if (claims) {
      check('claims.kid === k1', claims.kid === 'k1', String(claims.kid))
      check('claims.typ === entitlement', claims.typ === 'entitlement', String(claims.typ))
      check('claims.mid === harness machine', claims.mid === harnessMachine, String(claims.mid))
      check('exp - iat === 7 days', claims.exp - claims.iat === 7 * 86400, `${claims.exp - claims.iat}s`)
    }
  } catch (error) {
    check('harness signed-artifact verification', false, String(error))
  }
}

console.log(`\n${failures === 0 ? 'LIVE ROUND-TRIP OK' : `LIVE ROUND-TRIP FAILED (${failures})`}`)
process.exit(failures === 0 ? 0 : 1)
