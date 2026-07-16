import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { req, adminAuthHeader, deviceAuthHeader, randomMachineId } from './helpers/client.mjs'
import { seedLicenseRow, getRawLicenseRow, addDaysIso, resetRateLimits } from './helpers/seed.mjs'
import { sha256hex } from './helpers/hash.mjs'

// CONTRACT §1.5 POST /v1/trial/start. Every test resets the shared rate_limits
// bucket first: /trial/start is throttled 5/hour per IP (global to this local
// dev server, since every test call comes from 127.0.0.1) — without a reset,
// tests would trip each other's throttle depending on run order.
beforeEach(async () => {
  resetRateLimits()
})

test('trial_start_new_machine', async () => {
  const machineId = randomMachineId('NEW')
  const res = await req('/v1/trial/start', {
    body: { machineId, restaurantName: 'Test Diner', phone: '0550000001', appVersion: '3.2.0' }
  })
  assert.equal(res.status, 201)
  const b = res.json
  assert.ok(b, 'response body present')
  assert.equal(typeof b.deviceSecret, 'string')
  assert.ok(b.deviceSecret.length > 0)
  assert.equal(typeof b.accessToken, 'string')
  assert.equal(b.accessToken.split('.').length, 2)
  assert.equal(typeof b.entitlement, 'string')
  assert.equal(b.entitlement.split('.').length, 2)
  assert.equal(b.status, 'trial')
  assert.equal(b.plan, 'trial')
  assert.equal(b.revision, 1)
  assert.equal(typeof b.serverTime, 'number')
  assert.ok(Math.abs(b.serverTime - Math.floor(Date.now() / 1000)) < 10)

  // subscriptionUntil ~= now + TRIAL_DAYS. Default 7; if the orchestrator sets a
  // non-default TRIAL_DAYS in .dev.vars, set TEST_TRIAL_DAYS to match.
  const trialDays = Number(process.env.TEST_TRIAL_DAYS || 7)
  const subUntilMs = new Date(b.subscriptionUntil).getTime()
  const expectedMs = Date.now() + trialDays * 86_400_000
  assert.ok(
    Math.abs(subUntilMs - expectedMs) < 120_000,
    `subscriptionUntil ${b.subscriptionUntil} not within tolerance of now+${trialDays}d`
  )

  const adminRes = await req('/v1/admin/list', { headers: adminAuthHeader(), body: {} }) // sanity: admin auth works
  assert.equal(adminRes.status, 200)
  const getRes = await req('/v1/admin/get', { headers: adminAuthHeader(), body: { machineId } })
  assert.equal(getRes.status, 200)
  assert.equal(getRes.json.license.status, 'trial')
  assert.equal(getRes.json.license.effective, 'trial')
  assert.equal(getRes.json.license.revision, 1)
})

test('trial_start_unbound_existing_paid', async () => {
  const machineId = randomMachineId('UNB')
  const subUntil = addDaysIso(null, 200) // far future — unambiguously "active"
  seedLicenseRow(machineId, {
    status: 'active',
    plan: 'monthly',
    subscriptionUntil: subUntil,
    restaurantName: 'La ZONE',
    phone: '0550999999',
    revision: 1
  })

  const res = await req('/v1/trial/start', {
    body: { machineId, restaurantName: 'La ZONE', phone: '0550999999', appVersion: '3.2.0' }
  })
  assert.equal(res.status, 200)
  const b = res.json
  assert.equal(typeof b.deviceSecret, 'string')
  assert.ok(b.deviceSecret.length > 0, 'binds a device secret (case 2)')
  assert.equal(b.status, 'active', 'never downgraded to trial')
  assert.equal(b.plan, 'monthly', 'plan untouched')
  assert.equal(b.subscriptionUntil, subUntil, 'subscription_until untouched')
  assert.equal(b.revision, 2, 'binding bumps revision (seeded at 1)')

  const row = getRawLicenseRow(machineId)
  assert.equal(row.status, 'active')
  assert.equal(row.plan, 'monthly')
  assert.equal(row.subscription_until, subUntil)
  assert.equal(row.device_secret_hash, sha256hex(b.deviceSecret))
})

test('trial_start_bound_same_secret_idempotent', async () => {
  const machineId = randomMachineId('IDEM')
  const first = await req('/v1/trial/start', {
    body: { machineId, restaurantName: 'X', appVersion: '3.2.0' }
  })
  assert.equal(first.status, 201)
  const secret = first.json.deviceSecret
  const revBefore = first.json.revision

  const second = await req('/v1/trial/start', {
    headers: deviceAuthHeader(secret),
    body: { machineId, restaurantName: 'X', appVersion: '3.2.0' }
  })
  assert.equal(second.status, 200)
  assert.equal(second.json.deviceSecret, undefined, 'secret is returned ONLY on cases 1 and 2')
  assert.equal(second.json.revision, revBefore, 'idempotent replay does not mutate')
  assert.equal(second.json.status, 'trial')
  assert.equal(second.json.plan, 'trial')

  const row = getRawLicenseRow(machineId)
  assert.equal(row.revision, revBefore, 'no new row / no revision bump in D1 either')
})

test('trial_start_bound_mismatch', async (t) => {
  const machineId = randomMachineId('MISM')
  const realSecret = 'real-secret-value-for-test'
  seedLicenseRow(machineId, {
    status: 'active',
    plan: 'monthly',
    subscriptionUntil: addDaysIso(null, 30),
    deviceSecretHash: sha256hex(realSecret),
    revision: 1
  })

  await t.test('missing secret header', async () => {
    const res = await req('/v1/trial/start', { body: { machineId, appVersion: '3.2.0' } })
    assert.equal(res.status, 403)
    assert.equal(res.json.error, 'device_bound')
    assert.equal(res.json.deviceSecret, undefined)
  })

  await t.test('wrong secret', async () => {
    const res = await req('/v1/trial/start', {
      headers: deviceAuthHeader('totally-wrong-secret'),
      body: { machineId, appVersion: '3.2.0' }
    })
    assert.equal(res.status, 403)
    assert.equal(res.json.error, 'device_bound')
  })

  const row = getRawLicenseRow(machineId)
  assert.equal(row.revision, 1, 'unchanged')
  assert.equal(row.device_secret_hash, sha256hex(realSecret), 'not leaked, not rotated')
})

// ASSUMPTION (flagged in report as an ambiguity): this models the realistic
// tombstone scenario — a row that was ACTIVE, got bound to a device, and was
// later revoked/tombstoned — called WITHOUT the previously-stored secret.
// CONTRACT branch 4 (device_bound) applies literally to a bound row regardless
// of its status. The UNBOUND-revoked variant is a separate, unresolved
// ambiguity: CONTRACT's branch 2 text ("row exists, unbound") is not
// conditioned on status, which would imply a 200 bind-without-retrial even for
// a revoked-but-never-bound row — contradicting the §1.0 "never re-trials"
// principle's spirit. Not asserted here; see report.
test('trial_start_tombstoned', async () => {
  const machineId = randomMachineId('TOMB')
  const oldSecret = 'old-secret-before-tombstone'
  seedLicenseRow(machineId, {
    status: 'revoked',
    plan: 'monthly',
    subscriptionUntil: addDaysIso(null, -5),
    deviceSecretHash: sha256hex(oldSecret),
    notes: 'tombstoned ' + new Date().toISOString(),
    revision: 3
  })

  const res = await req('/v1/trial/start', { body: { machineId, appVersion: '3.2.0' } })
  assert.equal(res.status, 403)
  assert.equal(res.json.error, 'device_bound')

  const row = getRawLicenseRow(machineId)
  assert.equal(row.status, 'revoked', 'no new trial')
  assert.equal(row.revision, 3, 'unchanged')
})

test('trial_start_throttled', async () => {
  const machineId = randomMachineId('THR')
  const first = await req('/v1/trial/start', { body: { machineId, appVersion: '3.2.0' } })
  assert.equal(first.status, 201)
  const secret = first.json.deviceSecret

  // Repeat idempotent (branch-3) calls from the same machine/IP until throttled.
  // CONTRACT: 3/day per machine_id, 5/hour per IP — either cap trips within 8
  // more calls; we intentionally don't assert which bucket fired.
  let last
  let got429 = false
  for (let i = 0; i < 8 && !got429; i++) {
    // eslint-disable-next-line no-await-in-loop -- deliberately sequential to hit the same bucket
    last = await req('/v1/trial/start', {
      headers: deviceAuthHeader(secret),
      body: { machineId, appVersion: '3.2.0' }
    })
    if (last.status === 429) got429 = true
  }
  assert.ok(got429, 'expected a 429 within 8 additional calls to the same machine/IP')
  assert.equal(last.json.error, 'rate_limited')
  assert.ok(last.headers.get('retry-after'), 'Retry-After header must be present on 429')
})
