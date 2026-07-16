import assert from 'node:assert/strict'
import test from 'node:test'
// Pure schedule logic reused from production (admin/lib/rate-limit.ts) so the mock's atomic
// `takeThrottleAttempt` enforces the exact same 60s->doubling->3600s backoff the handler and the
// production Postgres RPC (supabase/migrations/0005_owner_auth.sql) are both required to.
import { isLocked, nextRowAfterFailure, retryAfterSeconds } from '@/lib/rate-limit'

const APP_ORIGIN = 'https://admin.example.test'
const ADMIN_ROOT = new URL('../../', import.meta.url)
const routeUrl = path => new URL(path, path.startsWith('../../') ? import.meta.url : ADMIN_ROOT).href

async function route(path, requiredExport) {
  const module = await import(routeUrl(path))
  assert.equal(
    typeof module[requiredExport],
    'function',
    `Missing required ${requiredExport} export. See admin/tests/auth/auth.contract.d.ts.`,
  )
  return module
}

function request(path, { method = 'GET', body, headers = {} } = {}) {
  const finalHeaders = new Headers(headers)
  if (body !== undefined && !finalHeaders.has('content-type')) finalHeaders.set('content-type', 'application/json')
  return new Request(`${APP_ORIGIN}${path}`, {
    method,
    headers: finalHeaders,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

async function json(response) {
  return response.json()
}

function createMockedSupabaseClient({ credential = { credential_hash: 'bcrypt:remote-owner-secret' }, dataError = false, statsError = false } = {}) {
  const calls = []
  const throttle = new Map()
  const key = (scope, value) => `${scope}:${value}`
  return {
    calls,
    throttle,
    async getOwnerCredential(machineId) {
      calls.push({ operation: 'select', table: 'owner_credentials', machineId })
      return credential
    },
    // Atomic (single-round-trip) reservation across BOTH scopes, gating BEFORE any credential
    // comparison — mirrors the production `owner_auth_throttle_take` Postgres RPC (which is what
    // makes this safe under real concurrency; here it just needs to be behaviorally faithful).
    async takeThrottleAttempt(machineKey, ipKey, now) {
      calls.push({ operation: 'rpc', table: 'auth_throttle', machineKey, ipKey })
      const machinePrev = throttle.get(key('machine', machineKey)) ?? null
      const ipPrev = throttle.get(key('ip', ipKey)) ?? null
      const machineLocked = isLocked(machinePrev, now)
      const ipLocked = isLocked(ipPrev, now)
      if (machineLocked || ipLocked) {
        const retry = Math.max(
          machineLocked ? retryAfterSeconds(machinePrev, now) : 0,
          ipLocked ? retryAfterSeconds(ipPrev, now) : 0,
        )
        return {
          allowed: false,
          retryAfterSeconds: retry,
          machine: machinePrev ?? { scope: 'machine', key: machineKey, failureCount: 0, lockedUntil: null },
          ip: ipPrev ?? { scope: 'ip', key: ipKey, failureCount: 0, lockedUntil: null },
        }
      }
      const machineNext = nextRowAfterFailure(machinePrev, 'machine', machineKey, now)
      const ipNext = nextRowAfterFailure(ipPrev, 'ip', ipKey, now)
      throttle.set(key('machine', machineKey), machineNext)
      throttle.set(key('ip', ipKey), ipNext)
      return { allowed: true, retryAfterSeconds: 0, machine: machineNext, ip: ipNext }
    },
    async clearThrottle(scope, value) {
      calls.push({ operation: 'delete', table: 'auth_throttle', scope, key: value })
      throttle.delete(key(scope, value))
    },
    async queryOwnerData(machineId, date) {
      calls.push({ operation: 'select', table: 'owner_orders', machineId, date })
      if (dataError) throw new Error('Supabase unavailable')
      return { orders: [], stats: { totalRevenue: 0, orderCount: 0, avgOrder: 0 }, popularItems: [], currency: 'DA' }
    },
    async queryOwnerStats(machineId, period) {
      calls.push({ operation: 'select', table: 'daily_stats', machineId, period })
      if (statsError) throw new Error('Supabase unavailable')
      return { days: [] }
    },
  }
}

function dependencies(overrides = {}) {
  const now = overrides.now ?? (() => new Date('2030-01-01T00:00:00.000Z'))
  return {
    appOrigin: APP_ORIGIN,
    supabase: overrides.supabase ?? createMockedSupabaseClient(),
    now,
    compareCredential: overrides.compareCredential ?? ((credential, hash) => credential === 'correct-credential' && hash.startsWith('bcrypt:')),
    createOwnerSession: overrides.createOwnerSession ?? (async machineId => `owner-token-for-${machineId}`),
    ownerCookieName: overrides.ownerCookieName ?? (machineId => `ffm_owner_session_${machineId}`),
    getOwnerSessionToken: overrides.getOwnerSessionToken ?? (() => 'owner-token'),
    verifyOwnerSession: overrides.verifyOwnerSession ?? (async (_token, machineId) => ({ ok: true, machineId })),
  }
}

function clientIpHeaders() {
  return { origin: APP_ORIGIN, 'x-forwarded-for': '203.0.113.25' }
}

async function verifyHandler(deps) {
  const module = await route('../../lib/owner-auth.ts', 'createVerifyOwnerCredentialHandler')
  return module.createVerifyOwnerCredentialHandler(deps)
}

async function dataHandler(deps) {
  const module = await route('../../lib/owner-auth.ts', 'createOwnerDataHandler')
  return module.createOwnerDataHandler(deps)
}

async function statsHandler(deps) {
  const module = await route('../../lib/owner-auth.ts', 'createOwnerStatsHandler')
  return module.createOwnerStatsHandler(deps)
}

test('credential_min_length', async () => {
  const deps = dependencies()
  const handler = await verifyHandler(deps)
  const response = await handler(request('/api/owner/verify-pin', {
    method: 'POST', headers: clientIpHeaders(), body: { machineId: 'machine-a', credential: 'short' },
  }))
  assert.equal(response.status, 400)
  assert.equal(deps.supabase.calls.length, 0, 'short credentials must be rejected before storage or hashing')
})

test('credential_never_returned', async () => {
  let comparedHash
  const deps = dependencies({
    compareCredential: (credential, hash) => {
      comparedHash = hash
      return credential === 'correct-credential' && hash === 'bcrypt:remote-owner-secret'
    },
  })
  const handler = await verifyHandler(deps)
  const supplied = 'correct-credential'
  const response = await handler(request('/api/owner/verify-pin', {
    method: 'POST', headers: clientIpHeaders(), body: { machineId: 'machine-a', credential: supplied },
  }))
  assert.equal(response.status, 200)
  assert.equal(comparedHash, 'bcrypt:remote-owner-secret', 'the verifier must receive the stored credential hash, never a PIN')
  const body = JSON.stringify(await json(response))
  assert.doesNotMatch(body, /credential|bcrypt|correct-credential/i)
  assert.ok(deps.supabase.calls.some(call => call.table === 'owner_credentials'), 'credential lookup must use owner_credentials')
})

test('setup_required_before_credential', async () => {
  const deps = dependencies({ supabase: createMockedSupabaseClient({ credential: null }) })
  const handler = await dataHandler(deps)
  const response = await handler(request('/api/owner/data?machineId=machine-a'))
  assert.equal(response.status, 403)
  assert.equal((await json(response)).error, 'setup_required')
})

test('no_pin_fallback', async () => {
  const deps = dependencies({ supabase: createMockedSupabaseClient({ credential: null }) })
  const handler = await verifyHandler(deps)
  const response = await handler(request('/api/owner/verify-pin', {
    method: 'POST', headers: clientIpHeaders(), body: { machineId: 'machine-a', pin: '1234' },
  }))
  assert.notEqual(response.status, 200)
  assert.equal(deps.supabase.calls.some(call => call.table === 'owner_pins'), false, 'remote owner auth must never read owner_pins')
})

test('throttle_backoff_429', async () => {
  const now = new Date('2030-01-01T00:00:00.000Z')
  const deps = dependencies({ now: () => now, compareCredential: () => false })
  const handler = await verifyHandler(deps)
  for (let i = 0; i < 3; i += 1) {
    const response = await handler(request('/api/owner/verify-pin', {
      method: 'POST', headers: clientIpHeaders(), body: { machineId: 'machine-a', credential: 'incorrect-credential' },
    }))
    assert.equal(response.status, 401)
  }
  const locked = await handler(request('/api/owner/verify-pin', {
    method: 'POST', headers: clientIpHeaders(), body: { machineId: 'machine-a', credential: 'incorrect-credential' },
  }))
  assert.equal(locked.status, 429)
  assert.equal(locked.headers.get('retry-after'), '60')
  // REVISION 2 (see auth.contract.d.ts): the gate is one atomic reservation covering both
  // scopes, called once per attempt (not a separate read + a separate write) — so the durability
  // proof is that both scopes' counters actually reached the failure threshold, not a raw write
  // count against a now-retired `saveThrottle`.
  const attempts = deps.supabase.calls.filter(call => call.operation === 'rpc' && call.table === 'auth_throttle')
  assert.ok(attempts.length >= 4, 'the atomic throttle reservation must be consulted on every attempt, including the locked one')
  assert.equal(deps.supabase.throttle.get('machine:machine-a')?.failureCount, 3, 'machine throttle counter must be durably persisted')
  assert.equal(deps.supabase.throttle.get('ip:203.0.113.25')?.failureCount, 3, 'IP throttle counter must be durably persisted')
})

test('throttle_survives_restart', async () => {
  const supabase = createMockedSupabaseClient()
  const now = () => new Date('2030-01-01T00:00:00.000Z')
  const first = dependencies({ supabase, now, compareCredential: () => false })
  const firstHandler = await verifyHandler(first)
  for (let i = 0; i < 3; i += 1) {
    await firstHandler(request('/api/owner/verify-pin', {
      method: 'POST', headers: clientIpHeaders(), body: { machineId: 'machine-a', credential: 'incorrect-credential' },
    }))
  }
  const restarted = dependencies({ supabase, now, compareCredential: () => true })
  const afterRestart = await (await verifyHandler(restarted))(request('/api/owner/verify-pin', {
    method: 'POST', headers: clientIpHeaders(), body: { machineId: 'machine-a', credential: 'correct-credential' },
  }))
  assert.equal(afterRestart.status, 429)
  // REVISION 2 (see auth.contract.d.ts): durability now flows through the atomic
  // `takeThrottleAttempt` reservation rather than a separate `getThrottle` read.
  assert.ok(
    supabase.calls.filter(call => call.operation === 'rpc' && call.table === 'auth_throttle').length >= 4,
    'the throttle lock from before the (simulated) restart must still be consulted afterward',
  )
})

test('correct_credential_during_lock_refused', async () => {
  const deps = dependencies({
    compareCredential: () => true,
    supabase: createMockedSupabaseClient(),
  })
  deps.supabase.throttle.set('machine:machine-a', {
    scope: 'machine', key: 'machine-a', failureCount: 3, lockedUntil: new Date('2030-01-01T00:01:00.000Z'),
  })
  const response = await (await verifyHandler(deps))(request('/api/owner/verify-pin', {
    method: 'POST', headers: clientIpHeaders(), body: { machineId: 'machine-a', credential: 'correct-credential' },
  }))
  assert.equal(response.status, 429)
  assert.equal(response.headers.get('retry-after'), '60')
})

test('session_cookie_flags', async () => {
  const handler = await verifyHandler(dependencies())
  const response = await handler(request('/api/owner/verify-pin', {
    method: 'POST', headers: clientIpHeaders(), body: { machineId: 'machine-a', credential: 'correct-credential' },
  }))
  assert.equal(response.status, 200)
  const cookie = response.headers.get('set-cookie') ?? ''
  assert.match(cookie, /HttpOnly/i)
  assert.match(cookie, /Secure/i)
  assert.match(cookie, /SameSite=Lax/i)
  const maxAge = Number(/Max-Age=(\d+)/i.exec(cookie)?.[1])
  assert.ok(Number.isInteger(maxAge) && maxAge > 0 && maxAge <= 86_400, 'owner session lifetime must be at most 24 hours')
  assert.match(cookie, /ffm_owner_session_machine-a=/)
})

test('owner_token_not_admin', async () => {
  const auth = await import(routeUrl('lib/auth.ts'))
  const original = process.env.SESSION_SECRET
  process.env.SESSION_SECRET = 'x'.repeat(32)
  try {
    const ownerToken = await auth.createOwnerSession('machine-a')
    assert.equal(await auth.verifySession(ownerToken), false)
  } finally {
    if (original === undefined) delete process.env.SESSION_SECRET
    else process.env.SESSION_SECRET = original
  }
})

test('expired_session_401', async () => {
  const handler = await dataHandler(dependencies({
    verifyOwnerSession: async () => ({ ok: false, reason: 'expired' }),
  }))
  const response = await handler(request('/api/owner/data?machineId=machine-a'))
  assert.equal(response.status, 401)
})

test('wrong_machine_403', async () => {
  const handler = await dataHandler(dependencies({
    verifyOwnerSession: async () => ({ ok: false, reason: 'wrong_machine' }),
  }))
  const response = await handler(request('/api/owner/data?machineId=machine-b'))
  assert.equal(response.status, 403)
})

test('csrf_cross_origin_rejected', async () => {
  const ownerDeps = dependencies()
  const ownerResponse = await (await verifyHandler(ownerDeps))(request('/api/owner/verify-pin', {
    method: 'POST', headers: { origin: 'https://attacker.example', 'x-forwarded-for': '203.0.113.25' },
    body: { machineId: 'machine-a', credential: 'correct-credential' },
  }))
  assert.equal(ownerResponse.status, 403)
  assert.equal(ownerDeps.supabase.calls.length, 0)

  const login = await route('../../lib/owner-auth.ts', 'createAdminLoginHandler')
  const adminResponse = await login.createAdminLoginHandler({
    appOrigin: APP_ORIGIN,
    adminPassword: () => 'correct-admin-password',
    createSession: async () => 'admin-session',
  })(request('/api/login', {
    method: 'POST', headers: { origin: 'https://attacker.example' }, body: { password: 'correct-admin-password' },
  }))
  assert.equal(adminResponse.status, 403)
})

test('fail_closed_missing_secrets', async () => {
  const login = await route('app/api/login/route.ts', 'POST')
  const saved = { SESSION_SECRET: process.env.SESSION_SECRET, ADMIN_PASSWORD: process.env.ADMIN_PASSWORD }
  const cases = [
    { SESSION_SECRET: undefined, ADMIN_PASSWORD: 'correct-admin-password' },
    { SESSION_SECRET: 'too-short', ADMIN_PASSWORD: 'correct-admin-password' },
    { SESSION_SECRET: 'x'.repeat(32), ADMIN_PASSWORD: undefined },
    { SESSION_SECRET: 'x'.repeat(32), ADMIN_PASSWORD: 'short' },
  ]
  try {
    for (const values of cases) {
      if (values.SESSION_SECRET === undefined) delete process.env.SESSION_SECRET
      else process.env.SESSION_SECRET = values.SESSION_SECRET
      if (values.ADMIN_PASSWORD === undefined) delete process.env.ADMIN_PASSWORD
      else process.env.ADMIN_PASSWORD = values.ADMIN_PASSWORD
      const response = await login.POST(request('/api/login', {
        method: 'POST', headers: { origin: APP_ORIGIN }, body: { password: 'correct-admin-password' },
      }))
      assert.equal(response.status, 503)
      assert.equal(response.headers.has('set-cookie'), false, 'configuration failure must never mint a session')
    }
  } finally {
    if (saved.SESSION_SECRET === undefined) delete process.env.SESSION_SECRET
    else process.env.SESSION_SECRET = saved.SESSION_SECRET
    if (saved.ADMIN_PASSWORD === undefined) delete process.env.ADMIN_PASSWORD
    else process.env.ADMIN_PASSWORD = saved.ADMIN_PASSWORD
  }
})

test('outage_503_not_fake_zero', async () => {
  const deps = dependencies({ supabase: createMockedSupabaseClient({ dataError: true }) })
  const response = await (await dataHandler(deps))(request('/api/owner/data?machineId=machine-a'))
  assert.equal(response.status, 503)
  const body = await json(response)
  assert.equal(body.stale, true)
  assert.notDeepEqual(body.stats, { totalRevenue: 0, orderCount: 0, avgOrder: 0 })
})

test('outage_never_404_on_query_error', async () => {
  const deps = dependencies({ supabase: createMockedSupabaseClient({ statsError: true }) })
  const response = await (await statsHandler(deps))(request('/api/owner/stats?machineId=machine-a&period=week'))
  assert.equal(response.status, 503)
  assert.equal((await json(response)).stale, true)
})
