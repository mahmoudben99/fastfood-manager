import assert from 'node:assert/strict'
import test from 'node:test'
import {
  TEST_DEVICE_SECRET, TEST_MACHINE_ID, accessToken, createFakeLicenseServer,
  entitlement, signedArtifact, successfulCheck
} from './fixtures/fake-license-server.mjs'
import { TEST_KID, TEST_PUBLIC_KEY } from './fixtures/keys.mjs'

const CLIENT_MODULE = new URL('../../../src/main/activation/license-client.ts', import.meta.url).href
const NOW = 1_700_000_000

class MemoryStorage {
  constructor(values = {}) { this.values = new Map(Object.entries(values)) }
  get(key) { return this.values.get(key) }
  set(key, value) { this.values.set(key, value) }
  delete(key) { this.values.delete(key) }
}
class MemorySecretStorage {
  constructor(secret = TEST_DEVICE_SECRET, fallback = false) { this.secret = secret; this.fallback = fallback; this.saves = [] }
  load() { return this.secret }
  save(secret) { this.secret = secret; this.saves.push(secret) }
  clear() { this.secret = undefined }
}

async function loadClient() {
  const module = await import(CLIENT_MODULE)
  assert.equal(typeof module.createLicenseClient, 'function', 'license client must export createLicenseClient')
  return module.createLicenseClient
}
function responseWith(claims, extra = {}) {
  return successfulCheck({ claims, status: claims.st, plan: claims.plan, revision: claims.rev, ...extra })
}
async function setup({ stored = {}, secret, fallback, now = NOW, recomputedId = TEST_MACHINE_ID, fetchImpl, legacySerialIsValid } = {}) {
  const server = await createFakeLicenseServer()
  const storage = new MemoryStorage({ machine_id: TEST_MACHINE_ID, ...stored })
  const deviceSecretStorage = new MemorySecretStorage(secret, fallback)
  const logs = []
  let current = now
  let createLicenseClient
  try { createLicenseClient = await loadClient() } catch (error) { await server.close(); throw error }
  const client = createLicenseClient({
    licenseServerUrl: server.url, appVersion: '3.2.0-test', publicKeys: [{ kid: TEST_KID, pub: TEST_PUBLIC_KEY }],
    storage, deviceSecretStorage, clock: { now: () => current * 1000 }, recomputeMachineId: () => recomputedId,
    fetch: fetchImpl, log: message => logs.push(String(message)), legacySerialIsValid
  })
  return { client, server, storage, deviceSecretStorage, logs, setNow(value) { current = value } }
}
async function withSetup(options, body) {
  const fixture = await setup(options)
  try { await body(fixture) } finally { await fixture.server.close() }
}

test('verify_valid_entitlement: well-formed 7d entitlement verifies and claims are parsed', async () => {
  await withSetup({}, async ({ client, server }) => {
    const claims = { iat: NOW, exp: NOW + 7 * 86_400, rev: 4, name: 'La ZONE' }
    server.setCheck(responseWith(claims))
    const result = await client.check()
    assert.equal(result.state, 'licensed')
    assert.equal(result.reason, 'valid_entitlement')
    assert.deepEqual(result.entitlement, { v: 1, kid: TEST_KID, typ: 'entitlement', mid: TEST_MACHINE_ID,
      st: 'active', plan: 'yearly', sub: '2030-01-01T00:00:00.000Z', rev: 4, name: 'La ZONE', ...claims })
    assert.equal(server.calls.length, 1)
    assert.equal(server.calls[0].headers.authorization, `Device ${TEST_DEVICE_SECRET}`)
    assert.deepEqual(server.calls[0].body, { machineId: TEST_MACHINE_ID, appVersion: '3.2.0-test' })
  })
})

for (const [name, mutate] of [
  ['reject_bad_signature', () => ({ entitlement: `${entitlement()}.tampered` })],
  ['reject_unknown_kid', () => ({ claims: { kid: 'not-baked-kid' } })],
  ['reject_wrong_machine', () => ({ claims: { mid: 'OTHER999' } })]
]) {
  test(`${name}: invalid server artifact never licenses the machine`, async () => {
    await withSetup({}, async ({ client, server }) => {
      const change = mutate()
      server.setCheck(change.entitlement
        ? { status: 200, body: { ...successfulCheck().body, entitlement: change.entitlement } }
        : responseWith(change.claims))
      const result = await client.check()
      assert.notEqual(result.state, 'licensed')
      assert.match(result.reason, /invalid_entitlement|expired/)
    })
  })
}

test('reject_expired: a signature-valid entitlement past exp locks, rather than being treated as a network failure', async () => {
  await withSetup({}, async ({ client, server }) => {
    server.setCheck(responseWith({ exp: NOW - 1 }))
    const result = await client.check()
    assert.equal(result.state, 'locked')
    assert.equal(result.reason, 'expired')
  })
})

test('monotonic_floor: lower iat or revision after a verified entitlement is rejected as replay', async () => {
  await withSetup({}, async ({ client, server, storage }) => {
    server.setCheck(responseWith({ iat: NOW, rev: 9, exp: NOW + 7 * 86_400 }))
    assert.equal((await client.check()).state, 'licensed')
    assert.equal(storage.get('license_floor_iat'), String(NOW))
    assert.equal(storage.get('license_floor_rev'), '9')
    server.setCheck(responseWith({ iat: NOW - 1, rev: 10, exp: NOW + 7 * 86_400 }))
    assert.equal((await client.check()).reason, 'replay')
    server.setCheck(responseWith({ iat: NOW + 1, rev: 8, exp: NOW + 7 * 86_400 }))
    assert.equal((await client.check()).reason, 'replay')
  })
})

test('clock_rollback: persisted floor is not lowered and cached entitlement remains valid by its signed expiry', async () => {
  const cached = entitlement({ iat: NOW, exp: NOW + 7 * 86_400, rev: 7 })
  await withSetup({ now: NOW - 86_400, stored: {
    license_floor_iat: String(NOW), license_floor_rev: '7', license_cached_entitlement: cached
  } }, async ({ client, server, storage }) => {
    server.setCheck({ status: 503, body: { error: 'db_failure' } })
    assert.equal((await client.check()).state, 'licensed')
    assert.equal(storage.get('license_floor_iat'), String(NOW))
    server.setCheck(responseWith({ iat: NOW - 1, rev: 8, exp: NOW + 7 * 86_400 }))
    assert.equal((await client.check()).reason, 'replay')
  })
})

test('grace_window: inconclusive check retains cached entitlement strictly through its 7-day exp boundary', async () => {
  const cached = entitlement({ iat: NOW, exp: NOW + 7 * 86_400 })
  await withSetup({ now: NOW + 7 * 86_400 - 1, stored: { license_cached_entitlement: cached } }, async ({ client, server, setNow }) => {
    server.setCheck({ status: 503, body: { error: 'db_failure' } })
    assert.equal((await client.check()).state, 'licensed')
    setNow(NOW + 7 * 86_400)
    assert.equal((await client.check()).state, 'locked')
  })
})

test('dns_503_not_revocation: DNS and 503 are inconclusive and cannot flip a valid cached license', async () => {
  const cached = entitlement({ iat: NOW, exp: NOW + 86_400 })
  await withSetup({ stored: { license_cached_entitlement: cached } }, async ({ client, server }) => {
    server.setCheck({ status: 503, body: { error: 'db_failure' } })
    assert.equal((await client.check()).state, 'licensed')
  })
  await withSetup({ stored: { license_cached_entitlement: cached }, fetchImpl: async () => { const error = new Error('getaddrinfo ENOTFOUND'); error.code = 'ENOTFOUND'; throw error } }, async ({ client }) => {
    const result = await client.check()
    assert.equal(result.state, 'licensed')
    assert.equal(result.reason, 'inconclusive')
  })
})

test('definitive_revoked_locks: verified revoked response locks within one check and discards cached entitlement', async () => {
  const cached = entitlement({ exp: NOW + 86_400 })
  await withSetup({ stored: { license_cached_entitlement: cached } }, async ({ client, server, storage }) => {
    server.setCheck(responseWith({ st: 'revoked', rev: 2, exp: NOW + 7 * 86_400 }))
    const result = await client.check()
    assert.equal(result.state, 'locked')
    assert.equal(result.reason, 'revoked')
    assert.equal(storage.get('license_cached_entitlement'), undefined)
  })
})

test('not_found_never_downgrades_legacy_paid: definitive 404 starts exactly one seven-day migration, then locks explicitly', async () => {
  await withSetup({ stored: { activation_type: 'full', activation_code: 'legacy-hmac' }, legacySerialIsValid: () => true }, async ({ client, server, setNow }) => {
    server.setCheck({ status: 404, body: { error: 'not_found' } })
    assert.equal((await client.check()).state, 'migration')
    assert.equal((await client.check()).state, 'migration')
    setNow(NOW + 7 * 86_400)
    const result = await client.check()
    assert.equal(result.state, 'locked')
    assert.equal(result.reason, 'migration_expired')
    assert.equal(server.calls.filter(call => call.path === '/v1/trial/start').length, 0)
  })
})

test('unbound_enroll_hint: a 401 enroll:true binds via trial/start instead of locking', async () => {
  await withSetup({ secret: undefined }, async ({ client, server, deviceSecretStorage }) => {
    server.setCheck({ status: 401, body: { error: 'unauthorized', enroll: true } })
    server.setStart({ status: 200, body: { ...successfulCheck({ claims: { rev: 2 } }).body, deviceSecret: TEST_DEVICE_SECRET } })
    assert.equal((await client.check()).state, 'licensed')
    assert.equal(server.calls.filter(call => call.path === '/v1/trial/start').length, 1)
    assert.equal(deviceSecretStorage.saves[0], TEST_DEVICE_SECRET)
  })
})

test('single_inflight: concurrent triggers share one network request', async () => {
  await withSetup({}, async ({ client, server }) => {
    let release
    const pending = new Promise(resolve => { release = resolve })
    server.setCheck(async () => { await pending; return successfulCheck() })
    const first = client.check()
    const second = client.check()
    // timing: fixture records the call after loopback delivery + body read (2 ticks on Windows); poll until the single in-flight request is observed, then assert exactly one — coalescing correctness, OS-independent.
    for (let i = 0; i < 50 && server.calls.length < 1; i++) await new Promise(resolve => setImmediate(resolve))
    assert.equal(server.calls.length, 1)
    release()
    assert.deepEqual((await Promise.all([first, second])).map(result => result.state), ['licensed', 'licensed'])
  })
})

test('machine_id_pinned: stored machine ID wins over a recomputation mismatch and emits the diagnostic', async () => {
  await withSetup({ recomputedId: 'DIFFERENT987' }, async ({ client, server }) => {
    assert.equal((await client.check()).state, 'licensed')
    assert.equal(server.calls[0].body.machineId, TEST_MACHINE_ID)
    assert.equal(client.diagnostics().machineIdMismatch, true)
  })
})

test('trial_start_explicit: periodic checks never create a trial for an unknown machine', async () => {
  await withSetup({}, async ({ client, server }) => {
    server.setCheck({ status: 404, body: { error: 'not_found' } })
    await client.check()
    assert.equal(server.calls.filter(call => call.path === '/v1/trial/start').length, 0)
    await client.startTrial({ restaurantName: 'La ZONE', phone: '0550' })
    assert.equal(server.calls.filter(call => call.path === '/v1/trial/start').length, 1)
  })
})

test('device_secret_storage: secret uses the dedicated store, only Device authorization, and never reaches logs', async () => {
  await withSetup({ secret: undefined, fallback: true }, async ({ client, server, deviceSecretStorage, logs }) => {
    server.setStart({ status: 201, body: { ...successfulCheck().body, deviceSecret: TEST_DEVICE_SECRET } })
    await client.startTrial({})
    assert.deepEqual(deviceSecretStorage.saves, [TEST_DEVICE_SECRET])
    assert.equal(client.diagnostics().deviceSecretStorageFallback, true)
    assert.equal(server.calls[0].headers.authorization, undefined)
    assert.deepEqual(server.calls[0].body, { machineId: TEST_MACHINE_ID, appVersion: '3.2.0-test' })
    assert.equal(logs.join('\n').includes(TEST_DEVICE_SECRET), false)
  })
})
