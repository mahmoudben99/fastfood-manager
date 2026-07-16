import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import { req, adminAuthHeader, deviceAuthHeader, randomMachineId } from './helpers/client.mjs'
import { seedLicenseRow, getRawLicenseRow, addDaysIso, resetRateLimits, countAdminLog } from './helpers/seed.mjs'
import { sha256hex } from './helpers/hash.mjs'
import { verifyArtifact } from './helpers/keys.mjs'

// This file makes a handful of /v1/trial/start calls (tombstone + rebind
// scenarios); reset once up front so a previous file's throttle test doesn't
// bleed into this one.
before(async () => {
  resetRateLimits()
})

test('revision_monotonic', async () => {
  const machineId = randomMachineId('REVM')
  const secret = 'secret-for-revision-monotonic'
  seedLicenseRow(machineId, {
    status: 'active',
    plan: 'monthly',
    subscriptionUntil: addDaysIso(null, 30),
    deviceSecretHash: sha256hex(secret),
    revision: 1
  })

  const check0 = await req('/v1/license/check', {
    headers: deviceAuthHeader(secret),
    body: { machineId, appVersion: '3.2.0' }
  })
  const rev0 = verifyArtifact(check0.json.accessToken).rev
  assert.equal(rev0, 1)

  const mutate1 = await req('/v1/admin/mutate', {
    headers: adminAuthHeader(),
    body: { machineId, action: 'extend', days: 5 }
  })
  assert.equal(mutate1.status, 200)
  const rev1 = mutate1.json.license.revision
  assert.ok(rev1 > rev0, 'admin mutation must bump revision')

  const check1 = await req('/v1/license/check', {
    headers: deviceAuthHeader(secret),
    body: { machineId, appVersion: '3.2.0' }
  })
  const rev1FromToken = verifyArtifact(check1.json.accessToken).rev
  assert.equal(rev1FromToken, rev1, 'a newly-issued token carries the just-bumped revision')

  const mutate2 = await req('/v1/admin/mutate', {
    headers: adminAuthHeader(),
    body: { machineId, action: 'revoke' }
  })
  assert.equal(mutate2.status, 200)
  const rev2 = mutate2.json.license.revision
  assert.ok(rev2 > rev1, 'a second mutation bumps again (strictly increasing)')

  // NOTE: `setInfo` is CONTRACT's one documented exception ("no revision bump
  // required, still audited") — deliberately not used here so the "strictly
  // increasing" assertion above is unambiguous.
})

test('admin_auth_required', async (t) => {
  const machineId = randomMachineId('AUTH')
  const endpoints = [
    ['/v1/admin/list', {}],
    ['/v1/admin/get', { machineId }],
    ['/v1/admin/mutate', { machineId, action: 'setInfo', notes: 'x' }]
  ]

  for (const [path, body] of endpoints) {
    await t.test(`${path} — missing bearer`, async () => {
      const res = await req(path, { body })
      assert.equal(res.status, 401)
      assert.equal(res.json.error, 'unauthorized')
    })
    await t.test(`${path} — wrong bearer`, async () => {
      const res = await req(path, { headers: adminAuthHeader('definitely-the-wrong-admin-key'), body })
      // CONTRACT's global error semantics: 401 unauthorized covers BOTH missing
      // and invalid admin bearer keys; 403 is reserved for device_bound only.
      assert.equal(res.status, 401)
      assert.equal(res.json.error, 'unauthorized')
    })
  }
})

// ASSUMPTION: admin/list, admin/get, admin/mutate responses spread the raw D1
// row ("...finalRow" per CONTRACT §1.5), i.e. snake_case column names
// (subscription_until, restaurant_name, ...), NOT the camelCase used by
// /trial/start and /check. If the implementer instead camelCases admin
// responses, these field-name assertions (not the underlying behavior) need
// adjusting — flagged in the report.
test('admin_mutate_atomic', async (t) => {
  await t.test('setPlan: date-only until → normalized to end-of-day Africa/Algiers', async () => {
    const machineId = randomMachineId('SPU')
    seedLicenseRow(machineId, { status: 'trial', plan: 'trial', revision: 1 })
    const before1 = countAdminLog(machineId, 'setPlan')
    const res = await req('/v1/admin/mutate', {
      headers: adminAuthHeader(),
      body: { machineId, action: 'setPlan', plan: 'monthly', until: '2026-08-15' }
    })
    assert.equal(res.status, 200)
    assert.equal(res.json.license.status, 'active')
    assert.equal(res.json.license.plan, 'monthly')
    // Africa/Algiers is fixed UTC+1 (no DST): end-of-day 2026-08-15 local = 22:59:59.999Z
    assert.equal(res.json.license.subscription_until, '2026-08-15T22:59:59.999Z')
    assert.equal(countAdminLog(machineId, 'setPlan'), before1 + 1, 'exactly one admin_log row')
  })

  await t.test('setPlan: days → ~now+days', async () => {
    const machineId = randomMachineId('SPD')
    seedLicenseRow(machineId, { status: 'trial', plan: 'trial', revision: 1 })
    const res = await req('/v1/admin/mutate', {
      headers: adminAuthHeader(),
      body: { machineId, action: 'setPlan', plan: 'yearly', days: 365 }
    })
    assert.equal(res.status, 200)
    assert.equal(res.json.license.plan, 'yearly')
    const diffMs = new Date(res.json.license.subscription_until).getTime() - Date.now()
    assert.ok(Math.abs(diffMs - 365 * 86_400_000) < 120_000)
  })

  await t.test('setPlan: lifetime forces subscription_until NULL (even if until/days given)', async () => {
    const machineId = randomMachineId('SPL')
    seedLicenseRow(machineId, { status: 'trial', plan: 'trial', revision: 1 })
    const res = await req('/v1/admin/mutate', {
      headers: adminAuthHeader(),
      body: { machineId, action: 'setPlan', plan: 'lifetime', until: '2026-01-01' }
    })
    assert.equal(res.status, 200)
    assert.equal(res.json.license.plan, 'lifetime')
    assert.equal(res.json.license.subscription_until, null)
  })

  await t.test('setPlan: both until and days → 400 bad_input (XOR)', async () => {
    const machineId = randomMachineId('SPX')
    seedLicenseRow(machineId, { status: 'trial', plan: 'trial', revision: 1 })
    const res = await req('/v1/admin/mutate', {
      headers: adminAuthHeader(),
      body: { machineId, action: 'setPlan', plan: 'monthly', until: '2026-08-15', days: 30 }
    })
    assert.equal(res.status, 400)
    assert.equal(res.json.error, 'bad_input')
  })

  await t.test('setPlan: neither until nor days (non-lifetime) → 400 bad_input', async () => {
    const machineId = randomMachineId('SPN')
    seedLicenseRow(machineId, { status: 'trial', plan: 'trial', revision: 1 })
    const res = await req('/v1/admin/mutate', {
      headers: adminAuthHeader(),
      body: { machineId, action: 'setPlan', plan: 'monthly' }
    })
    assert.equal(res.status, 400)
    assert.equal(res.json.error, 'bad_input')
  })

  await t.test('setPlan: unparsable until → 400 bad_input, never Date.parse leniency (fixes F005)', async () => {
    const machineId = randomMachineId('SPG')
    seedLicenseRow(machineId, { status: 'trial', plan: 'trial', revision: 1 })
    const res = await req('/v1/admin/mutate', {
      headers: adminAuthHeader(),
      body: { machineId, action: 'setPlan', plan: 'monthly', until: '31/12/2026' }
    })
    assert.equal(res.status, 400)
    assert.equal(res.json.error, 'bad_input')
  })

  await t.test('extend: pushes from later(now, current subscription_until)', async () => {
    const machineId = randomMachineId('EXT')
    const currentSub = addDaysIso(null, 10)
    seedLicenseRow(machineId, { status: 'active', plan: 'monthly', subscriptionUntil: currentSub, revision: 1 })
    const before1 = countAdminLog(machineId, 'extend')
    const res = await req('/v1/admin/mutate', {
      headers: adminAuthHeader(),
      body: { machineId, action: 'extend', days: 5 }
    })
    assert.equal(res.status, 200)
    assert.equal(res.json.license.status, 'active')
    assert.equal(res.json.license.subscription_until, addDaysIso(currentSub, 5))
    assert.equal(countAdminLog(machineId, 'extend'), before1 + 1)
  })

  await t.test('extend: days == 0 → rejected', async () => {
    const machineId = randomMachineId('EXTZ')
    seedLicenseRow(machineId, { status: 'active', plan: 'monthly', subscriptionUntil: addDaysIso(null, 10), revision: 1 })
    const res = await req('/v1/admin/mutate', {
      headers: adminAuthHeader(),
      body: { machineId, action: 'extend', days: 0 }
    })
    assert.equal(res.status, 400)
  })

  await t.test('revoke: hard kill, overrides everything', async () => {
    const machineId = randomMachineId('RVK')
    seedLicenseRow(machineId, { status: 'active', plan: 'lifetime', subscriptionUntil: null, revision: 1 })
    const before1 = countAdminLog(machineId, 'revoke')
    const res = await req('/v1/admin/mutate', {
      headers: adminAuthHeader(),
      body: { machineId, action: 'revoke' }
    })
    assert.equal(res.status, 200)
    assert.equal(res.json.license.status, 'revoked')
    assert.equal(res.json.license.effective, 'revoked')
    assert.equal(countAdminLog(machineId, 'revoke'), before1 + 1)
  })

  await t.test('grantTrial: the only re-trial path for an existing row', async () => {
    const machineId = randomMachineId('GT')
    seedLicenseRow(machineId, { status: 'revoked', plan: 'monthly', subscriptionUntil: addDaysIso(null, -30), revision: 4 })
    const res = await req('/v1/admin/mutate', {
      headers: adminAuthHeader(),
      body: { machineId, action: 'grantTrial', days: 3 }
    })
    assert.equal(res.status, 200)
    assert.equal(res.json.license.status, 'trial')
    assert.equal(res.json.license.plan, 'trial')
    const diffMs = new Date(res.json.license.subscription_until).getTime() - Date.now()
    assert.ok(Math.abs(diffMs - 3 * 86_400_000) < 120_000)
  })

  await t.test('reinstate: WITHOUT days on a lapsed non-lifetime plan → 409 bad_state, no resurrection', async () => {
    const machineId = randomMachineId('REIN1')
    const pastSub = addDaysIso(null, -20)
    seedLicenseRow(machineId, { status: 'expired', plan: 'monthly', subscriptionUntil: pastSub, revision: 2 })
    const beforeLog = countAdminLog(machineId, 'reinstate')
    const res = await req('/v1/admin/mutate', {
      headers: adminAuthHeader(),
      body: { machineId, action: 'reinstate' }
    })
    assert.equal(res.status, 409)
    assert.equal(res.json.error, 'bad_state')
    const row = getRawLicenseRow(machineId)
    assert.equal(row.subscription_until, pastSub, 'rejected transition must not mutate the row')
    assert.equal(row.revision, 2, 'rejected transition must not bump revision')
    assert.equal(countAdminLog(machineId, 'reinstate'), beforeLog, 'no audit row for a rejected mutation')
  })

  await t.test('reinstate: WITH days extends from now, never resurrects the past date', async () => {
    const machineId = randomMachineId('REIN2')
    const pastSub = addDaysIso(null, -20)
    seedLicenseRow(machineId, { status: 'expired', plan: 'monthly', subscriptionUntil: pastSub, revision: 2 })
    const res = await req('/v1/admin/mutate', {
      headers: adminAuthHeader(),
      body: { machineId, action: 'reinstate', days: 30 }
    })
    assert.equal(res.status, 200)
    assert.equal(res.json.license.status, 'active')
    const subVal = res.json.license.subscription_until
    assert.ok(new Date(subVal).getTime() > Date.now(), 'must be in the future, never the resurrected past value')
    assert.notEqual(subVal, pastSub)
  })

  await t.test('rebindDevice: clears the hash; old secret rejected afterwards', async () => {
    const machineId = randomMachineId('RBM')
    const oldSecret = 'old-secret-for-mutate-rebind'
    seedLicenseRow(machineId, {
      status: 'active',
      plan: 'monthly',
      subscriptionUntil: addDaysIso(null, 30),
      deviceSecretHash: sha256hex(oldSecret),
      revision: 1
    })
    const before1 = countAdminLog(machineId, 'rebindDevice')
    const res = await req('/v1/admin/mutate', {
      headers: adminAuthHeader(),
      body: { machineId, action: 'rebindDevice' }
    })
    assert.equal(res.status, 200)
    assert.equal(countAdminLog(machineId, 'rebindDevice'), before1 + 1)

    const checkOld = await req('/v1/license/check', {
      headers: deviceAuthHeader(oldSecret),
      body: { machineId, appVersion: '3.2.0' }
    })
    assert.equal(checkOld.status, 401, 'old secret now reads as "unbound", not "mismatched"')
    assert.equal(checkOld.json.enroll, true)
  })
})

test('admin_tombstone_not_delete', async () => {
  const machineId = randomMachineId('TMB2')
  const secret = 'secret-for-tombstone-test'
  seedLicenseRow(machineId, {
    status: 'active',
    plan: 'monthly',
    subscriptionUntil: addDaysIso(null, 30),
    deviceSecretHash: sha256hex(secret),
    revision: 1
  })

  const res = await req('/v1/admin/mutate', { headers: adminAuthHeader(), body: { machineId, action: 'tombstone' } })
  assert.equal(res.status, 200)
  assert.equal(res.json.license.status, 'revoked')
  assert.ok(String(res.json.license.notes || '').includes('tombstoned'), 'notes record the tombstone')

  // Row is RETAINED — there is no delete action.
  const getRes = await req('/v1/admin/get', { headers: adminAuthHeader(), body: { machineId } })
  assert.equal(getRes.status, 200)
  assert.equal(getRes.json.license.status, 'revoked')

  // Bound + tombstoned: subsequent /trial/start without the secret never re-trials.
  const startRes = await req('/v1/trial/start', { body: { machineId, appVersion: '3.2.0' } })
  assert.equal(startRes.status, 403)
  assert.equal(startRes.json.error, 'device_bound')
})

test('rebind_device', async () => {
  const machineId = randomMachineId('RBD')
  const oldSecret = 'old-secret-for-rebind-device'
  seedLicenseRow(machineId, {
    status: 'active',
    plan: 'monthly',
    subscriptionUntil: addDaysIso(null, 60),
    deviceSecretHash: sha256hex(oldSecret),
    revision: 1
  })

  const before1 = countAdminLog(machineId, 'rebindDevice')
  const mutateRes = await req('/v1/admin/mutate', {
    headers: adminAuthHeader(),
    body: { machineId, action: 'rebindDevice' }
  })
  assert.equal(mutateRes.status, 200)
  assert.equal(countAdminLog(machineId, 'rebindDevice'), before1 + 1, 'audited')

  const checkOld = await req('/v1/license/check', {
    headers: deviceAuthHeader(oldSecret),
    body: { machineId, appVersion: '3.2.0' }
  })
  assert.equal(checkOld.status, 401)
  assert.equal(checkOld.json.enroll, true)

  // Loss/reinstall recovery (§1.2): next /trial/start re-binds without changing plan/status.
  const startRes = await req('/v1/trial/start', { body: { machineId, appVersion: '3.2.0' } })
  assert.equal(startRes.status, 200)
  assert.equal(typeof startRes.json.deviceSecret, 'string')
  const newSecret = startRes.json.deviceSecret
  assert.notEqual(newSecret, oldSecret)
  assert.equal(startRes.json.status, 'active')
  assert.equal(startRes.json.plan, 'monthly')

  const checkNew = await req('/v1/license/check', {
    headers: deviceAuthHeader(newSecret),
    body: { machineId, appVersion: '3.2.0' }
  })
  assert.equal(checkNew.status, 200)
  assert.equal(checkNew.json.status, 'active')
})
