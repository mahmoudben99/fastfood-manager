import assert from 'node:assert/strict'
import test from 'node:test'
import {
  TEST_DEVICE_SECRET,
  TEST_MACHINE_ID,
  createFakeLicenseServer,
  entitlement,
  signedArtifact,
  successfulCheck
} from '../license-client/fixtures/fake-license-server.mjs'
import { TEST_KID, TEST_PUBLIC_KEY } from '../license-client/fixtures/keys.mjs'

const CLIENT = new URL('../../../src/main/activation/license-client.ts', import.meta.url).href
const OUTCOME = new URL('../../../src/main/activation/license-outcome.ts', import.meta.url).href
const ENDPOINTS = new URL('../../../src/main/config/endpoints.ts', import.meta.url).href
const NOW = 1_700_000_000

class Mem {
  constructor(v = {}) { this.values = new Map(Object.entries(v)) }
  get(k) { return this.values.get(k) }
  set(k, v) { this.values.set(k, String(v)) }
  delete(k) { this.values.delete(k) }
}

async function makeClient({ stored = {}, secret = TEST_DEVICE_SECRET, now = NOW, recomputedId = TEST_MACHINE_ID, legacySerialIsValid } = {}) {
  const { createLicenseClient } = await import(CLIENT)
  const server = await createFakeLicenseServer()
  const storage = new Mem({ machine_id: TEST_MACHINE_ID, ...stored })
  const client = createLicenseClient({
    licenseServerUrl: server.url,
    appVersion: '3.2.0-int',
    publicKeys: [{ kid: TEST_KID, pub: TEST_PUBLIC_KEY }],
    storage,
    deviceSecretStorage: { load: () => secret, save() {}, clear() {}, fallback: false },
    clock: { now: () => now * 1000 },
    recomputeMachineId: () => recomputedId,
    legacySerialIsValid
  })
  return { client, server, storage }
}

// ── M5: malformed / out-of-enum signed claims are NOT trusted ──────────────────────────────────
test('M5 malformed_status_rejected: signature-valid but st out-of-enum never licenses', async () => {
  const { client, server } = await makeClient()
  const artifact = signedArtifact({
    v: 1, kid: TEST_KID, typ: 'entitlement', mid: TEST_MACHINE_ID, st: 'super-admin',
    plan: 'yearly', sub: '2030-01-01T00:00:00.000Z', rev: 1, name: null, iat: NOW, exp: NOW + 7 * 86400
  })
  server.setCheck({ status: 200, body: { ...successfulCheck().body, entitlement: artifact } })
  const r = await client.check()
  assert.notEqual(r.state, 'licensed')
  assert.equal(r.reason, 'invalid_entitlement')
  await server.close()
})

test('M5 non_active_status_locks: a well-formed st:expired locks (never licensed)', async () => {
  const { client, server } = await makeClient()
  server.setCheck({ status: 200, body: { ...successfulCheck().body, entitlement: entitlement({ st: 'expired', exp: NOW + 7 * 86400 }) } })
  const r = await client.check()
  assert.equal(r.state, 'locked')
  assert.equal(r.reason, 'expired')
  await server.close()
})

// ── M4: subscription-until enforced even within a valid exp ─────────────────────────────────────
test('M4 past_sub_locks: a lapsed subscription locks even though exp is 7 days out', async () => {
  const { client, server } = await makeClient()
  server.setCheck({ status: 200, body: { ...successfulCheck().body, entitlement: entitlement({ st: 'active', sub: '2020-01-01T00:00:00.000Z', exp: NOW + 7 * 86400 }) } })
  const r = await client.check()
  assert.equal(r.state, 'locked')
  assert.equal(r.reason, 'expired')
  await server.close()
})

test('M4 sub_offline_lock: cached entitlement with a passed sub is not valid grace offline', async () => {
  const cached = entitlement({ st: 'active', sub: '2020-01-01T00:00:00.000Z', exp: NOW + 7 * 86400 })
  const { client, server } = await makeClient({ stored: { license_cached_entitlement: cached } })
  server.setCheck({ status: 503, body: { error: 'db_failure' } })
  const r = await client.check()
  assert.equal(r.state, 'locked') // grace denied: subscription lapsed
  await server.close()
})

// ── M6: corrupt/implausible floor fails TOWARD the still-valid cached entitlement ───────────────
test('M6 corrupt_floor_fails_toward_cache: an implausible floor_iat cannot lock a valid cache', async () => {
  const cached = entitlement({ st: 'active', iat: NOW, exp: NOW + 7 * 86400, rev: 5 })
  const { client, server } = await makeClient({
    stored: { license_floor_iat: '9999999999', license_floor_rev: '1', license_cached_entitlement: cached }
  })
  server.setCheck({ status: 503, body: { error: 'db_failure' } })
  const r = await client.check()
  assert.equal(r.state, 'licensed') // corrupt high floor ignored; cache honored
  assert.equal(r.reason, 'inconclusive')
  await server.close()
})

test('M6 cache_persisted_with_floor: a licensed check writes BOTH cache and floor', async () => {
  const { client, server, storage } = await makeClient()
  server.setCheck(successfulCheck({ claims: { iat: NOW, exp: NOW + 7 * 86400, rev: 3 } }))
  assert.equal((await client.check()).state, 'licensed')
  assert.ok(storage.get('license_cached_entitlement'), 'cache written')
  assert.equal(storage.get('license_floor_rev'), '3', 'floor written')
  await server.close()
})

// ── B3: /check + migration use the PINNED id, not a host recompute ──────────────────────────────
test('B3 migration_uses_pinned_id: 404 for the pinned id → migration when the legacy serial is valid', async () => {
  const { client, server } = await makeClient({
    stored: { machine_id: 'PINNEDPAID01', activation_type: 'full' },
    recomputedId: 'DRIFTEDHOST99',
    legacySerialIsValid: () => true // service validates the HMAC against the PINNED id
  })
  server.setCheck({ status: 404, body: { error: 'not_found' } })
  const r = await client.check()
  assert.equal(r.state, 'migration')
  assert.equal(server.calls[0].body.machineId, 'PINNEDPAID01') // request used the pinned id, not the recompute
  await server.close()
})

test('B3 migration_denied_when_serial_invalid: 404 with an invalid legacy serial locks (not migration)', async () => {
  const { client, server } = await makeClient({
    stored: { machine_id: 'PINNEDPAID01', activation_type: 'full' },
    recomputedId: 'DRIFTEDHOST99',
    legacySerialIsValid: () => false
  })
  server.setCheck({ status: 404, body: { error: 'not_found' } })
  const r = await client.check()
  assert.equal(r.state, 'locked')
  assert.equal(r.reason, 'not_found')
  await server.close()
})

// ── Integration: revocation while running locks within one cycle and discards the cache ──────────
test('revocation_while_running: a licensed machine that is then revoked locks + clears cache', async () => {
  const { client, server, storage } = await makeClient()
  server.setCheck(successfulCheck({ claims: { iat: NOW, exp: NOW + 7 * 86400, rev: 2 } }))
  assert.equal((await client.check()).state, 'licensed')
  assert.ok(storage.get('license_cached_entitlement'))
  server.setCheck(successfulCheck({ claims: { st: 'revoked', rev: 3, exp: NOW + 7 * 86400 }, status: 'revoked' }))
  const r = await client.check()
  assert.equal(r.state, 'locked')
  assert.equal(r.reason, 'revoked')
  assert.equal(storage.get('license_cached_entitlement'), undefined)
  await server.close()
})

// ── M7: a forward OS-clock jump must not prematurely expire a freshly-verified cache ────────────
test('M7 forward_clock_jump_keeps_fresh_cache: monotonic grace survives a wall-clock leap', async () => {
  const { createLicenseClient } = await import(CLIENT)
  const server = await createFakeLicenseServer()
  let wallSec = NOW
  const storage = new Mem({ machine_id: TEST_MACHINE_ID })
  const client = createLicenseClient({
    licenseServerUrl: server.url, appVersion: '3.2.0-int', publicKeys: [{ kid: TEST_KID, pub: TEST_PUBLIC_KEY }],
    storage, deviceSecretStorage: { load: () => TEST_DEVICE_SECRET, save() {}, clear() {}, fallback: false },
    clock: { now: () => wallSec * 1000 }, recomputeMachineId: () => TEST_MACHINE_ID
  })
  server.setCheck(successfulCheck({ claims: { iat: NOW, exp: NOW + 7 * 86400, rev: 1 } }))
  assert.equal((await client.check()).state, 'licensed') // anchors server-time to a monotonic reading
  // Wall clock leaps ~400 days forward; the real monotonic elapsed is ~milliseconds.
  wallSec = NOW + 400 * 86400
  server.setCheck({ status: 503, body: { error: 'db_failure' } })
  const r = await client.check()
  assert.equal(r.state, 'licensed', 'fresh cache survives the forward jump (monotonic grace)')
  await server.close()
})

// ── B1/B2: the shared outcome mapping (paid tagging + uniform lock/grace) ────────────────────────
test('B1 activation_type: paid plans tag full, trial tags trial', async () => {
  const { activationTypeForEntitlement } = await import(OUTCOME)
  assert.equal(activationTypeForEntitlement({ plan: 'yearly' }), 'full')
  assert.equal(activationTypeForEntitlement({ plan: 'monthly' }), 'full')
  assert.equal(activationTypeForEntitlement({ plan: 'lifetime' }), 'full')
  assert.equal(activationTypeForEntitlement({ plan: 'trial' }), 'trial')
  assert.equal(activationTypeForEntitlement(undefined), 'trial')
})

// ── M9: unusable endpoint overrides are rejected (fall through to baked) ─────────────────────────
test('M9 endpoint_override_rejection: whitespace/query/hash/credential overrides fall back to baked', async () => {
  const { resolveEndpoints } = await import(ENDPOINTS)
  const baked = { supabaseUrl: 'https://b.supabase.co', supabaseAnonKey: 'k', licenseServerUrl: 'https://baked.example' }
  for (const bad of [
    'https://evil.example ', // trailing space → would build an invalid request URL
    ' https://evil.example', // leading space
    'https://evil.example/?x=1', // query
    'https://evil.example/#frag', // hash
    'https://user:pass@evil.example', // embedded credentials
    'http://evil.example' // non-https
  ]) {
    const r = resolveEndpoints({ baked, env: { FFM_LICENSE_SERVER_URL: bad }, log() {} })
    assert.equal(r.values.licenseServerUrl, 'https://baked.example', `rejected: ${JSON.stringify(bad)}`)
    assert.equal(r.source.licenseServerUrl, 'baked')
  }
  // a clean https override with a trailing slash IS accepted, normalized without the slash
  const ok = resolveEndpoints({ baked, env: { FFM_LICENSE_SERVER_URL: 'https://good.example/' }, log() {} })
  assert.equal(ok.values.licenseServerUrl, 'https://good.example')
  assert.equal(ok.source.licenseServerUrl, 'env')
})

test('B2 watcher_outcome: uniform lock/grace decisions', async () => {
  const { resolveWatcherOutcome } = await import(OUTCOME)
  const ctx0 = { hasCachedEntitlement: false, persistedLock: null }
  const ctxCache = { hasCachedEntitlement: true, persistedLock: null }

  // paid licensed → unlock as full
  assert.deepEqual(
    resolveWatcherOutcome({ state: 'licensed', reason: 'valid_entitlement', entitlement: { plan: 'yearly', exp: NOW + 7 * 86400, sub: null } }, ctx0).kind,
    'unlock'
  )
  assert.equal(
    resolveWatcherOutcome({ state: 'licensed', reason: 'valid_entitlement', entitlement: { plan: 'yearly', exp: NOW, sub: null } }, ctx0).activationType,
    'full'
  )
  // definitive revoked → lock immediately (M8)
  assert.deepEqual(resolveWatcherOutcome({ state: 'locked', reason: 'revoked' }, ctxCache), { kind: 'lock', reason: 'revoked' })
  // offline grace exhausted (has cache) → lock; fresh install (no cache) → defer
  assert.equal(resolveWatcherOutcome({ state: 'locked', reason: 'inconclusive' }, ctxCache).kind, 'lock')
  assert.equal(resolveWatcherOutcome({ state: 'locked', reason: 'inconclusive' }, ctx0).kind, 'defer')
  // offline WITHIN grace (client says licensed) → unlock
  assert.equal(resolveWatcherOutcome({ state: 'licensed', reason: 'inconclusive', entitlement: { plan: 'monthly', exp: NOW + 86400, sub: null } }, ctx0).kind, 'unlock')
})
