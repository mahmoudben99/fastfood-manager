import { createPrivateKey, sign } from 'node:crypto'
import { createServer } from 'node:http'
import { TEST_KID, TEST_PRIVATE_KEY } from './keys.mjs'

export const TEST_MACHINE_ID = 'ABC123DEF456'
export const TEST_DEVICE_SECRET = 'test-device-secret-base64url-value'

export function signedArtifact(claims, { privateKey = TEST_PRIVATE_KEY } = {}) {
  const payload = Buffer.from(JSON.stringify(claims))
  const signature = sign(null, payload, createPrivateKey(privateKey))
  return `${payload.toString('base64url')}.${signature.toString('base64url')}`
}

export function entitlement({
  mid = TEST_MACHINE_ID,
  st = 'active',
  plan = 'yearly',
  sub = '2030-01-01T00:00:00.000Z',
  iat = 1_700_000_000,
  exp = iat + 7 * 86_400,
  rev = 1,
  kid = TEST_KID,
  ...rest
} = {}) {
  return signedArtifact({ v: 1, kid, typ: 'entitlement', mid, st, plan, sub, rev, name: null, iat, exp, ...rest })
}

export function accessToken({ iat = 1_700_000_000, ...rest } = {}) {
  return signedArtifact({
    v: 1, kid: TEST_KID, typ: 'access', mid: TEST_MACHINE_ID, st: 'active', plan: 'yearly',
    sub: '2030-01-01T00:00:00.000Z', rev: 1, name: null, iat, exp: iat + 3600, ...rest
  })
}

export function successfulCheck(overrides = {}) {
  const token = overrides.entitlement ?? entitlement(overrides.claims)
  return {
    status: 200,
    body: {
      accessToken: overrides.accessToken ?? accessToken(overrides.claims),
      entitlement: token,
      status: overrides.status ?? 'active',
      plan: overrides.plan ?? 'yearly',
      subscriptionUntil: overrides.subscriptionUntil ?? '2030-01-01T00:00:00.000Z',
      revision: overrides.revision ?? 1,
      serverTime: overrides.serverTime ?? 1_700_000_000
    }
  }
}

/** A controllable local HTTP server implementing only the contracted desktop routes. */
export async function createFakeLicenseServer() {
  const calls = []
  const state = {
    check: () => successfulCheck(),
    start: () => ({ status: 201, body: { ...successfulCheck().body, deviceSecret: TEST_DEVICE_SECRET } })
  }
  const server = createServer(async (req, res) => {
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    let body
    try { body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : undefined } catch { body = undefined }
    const call = { method: req.method, path: new URL(req.url, 'http://fixture').pathname, headers: req.headers, body }
    calls.push(call)
    const handler = call.path === '/v1/license/check' ? state.check : call.path === '/v1/trial/start' ? state.start : null
    const reply = handler ? await handler(call) : { status: 404, body: { error: 'not_found' } }
    res.writeHead(reply.status, { 'content-type': 'application/json', ...(reply.headers ?? {}) })
    res.end(JSON.stringify(reply.body))
  })
  await new Promise((resolve, reject) => server.listen(0, '127.0.0.1', (error) => error ? reject(error) : resolve()))
  const { port } = server.address()
  return {
    url: `http://127.0.0.1:${port}`,
    calls,
    setCheck(handler) { state.check = typeof handler === 'function' ? handler : () => handler },
    setStart(handler) { state.start = typeof handler === 'function' ? handler : () => handler },
    close: () => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  }
}
