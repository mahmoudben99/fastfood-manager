import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import { req, adminAuthHeader, deviceAuthHeader, randomMachineId } from './helpers/client.mjs'
import { seedLicenseRow, addDaysIso, resetRateLimits } from './helpers/seed.mjs'
import { sha256hex } from './helpers/hash.mjs'
import { verifyArtifact } from './helpers/keys.mjs'

// Defensive isolation from other files' throttle tests (cheap insurance; /check's
// own throttle is per-machine per CONTRACT, so cross-test pollution shouldn't
// happen anyway as long as every test below uses a fresh machineId).
before(async () => {
  resetRateLimits()
})

// CONTRACT §1.5 POST /v1/license/check — read-only; requires device credential.
test('check_readonly_unknown', async () => {
  const machineId = randomMachineId('UNK')
  const res = await req('/v1/license/check', {
    headers: deviceAuthHeader('any-secret-value'),
    body: { machineId, appVersion: '3.2.0' }
  })
  assert.equal(res.status, 404)
  assert.equal(res.json.error, 'not_found')

  const getRes = await req('/v1/admin/get', { headers: adminAuthHeader(), body: { machineId } })
  assert.equal(getRes.status, 404, '/check on an unknown machine must never create a row')
})

test('check_unbound', async () => {
  const machineId = randomMachineId('UNBC')
  seedLicenseRow(machineId, { status: 'trial', plan: 'trial', subscriptionUntil: addDaysIso(null, 7) })

  // No Device header: this machine has never completed /trial/start binding.
  const res = await req('/v1/license/check', { body: { machineId, appVersion: '3.2.0' } })
  assert.equal(res.status, 401)
  assert.equal(res.json.error, 'unauthorized')
  assert.equal(res.json.enroll, true)
  assert.equal(res.json.accessToken, undefined)
  assert.equal(res.json.entitlement, undefined)
})

test('check_bound_active', async () => {
  const machineId = randomMachineId('ACT')
  const secret = 'known-secret-for-check-active'
  const subUntil = addDaysIso(null, 45)
  seedLicenseRow(machineId, {
    status: 'active',
    plan: 'monthly',
    subscriptionUntil: subUntil,
    deviceSecretHash: sha256hex(secret),
    restaurantName: 'Test Diner',
    revision: 1
  })

  const res = await req('/v1/license/check', {
    headers: deviceAuthHeader(secret),
    body: { machineId, appVersion: '3.2.0' }
  })
  assert.equal(res.status, 200)
  const b = res.json
  assert.equal(b.status, 'active')
  assert.equal(b.plan, 'monthly')
  assert.equal(b.subscriptionUntil, subUntil)
  assert.equal(b.revision, 1, '/check never bumps revision (telemetry-only writes)')
  assert.equal(typeof b.serverTime, 'number')

  const nowSec = Math.floor(Date.now() / 1000)
  for (const [artifact, expectedTyp] of [
    [b.accessToken, 'access'],
    [b.entitlement, 'entitlement']
  ]) {
    const claims = verifyArtifact(artifact)
    assert.equal(claims.v, 1)
    assert.equal(typeof claims.kid, 'string')
    assert.ok(claims.kid.length > 0)
    assert.equal(claims.typ, expectedTyp)
    assert.equal(claims.mid, machineId)
    assert.equal(claims.st, 'active')
    assert.equal(claims.plan, 'monthly')
    assert.equal(claims.sub, subUntil)
    assert.equal(claims.rev, 1)
    assert.equal(typeof claims.iat, 'number')
    assert.ok(Math.abs(claims.iat - nowSec) < 10, 'iat is server clock')
    assert.equal(typeof claims.exp, 'number')
    assert.equal(claims.name, 'Test Diner')
  }

  const accessClaims = verifyArtifact(b.accessToken)
  assert.ok(accessClaims.exp - accessClaims.iat > 0)
  assert.ok(accessClaims.exp - accessClaims.iat <= 3600 + 120, 'access token exp-iat <= 1h + skew tolerance')

  const ttlDays = Number(process.env.TEST_TOKEN_TTL_DAYS || 7)
  const entClaims = verifyArtifact(b.entitlement)
  assert.equal(entClaims.exp - entClaims.iat, ttlDays * 86_400, 'entitlement exp-iat = TOKEN_TTL_DAYS (default 7)')
})

// ASSUMPTION (flagged in report): CONTRACT's enumerated /check error codes
// (404/401/403) don't include a distinct "revoked" error. A known + bound +
// secret-matching row therefore falls through to the 200 success path with
// st:'revoked' carried in both signed artifacts — it's the DESKTOP verifier
// that locks on st:'revoked' (§1.3 monotonic-floor rules), not the server
// refusing the call. This contradicts the brief's own phrasing ("no
// artifacts") for this test; orchestrator should confirm before freezing.
test('check_revoked', async () => {
  const machineId = randomMachineId('REV')
  const secret = 'secret-for-revoked-machine'
  seedLicenseRow(machineId, {
    status: 'revoked',
    plan: 'monthly',
    subscriptionUntil: addDaysIso(null, 30),
    deviceSecretHash: sha256hex(secret),
    revision: 5
  })

  const res = await req('/v1/license/check', {
    headers: deviceAuthHeader(secret),
    body: { machineId, appVersion: '3.2.0' }
  })
  assert.equal(res.status, 200)
  assert.equal(res.json.status, 'revoked')
  const claims = verifyArtifact(res.json.accessToken)
  assert.equal(claims.st, 'revoked')
  const entClaims = verifyArtifact(res.json.entitlement)
  assert.equal(entClaims.st, 'revoked')
})

test('expired_paid', async () => {
  const machineId = randomMachineId('EXP')
  const secret = 'secret-for-expired-machine'
  const pastSub = addDaysIso(null, -10)
  seedLicenseRow(machineId, {
    status: 'active',
    plan: 'monthly',
    subscriptionUntil: pastSub,
    deviceSecretHash: sha256hex(secret),
    revision: 2
  })

  const res = await req('/v1/license/check', {
    headers: deviceAuthHeader(secret),
    body: { machineId, appVersion: '3.2.0' }
  })
  assert.equal(res.status, 200)
  assert.equal(res.json.status, 'expired', 'effective() derives expired from a past subscription_until')
  const claims = verifyArtifact(res.json.accessToken)
  assert.equal(claims.st, 'expired')
  const entClaims = verifyArtifact(res.json.entitlement)
  assert.equal(entClaims.st, 'expired')
})

test('clock_authority', async () => {
  const machineId = randomMachineId('CLK')
  const secret = 'secret-for-clock-test'
  seedLicenseRow(machineId, {
    status: 'active',
    plan: 'monthly',
    subscriptionUntil: addDaysIso(null, 30),
    deviceSecretHash: sha256hex(secret),
    revision: 1
  })

  const bogusPast = 1 // 1970-01-01
  const bogusFuture = 9_999_999_999 // year 2286
  const res = await req('/v1/license/check', {
    headers: deviceAuthHeader(secret),
    body: {
      machineId,
      appVersion: '3.2.0',
      iat: bogusFuture,
      timestamp: bogusPast,
      now: bogusFuture,
      clientTime: '2000-01-01T00:00:00Z'
    }
  })
  assert.equal(res.status, 200)
  const claims = verifyArtifact(res.json.accessToken)
  const nowSec = Math.floor(Date.now() / 1000)
  assert.ok(Math.abs(claims.iat - nowSec) < 10, 'iat must be the SERVER clock, not any client-supplied value')
  assert.notEqual(claims.iat, bogusFuture)
  assert.notEqual(claims.iat, bogusPast)
})
