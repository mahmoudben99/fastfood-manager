import assert from 'node:assert/strict'
import test from 'node:test'
import { generateKeyPairSync, sign as edSign } from 'node:crypto'
import { verifyDeviceAccessToken } from '@/lib/device-token'
import { createProvisionOwnerCredentialHandler } from '@/app/api/owner-credential/provision/_handler'

// ── Ed25519 test key (NOT a production key) ────────────────────────────────────
const { publicKey, privateKey } = generateKeyPairSync('ed25519')
// JWK `x` is the raw 32-byte public key, base64url — exactly the baked-key format.
const TEST_PUB = publicKey.export({ format: 'jwk' }).x

const MACHINE = 'ABC123DEF456'
const NOW_SEC = 1_700_000_000
const now = () => NOW_SEC * 1000

function signArtifact(claims) {
  const payload = Buffer.from(JSON.stringify(claims))
  const sig = edSign(null, payload, privateKey)
  return `${payload.toString('base64url')}.${sig.toString('base64url')}`
}

function accessClaims(overrides = {}) {
  return {
    v: 1,
    kid: 'k1',
    typ: 'access',
    mid: MACHINE,
    plan: 'yearly',
    st: 'active',
    rev: 1,
    iat: NOW_SEC - 60,
    exp: NOW_SEC + 3600,
    ...overrides
  }
}

const bearer = (token) => `Bearer ${token}`
const opts = (extra = {}) => ({ now, publicKeyK1: TEST_PUB, ...extra })

// ── verifyDeviceAccessToken ────────────────────────────────────────────────────

test('device_token_valid_ok', () => {
  const token = signArtifact(accessClaims())
  const result = verifyDeviceAccessToken(bearer(token), MACHINE, opts())
  assert.deepEqual(result, { ok: true, mid: MACHINE, plan: 'yearly', st: 'active' })
})

test('device_token_valid_without_expected_machine', () => {
  const token = signArtifact(accessClaims())
  const result = verifyDeviceAccessToken(bearer(token), undefined, opts())
  assert.equal(result.ok, true)
})

test('device_token_missing_header_rejected', () => {
  assert.equal(verifyDeviceAccessToken(null, MACHINE, opts()).ok, false)
  assert.equal(verifyDeviceAccessToken('', MACHINE, opts()).ok, false)
  assert.equal(verifyDeviceAccessToken(signArtifact(accessClaims()), MACHINE, opts()).ok, false, 'no Bearer scheme')
})

test('device_token_wrong_signature_rejected', () => {
  // Sign with a DIFFERENT key: signature must not verify against TEST_PUB.
  const other = generateKeyPairSync('ed25519')
  const payload = Buffer.from(JSON.stringify(accessClaims()))
  const sig = edSign(null, payload, other.privateKey)
  const forged = `${payload.toString('base64url')}.${sig.toString('base64url')}`
  const result = verifyDeviceAccessToken(bearer(forged), MACHINE, opts())
  assert.deepEqual(result, { ok: false, reason: 'bad_signature' })
})

test('device_token_tampered_payload_rejected', () => {
  const token = signArtifact(accessClaims())
  const [p, s] = token.split('.')
  const tampered = Buffer.from(JSON.stringify(accessClaims({ mid: 'EVIL999' }))).toString('base64url')
  const result = verifyDeviceAccessToken(bearer(`${tampered}.${s}`), 'EVIL999', opts())
  assert.equal(result.ok, false)
  assert.equal(result.reason, 'bad_signature')
  assert.ok(p) // original payload differs from tampered
})

test('device_token_wrong_typ_rejected', () => {
  const token = signArtifact(accessClaims({ typ: 'entitlement' }))
  assert.deepEqual(verifyDeviceAccessToken(bearer(token), MACHINE, opts()), { ok: false, reason: 'wrong_typ' })
})

test('device_token_expired_rejected', () => {
  const token = signArtifact(accessClaims({ iat: NOW_SEC - 7200, exp: NOW_SEC - 3600 }))
  assert.deepEqual(verifyDeviceAccessToken(bearer(token), MACHINE, opts()), { ok: false, reason: 'expired' })
})

test('device_token_small_skew_tolerated', () => {
  // exp 30s in the past is within the 60s skew allowance → still ok.
  const token = signArtifact(accessClaims({ exp: NOW_SEC - 30 }))
  assert.equal(verifyDeviceAccessToken(bearer(token), MACHINE, opts()).ok, true)
})

test('device_token_wrong_machine_rejected', () => {
  const token = signArtifact(accessClaims({ mid: 'OTHER00MACHINE' }))
  assert.deepEqual(verifyDeviceAccessToken(bearer(token), MACHINE, opts()), { ok: false, reason: 'machine_mismatch' })
})

test('device_token_unknown_kid_rejected', () => {
  const token = signArtifact(accessClaims({ kid: 'k2' }))
  assert.deepEqual(verifyDeviceAccessToken(bearer(token), MACHINE, opts()), { ok: false, reason: 'unknown_kid' })
})

test('device_token_machine_compare_is_case_insensitive', () => {
  const token = signArtifact(accessClaims({ mid: MACHINE }))
  assert.equal(verifyDeviceAccessToken(bearer(token), MACHINE.toLowerCase(), opts()).ok, true)
})

// ── provision route (factory with injected deps + REAL Ed25519 verification) ────

function provisionDeps(overrides = {}) {
  const calls = []
  return {
    calls,
    verify: (authorizationHeader, machineId) =>
      verifyDeviceAccessToken(authorizationHeader, machineId, opts()),
    hashCredential: overrides.hashCredential ?? (async (credential) => `bcrypt:${credential}`),
    setOwnerCredential:
      overrides.setOwnerCredential ??
      (async (machineId, credentialHash) => {
        calls.push({ machineId, credentialHash })
      })
  }
}

function provisionRequest({ token, machineId = MACHINE, credential = 'owner-secret-8' } = {}) {
  const headers = { 'content-type': 'application/json' }
  if (token !== null) headers.authorization = bearer(token ?? signArtifact(accessClaims()))
  return new Request('https://admin.example/api/owner-credential/provision', {
    method: 'POST',
    headers,
    body: JSON.stringify({ machineId, credential })
  })
}

test('provision_valid_token_upserts_and_never_echoes', async () => {
  const deps = provisionDeps()
  const handler = createProvisionOwnerCredentialHandler(deps)
  const response = await handler(provisionRequest({ credential: 'strong-owner-pass' }))
  assert.equal(response.status, 200)
  const bodyText = JSON.stringify(await response.json())
  assert.doesNotMatch(bodyText, /strong-owner-pass|bcrypt/i, 'credential/hash must never be echoed')
  assert.equal(deps.calls.length, 1)
  assert.equal(deps.calls[0].machineId, MACHINE)
  assert.equal(deps.calls[0].credentialHash, 'bcrypt:strong-owner-pass')
})

test('provision_no_token_unauthorized', async () => {
  const deps = provisionDeps()
  const handler = createProvisionOwnerCredentialHandler(deps)
  const response = await handler(provisionRequest({ token: null }))
  assert.equal(response.status, 401)
  assert.equal(deps.calls.length, 0, 'must not touch storage when unauthorized')
})

test('provision_wrong_machine_token_unauthorized', async () => {
  const deps = provisionDeps()
  const handler = createProvisionOwnerCredentialHandler(deps)
  // Token bound to a different machine than the body machineId.
  const token = signArtifact(accessClaims({ mid: 'OTHER00MACHINE' }))
  const response = await handler(provisionRequest({ token }))
  assert.equal(response.status, 401)
  assert.equal(deps.calls.length, 0)
})

test('provision_short_credential_rejected_after_auth', async () => {
  const deps = provisionDeps()
  const handler = createProvisionOwnerCredentialHandler(deps)
  const response = await handler(provisionRequest({ credential: 'short' }))
  assert.equal(response.status, 400)
  assert.equal((await response.json()).error, 'invalid_credential')
  assert.equal(deps.calls.length, 0)
})

test('provision_bad_machine_id_rejected', async () => {
  const deps = provisionDeps()
  const handler = createProvisionOwnerCredentialHandler(deps)
  const response = await handler(provisionRequest({ machineId: 'bad id!' }))
  assert.equal(response.status, 400)
  assert.equal((await response.json()).field, 'machineId')
})

test('provision_storage_failure_fails_closed_503', async () => {
  const deps = provisionDeps({
    setOwnerCredential: async () => {
      throw new Error('supabase down')
    }
  })
  const handler = createProvisionOwnerCredentialHandler(deps)
  const response = await handler(provisionRequest())
  assert.equal(response.status, 503)
  assert.equal((await response.json()).error, 'provision_failed')
})
