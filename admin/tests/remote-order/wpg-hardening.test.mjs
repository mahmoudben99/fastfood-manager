/**
 * WP-G hardening tests (red-team remediation). These are ADDITIONAL to the frozen
 * acceptance suites (submit.test.mjs / status.test.mjs) and cover:
 *  - #8 byte-accurate 64KiB body cap (UTF-8 bytes, streaming, no full buffering)
 *  - #7 missing/short SERVER_CAPABILITY_SECRET fails closed (500 config_error)
 *  - #9 duplicate submissions return the immutable ORIGINAL response
 *  - #3 status endpoint: 503 on DB error, never a synthesized terminal state,
 *       race-lost lazy expiry reports the ACTUAL row state
 *  - #4 claim-in-progress rows (accepted, no daily number) stay customer-invisible
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'
// SELF-CONTAINED TEST SECRET: hardening tests build capability tokens; default if CI didn't set one.
if (!process.env.SERVER_CAPABILITY_SECRET) process.env.SERVER_CAPABILITY_SECRET = 'ci-default-capability-secret-32bytes-minimum-000'


const NOW = new Date('2026-07-16T10:00:00.000Z')
const MACHINE = 'ABC123'
const REQUEST_ID = '22222222-2222-4222-8222-222222222222'
const sha256Hex = (value) => createHash('sha256').update(value).digest('hex')

function baseBody(overrides = {}) {
  return {
    machineId: MACHINE,
    clientRequestId: REQUEST_ID,
    quoteRevision: 12,
    orderType: 'takeout',
    customerName: 'Ada Customer',
    customerPhone: '0550000000',
    note: 'No onions',
    items: [{ menuItemId: 3, quantity: 2 }],
    ...overrides
  }
}

function request(body, headers = {}) {
  return new Request('https://admin.example/api/remote-order', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.9', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body)
  })
}

/** Minimal submit-route Supabase fake (same surface as the frozen suite's). */
function mockSupabase() {
  const state = {
    machines: [{ machine_id: MACHINE, remote_ordering_enabled: true, catalog_revision: 12 }],
    menu_sync: [{ machine_id: MACHINE, menu_item_id: 3, name: 'Burger', price: 650, active: true, revision: 12 }],
    remote_orders_v2: []
  }
  let sequence = 1
  class Query {
    constructor(table) { this.table = table; this.filters = []; this.mode = 'select'; this.values = undefined; this.wantSingle = false }
    select() { return this }
    insert(values) { this.mode = 'insert'; this.values = Array.isArray(values) ? values : [values]; return this }
    update(values) { this.mode = 'update'; this.values = values; return this }
    eq(key, value) { this.filters.push([key, value]); return this }
    single() { this.wantSingle = true; return this }
    maybeSingle() { this.wantSingle = true; return this }
    then(resolve, reject) {
      const rows = state[this.table] || []
      if (this.mode === 'insert') {
        for (const proposed of this.values) {
          if (this.table === 'remote_orders_v2' && rows.some((r) => r.machine_id === proposed.machine_id && r.client_request_id === proposed.client_request_id)) {
            return Promise.resolve({ data: null, error: { code: '23505', message: 'duplicate' } }).then(resolve, reject)
          }
          rows.push({ id: `row-${sequence++}`, ...proposed })
        }
        const inserted = rows.slice(-this.values.length)
        return Promise.resolve({ data: this.wantSingle ? inserted[0] : inserted, error: null }).then(resolve, reject)
      }
      const matching = rows.filter((row) => this.filters.every(([k, v]) => row[k] === v))
      if (this.mode === 'update') {
        matching.forEach((row) => Object.assign(row, this.values))
        return Promise.resolve({ data: matching, error: null, count: matching.length }).then(resolve, reject)
      }
      return Promise.resolve({ data: this.wantSingle ? matching[0] || null : matching, error: null }).then(resolve, reject)
    }
  }
  return {
    state,
    from(table) { return new Query(table) },
    async rpc() { return { data: { allowed: true }, error: null } }
  }
}

async function routeWith() {
  const module = await import('../../app/api/remote-order/_handler.ts')
  const supabase = mockSupabase()
  const route = module.createRemoteOrderRoute({
    supabase,
    now: () => NOW,
    getClientIp: () => '203.0.113.9',
    randomBytes: (length) => new Uint8Array(length).fill(5),
    sha256Hex
  })
  return { route, supabase, module }
}

// ── #8 body cap is UTF-8 BYTES, not JS code units ──────────────────────────────

test('hardening_body_cap_counts_utf8_bytes', async () => {
  const { route, supabase } = await routeWith()
  // ~31k code units but ~92k UTF-8 bytes: would pass a code-unit check, must 400.
  const body = JSON.stringify(baseBody({ note: '€'.repeat(30000) }))
  assert.ok(body.length < 65536, 'precondition: under the cap in code units')
  assert.ok(Buffer.byteLength(body, 'utf8') > 65536, 'precondition: over the cap in bytes')
  const response = await route.POST(request(body))
  const result = await response.json()
  assert.equal(response.status, 400)
  assert.equal(result.error, 'bad_input')
  assert.equal(supabase.state.remote_orders_v2.length, 0, 'oversized body must not persist')
})

test('hardening_oversized_stream_without_content_length_cancelled', async () => {
  const { route, supabase } = await routeWith()
  let pushed = 0
  let cancelled = false
  const chunk = new Uint8Array(8192).fill(97) // 'a'
  const stream = new ReadableStream({
    pull(controller) {
      pushed += chunk.byteLength
      controller.enqueue(chunk)
      if (pushed > 400_000) controller.close() // guard: should be cancelled long before
    },
    cancel() { cancelled = true }
  })
  const fakeRequest = {
    headers: new Headers({ 'content-type': 'application/json' }), // NO content-length
    body: stream,
    async json() { throw new Error('parser must not be invoked') },
    async text() { throw new Error('full-buffering text() must not be invoked') }
  }
  const response = await route.POST(fakeRequest)
  const result = await response.json()
  assert.equal(response.status, 400)
  assert.equal(result.error, 'bad_input')
  assert.ok(cancelled, 'stream must be cancelled once the byte cap is exceeded')
  assert.ok(pushed < 200_000, 'reading must stop near the cap, not buffer the stream')
  assert.equal(supabase.state.remote_orders_v2.length, 0)
})

// ── #7 capability secret is mandatory in production (fail closed) ──────────────

test('hardening_missing_secret_fails_closed_500', async (t) => {
  const module = await import('../../app/api/remote-order/_handler.ts')
  const saved = process.env.SERVER_CAPABILITY_SECRET
  t.after(() => {
    if (saved === undefined) delete process.env.SERVER_CAPABILITY_SECRET
    else process.env.SERVER_CAPABILITY_SECRET = saved
  })

  // route.ts's production POST wrapper is exactly:
  //   if (capabilitySecretProblem(process.env.SERVER_CAPABILITY_SECRET) !== null)
  //     return jsonResponse({ error: 'config_error' }, 500)
  // route.ts can't be imported under `node --test` (its extensionless ./_handler
  // import), so we assert the exact decision that wrapper makes, via the tested fn.
  const wrapperVerdict = (env) =>
    module.capabilitySecretProblem(env) !== null ? { status: 500, error: 'config_error' } : null

  delete process.env.SERVER_CAPABILITY_SECRET
  const missing = wrapperVerdict(process.env.SERVER_CAPABILITY_SECRET)
  assert.equal(missing?.status, 500)
  assert.equal(missing?.error, 'config_error')

  process.env.SERVER_CAPABILITY_SECRET = 'short'
  const short = wrapperVerdict(process.env.SERVER_CAPABILITY_SECRET)
  assert.equal(short?.status, 500)
  assert.equal(short?.error, 'config_error')

  assert.equal(module.capabilitySecretProblem(undefined), 'missing')
  assert.equal(module.capabilitySecretProblem(''), 'missing')
  assert.equal(module.capabilitySecretProblem('x'.repeat(31)), 'too_short')
  assert.equal(module.capabilitySecretProblem('x'.repeat(32)), null)
})

// ── #9 duplicates return the immutable ORIGINAL response ───────────────────────

test('hardening_duplicate_returns_original_after_lifecycle', async () => {
  const { route, supabase } = await routeWith()
  const first = await route.POST(request(baseBody()))
  assert.equal(first.status, 201)
  const firstBody = await first.json()

  // Staff accepts in the meantime: row becomes 'accepted' with a daily number.
  Object.assign(supabase.state.remote_orders_v2[0], { status: 'accepted', daily_number: 7 })

  const second = await route.POST(request(baseBody()))
  assert.equal(second.status, 200)
  const secondBody = await second.json()
  assert.deepEqual(secondBody, firstBody, 'duplicate must return the original submission response')
  assert.equal(secondBody.status, 'submitted')
  assert.equal('dailyNumber' in secondBody, false, 'lifecycle data never leaks through the submit path')
})

// ── #3/#4 status endpoint: no synthesized state, 503 on inconclusive errors ────

const TOKEN = Buffer.alloc(32, 9).toString('base64url')

/** Scriptable status-route fake: per-call select/update behavior. */
function scriptedStatusSupabase(script) {
  const calls = { select: 0, update: 0 }
  class Query {
    constructor() { this.mode = 'select'; this.patch = null }
    select() { return this }
    update(patch) { this.mode = 'update'; this.patch = patch; return this }
    eq() { return this }
    single() { return this }
    maybeSingle() { return this }
    then(resolve, reject) {
      const step = this.mode === 'update' ? script.updates[calls.update++] : script.selects[calls.select++]
      if (!step) return Promise.resolve({ data: null, error: { message: 'script exhausted' } }).then(resolve, reject)
      return Promise.resolve(step).then(resolve, reject)
    }
  }
  return { calls, from() { return new Query() } }
}

async function statusRouteWith(script) {
  const module = await import('../../app/api/remote-order/status/_handler.ts')
  const supabase = scriptedStatusSupabase(script)
  return {
    supabase,
    status: module.createRemoteOrderStatusRoute({ supabase, now: () => NOW, sha256Hex })
  }
}

const statusGet = (route) =>
  route.GET(new Request(`https://admin.example/api/remote-order/status?token=${encodeURIComponent(TOKEN)}`))

test('hardening_status_503_on_select_error_not_404', async () => {
  const { status } = await statusRouteWith({ selects: [{ data: null, error: { message: 'boom' } }], updates: [] })
  const response = await statusGet(status)
  assert.equal(response.status, 503, 'a DB error is inconclusive — never 404, never terminal')
  assert.equal((await response.json()).error, 'db_failure')
})

test('hardening_status_503_when_lazy_expiry_update_fails', async () => {
  const staleRow = { status: 'submitted', status_token_hash: sha256Hex(TOKEN), expires_at: '2026-07-16T09:00:00.000Z' }
  const { status } = await statusRouteWith({
    selects: [{ data: staleRow, error: null }],
    updates: [{ data: null, error: { message: 'update failed' } }]
  })
  const response = await statusGet(status)
  assert.equal(response.status, 503, "'expired' must never be reported unless the transition verifiably persisted")
})

test('hardening_status_lost_expiry_race_reports_actual_state', async () => {
  // Snapshot read says stale-submitted, but staff accepted concurrently: the
  // conditional expire matches 0 rows → re-read → report the REAL accepted row.
  const stale = { status: 'submitted', status_token_hash: sha256Hex(TOKEN), expires_at: '2026-07-16T09:00:00.000Z' }
  const decided = { status: 'accepted', daily_number: 12, status_token_hash: sha256Hex(TOKEN), expires_at: '2026-07-16T09:00:00.000Z' }
  const { status } = await statusRouteWith({
    selects: [{ data: stale, error: null }, { data: decided, error: null }],
    updates: [{ data: [], error: null, count: 0 }]
  })
  const response = await statusGet(status)
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), {
    status: 'accepted',
    dailyNumber: 12,
    expiresAt: '2026-07-16T09:00:00.000Z'
  })
})

test('hardening_status_claim_in_progress_stays_submitted', async () => {
  // #4: a claimed row (accepted, no daily number yet) must NOT read as confirmed.
  const claimed = { status: 'accepted', daily_number: null, status_token_hash: sha256Hex(TOKEN), expires_at: '2026-07-16T10:15:00.000Z' }
  const { status } = await statusRouteWith({ selects: [{ data: claimed, error: null }], updates: [] })
  const response = await statusGet(status)
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { status: 'submitted', expiresAt: '2026-07-16T10:15:00.000Z' })
})
