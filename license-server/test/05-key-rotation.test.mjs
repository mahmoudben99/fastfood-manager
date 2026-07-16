import { test } from 'node:test'
import assert from 'node:assert/strict'
import { req, deviceAuthHeader, randomMachineId } from './helpers/client.mjs'
import { seedLicenseRow, addDaysIso } from './helpers/seed.mjs'
import { sha256hex } from './helpers/hash.mjs'
import { makeEphemeralKeypair, signArtifact, verifyArtifact, TEST_CURRENT } from './helpers/keys.mjs'

// CONTRACT §1.4: the DESKTOP bakes an ordered [CURRENT, PREVIOUS] pubkey array
// and a verifier picks by token `kid`; unknown kid → verification failure.
// Rotation itself is a desktop-side concept (the server always signs with
// exactly one current key) — so "still verifies during transition window" is
// fundamentally a claim about the WIRE FORMAT + verifier logic, not something
// that requires restarting the live worker with a different key mid-suite.
// We therefore test the verifier logic directly (synthetic keys/tokens), and
// separately cross-check that the LIVE server's real current-key output also
// verifies against the fixture's current pubkey (tying it back to the actual
// implementation, not just a synthetic exercise).
test('key_rotation', async (t) => {
  await t.test('token signed with a PREVIOUS kid still verifies when both keys are known', () => {
    const prev = makeEphemeralKeypair('k_prev_synthetic')
    const curr = makeEphemeralKeypair('k_curr_synthetic')
    const now = Math.floor(Date.now() / 1000)
    const payload = {
      v: 1,
      kid: prev.kid,
      typ: 'entitlement',
      mid: 'SYNTHETIC01',
      st: 'active',
      plan: 'monthly',
      sub: null,
      rev: 1,
      iat: now,
      exp: now + 7 * 86_400,
      name: null
    }
    const token = signArtifact(payload, prev.privateKey)
    const knownPubkeys = [
      { kid: curr.kid, publicRawBase64url: curr.publicRawBase64url },
      { kid: prev.kid, publicRawBase64url: prev.publicRawBase64url }
    ]
    const verified = verifyArtifact(token, knownPubkeys)
    assert.equal(verified.kid, prev.kid)
    assert.equal(verified.mid, 'SYNTHETIC01')
  })

  await t.test('token with an unknown kid is rejected', () => {
    const stranger = makeEphemeralKeypair('k_totally_unknown')
    const curr = makeEphemeralKeypair('k_curr_synthetic_2')
    const prev = makeEphemeralKeypair('k_prev_synthetic_2')
    const now = Math.floor(Date.now() / 1000)
    const payload = {
      v: 1,
      kid: stranger.kid,
      typ: 'access',
      mid: 'SYNTHETIC02',
      st: 'active',
      plan: 'monthly',
      sub: null,
      rev: 1,
      iat: now,
      exp: now + 3600
    }
    const token = signArtifact(payload, stranger.privateKey)
    const knownPubkeys = [
      { kid: curr.kid, publicRawBase64url: curr.publicRawBase64url },
      { kid: prev.kid, publicRawBase64url: prev.publicRawBase64url }
    ]
    assert.throws(() => verifyArtifact(token, knownPubkeys), /unknown kid/)
  })

  await t.test('a tampered signature under a KNOWN kid is rejected (sanity check on the verifier itself)', () => {
    const curr = makeEphemeralKeypair('k_curr_synthetic_3')
    const now = Math.floor(Date.now() / 1000)
    const payload = { v: 1, kid: curr.kid, typ: 'access', mid: 'SYNTHETIC03', st: 'active', plan: null, sub: null, rev: 1, iat: now, exp: now + 3600 }
    const token = signArtifact(payload, curr.privateKey)
    const [payloadPart] = token.split('.')
    const tampered = `${payloadPart}.${Buffer.alloc(64, 1).toString('base64url')}`
    const knownPubkeys = [{ kid: curr.kid, publicRawBase64url: curr.publicRawBase64url }]
    assert.throws(() => verifyArtifact(tampered, knownPubkeys), /signature verification failed/)
  })

  await t.test('cross-check: the LIVE server currently signs with the configured fixture key', async () => {
    const machineId = randomMachineId('KROT')
    const secret = 'secret-for-key-rotation-crosscheck'
    seedLicenseRow(machineId, {
      status: 'active',
      plan: 'monthly',
      subscriptionUntil: addDaysIso(null, 30),
      deviceSecretHash: sha256hex(secret),
      revision: 1
    })
    const res = await req('/v1/license/check', {
      headers: deviceAuthHeader(secret),
      body: { machineId, appVersion: '3.2.0' }
    })
    assert.equal(res.status, 200)
    // verifyArtifact()'s default knownPubkeys already includes TEST_CURRENT + TEST_PREVIOUS.
    const claims = verifyArtifact(res.json.accessToken)
    assert.equal(claims.kid, TEST_CURRENT.kid, 'server must sign with LICENSE_KID matching .dev.vars (see test/README.md)')
  })
})
