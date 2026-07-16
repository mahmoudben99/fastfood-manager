import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'

const NOW = new Date('2026-07-16T10:00:00.000Z')
const MACHINE = 'ABC123'
const REQUEST_ID = '11111111-1111-4111-8111-111111111111'

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
    body: JSON.stringify(body)
  })
}

function oversizedRequest() {
  return {
    headers: new Headers({ 'content-type': 'application/json', 'content-length': '65537', 'x-forwarded-for': '203.0.113.9' }),
    async json() { throw new Error('body parser was invoked for an oversized request') }
  }
}

/**
 * Small in-memory Supabase facsimile.  It intentionally exposes the normal query-builder
 * surface rather than a repository abstraction: route code must use the service-role client.
 */
function mockSupabase(seed = {}) {
  const state = {
    machines: [{ machine_id: MACHINE, remote_ordering_enabled: true, catalog_revision: 12 }],
    restaurants: [],
    menu_sync: [{ machine_id: MACHINE, menu_item_id: 3, name: 'Burger', price: 650, active: true, revision: 12 }],
    remote_orders_v2: [],
    remote_order_throttle: [],
    calls: [],
    rpcCalls: [],
    ...seed
  }
  let sequence = 1
  const rowsFor = (table) => state[table] || []
  const match = (row, filters) => filters.every(([kind, key, value]) => {
    if (kind === 'eq') return row[key] === value
    if (kind === 'gt') return row[key] > value
    if (kind === 'gte') return row[key] >= value
    if (kind === 'lt') return row[key] < value
    return true
  })

  class Query {
    constructor(table) { this.table = table; this.filters = []; this.mode = 'select'; this.values = undefined; this.wantSingle = false; this.sort = null; this.take = null }
    select() { this.mode = this.mode === 'insert' || this.mode === 'update' ? this.mode : 'select'; return this }
    insert(values) { this.mode = 'insert'; this.values = Array.isArray(values) ? values : [values]; return this }
    update(values) { this.mode = 'update'; this.values = values; return this }
    eq(key, value) { this.filters.push(['eq', key, value]); return this }
    gt(key, value) { this.filters.push(['gt', key, value]); return this }
    gte(key, value) { this.filters.push(['gte', key, value]); return this }
    lt(key, value) { this.filters.push(['lt', key, value]); return this }
    order(key, options = {}) { this.sort = [key, options.ascending !== false]; return this }
    limit(value) { this.take = value; return this }
    single() { this.wantSingle = true; return this }
    maybeSingle() { this.wantSingle = true; return this }
    then(resolve, reject) { return Promise.resolve(this.run()).then(resolve, reject) }
    run() {
      state.calls.push({ table: this.table, mode: this.mode, filters: this.filters, values: this.values })
      const rows = rowsFor(this.table)
      if (this.mode === 'insert') {
        for (const proposed of this.values) {
          if (this.table === 'remote_orders_v2' && rows.some((row) => row.machine_id === proposed.machine_id && row.client_request_id === proposed.client_request_id)) {
            return { data: null, error: { code: '23505', message: 'duplicate client request' } }
          }
          rows.push({ id: proposed.id || `row-${sequence++}`, ...proposed })
        }
        const inserted = rows.slice(-this.values.length)
        return { data: this.wantSingle ? inserted[0] : inserted, error: null }
      }
      const selected = rows.filter((row) => match(row, this.filters))
      if (this.mode === 'update') {
        selected.forEach((row) => Object.assign(row, this.values))
        return { data: this.wantSingle ? selected[0] || null : selected, error: null, count: selected.length }
      }
      let result = selected.slice()
      if (this.sort) result.sort((a, b) => (a[this.sort[0]] > b[this.sort[0]] ? (this.sort[1] ? 1 : -1) : 0))
      if (this.take != null) result = result.slice(0, this.take)
      return { data: this.wantSingle ? result[0] || null : result, error: null }
    }
  }

  return {
    state,
    from(table) { return new Query(table) },
    async rpc(name, args) {
      state.rpcCalls.push({ name, args })
      if (/throttle/i.test(name)) {
        const configured = seed.throttleResult ?? { allowed: true }
        return { data: typeof configured === 'function' ? configured(state.rpcCalls.length) : configured, error: null }
      }
      return { data: null, error: null }
    }
  }
}

async function routeWith(seed = {}) {
  const module = await import('../../app/api/remote-order/route.ts')
  assert.equal(typeof module.createRemoteOrderRoute, 'function', 'route must export createRemoteOrderRoute; see remote-order.contract.d.ts')
  const supabase = mockSupabase(seed)
  let randomCalls = 0
  const route = module.createRemoteOrderRoute({
    supabase,
    now: () => NOW,
    getClientIp: () => '203.0.113.9',
    randomBytes: (length) => { randomCalls++; return new Uint8Array(length).fill(7) },
    sha256Hex
  })
  return { route, supabase, randomCalls: () => randomCalls }
}

async function json(response) { return { status: response.status, body: await response.json(), headers: response.headers } }

test('submit_disabled_404_identical', async () => {
  const disabled = await routeWith({ machines: [{ machine_id: MACHINE, remote_ordering_enabled: false, catalog_revision: 12 }] })
  const unknown = await routeWith({ machines: [] })
  const a = await disabled.route.POST(request(baseBody()))
  const b = await unknown.route.POST(request(baseBody()))
  assert.equal(a.status, 404)
  assert.equal(b.status, 404)
  assert.equal(await a.text(), await b.text(), 'disabled and unknown must be byte-identical')
  assert.equal(disabled.supabase.state.remote_orders_v2.length, 0)
  assert.equal(unknown.supabase.state.remote_orders_v2.length, 0)
})

test('submit_unknown_machine_404_identical', async () => {
  const unknownOne = await routeWith({ machines: [] })
  const unknownTwo = await routeWith({ machines: [] })
  const first = await unknownOne.route.POST(request(baseBody({ machineId: 'NOPE01' })))
  const second = await unknownTwo.route.POST(request(baseBody({ machineId: 'NOPE02' })))
  assert.equal(first.status, 404)
  assert.equal(await first.text(), await second.text(), 'unknown IDs must not leak lookup detail')
})

test('submit_caps_enforced', async (t) => {
  const cases = [
    ['lines', baseBody({ items: Array.from({ length: 21 }, (_, index) => ({ menuItemId: 3, quantity: 1, line: index })) })],
    ['units', baseBody({ items: [{ menuItemId: 3, quantity: 51 }] })],
    ['quantity_integer', baseBody({ items: [{ menuItemId: 3, quantity: 1.5 }] })],
    ['quantity_positive', baseBody({ items: [{ menuItemId: 3, quantity: 0 }] })],
    ['note', baseBody({ note: 'x'.repeat(301) })],
    ['quoted_total', baseBody({ items: [{ menuItemId: 3, quantity: 2 }] }), { menu_sync: [{ machine_id: MACHINE, menu_item_id: 3, name: 'Burger', price: 50_001, active: true, revision: 12 }] }]
  ]
  for (const [name, body, seed] of cases) await t.test(name, async () => {
    const { route, supabase } = await routeWith(seed)
    const result = await json(await route.POST(request(body)))
    assert.equal(result.status, 400)
    assert.equal(result.body.error, 'bad_input')
    assert.ok(result.body.field, 'bad_input must name a field')
    assert.equal(supabase.state.remote_orders_v2.length, 0, 'invalid input must not persist')
  })
  await t.test('body', async () => {
    const { route, supabase } = await routeWith()
    const result = await json(await route.POST(oversizedRequest()))
    assert.equal(result.status, 400)
    assert.equal(result.body.error, 'bad_input')
    assert.equal(supabase.state.remote_orders_v2.length, 0)
  })
})

test('submit_dinein_requires_table', async () => {
  const { route, supabase } = await routeWith()
  const result = await json(await route.POST(request(baseBody({ orderType: 'local', tableNumber: '' }))))
  assert.equal(result.status, 400)
  assert.deepEqual(result.body, { error: 'bad_input', field: 'tableNumber' })
  assert.equal(supabase.state.remote_orders_v2.length, 0)
})

test('submit_throttle_429_no_row', async () => {
  const { route, supabase } = await routeWith({ throttleResult: { allowed: false, retryAfter: 600 } })
  const response = await route.POST(request(baseBody()))
  assert.equal(response.status, 429)
  assert.ok(response.headers.get('retry-after'), '429 must include Retry-After')
  assert.equal(supabase.state.remote_orders_v2.length, 0)
})

test('submit_ok_returns_capability_only', async () => {
  const { route, supabase, randomCalls } = await routeWith()
  const result = await json(await route.POST(request(baseBody())))
  assert.equal(result.status, 201)
  assert.equal(result.body.status, 'submitted')
  assert.equal(typeof result.body.statusToken, 'string')
  assert.equal(Buffer.from(result.body.statusToken, 'base64url').length, 32, 'capability must be 256-bit opaque randomness')
  assert.equal(typeof result.body.requestId, 'string')
  assert.equal('machineId' in result.body, false)
  assert.equal('clientRequestId' in result.body, false)
  assert.equal('dailyNumber' in result.body, false)
  assert.equal(randomCalls(), 1)
  assert.equal(supabase.state.remote_orders_v2.length, 1)
  assert.equal(supabase.state.remote_orders_v2[0].status, 'submitted')
  assert.equal(supabase.state.remote_orders_v2[0].status_token_hash, sha256Hex(result.body.statusToken), 'cloud stores only the token hash')
})

test('submit_duplicate_client_request_id_returns_same', async () => {
  const { route, supabase } = await routeWith()
  const first = await json(await route.POST(request(baseBody())))
  const second = await json(await route.POST(request(baseBody())))
  assert.equal(first.status, 201)
  assert.equal(second.status, 200)
  assert.deepEqual(second.body, first.body, 'retry returns the original capability response')
  assert.equal(supabase.state.remote_orders_v2.length, 1)
})

test('submit_stale_revision_409_changed_lines', async () => {
  const { route, supabase } = await routeWith({
    machines: [{ machine_id: MACHINE, remote_ordering_enabled: true, catalog_revision: 13 }],
    menu_sync: [
      { machine_id: MACHINE, menu_item_id: 3, name: 'Burger', price: 500, active: true, revision: 12 },
      { machine_id: MACHINE, menu_item_id: 3, name: 'Burger', price: 650, active: true, revision: 13 }
    ]
  })
  const result = await json(await route.POST(request(baseBody({ quoteRevision: 12 }))))
  assert.equal(result.status, 409)
  assert.equal(result.body.error, 'stale_quote')
  assert.equal(result.body.currentRevision, 13)
  assert.deepEqual(result.body.changedLines, [{ menuItemId: 3, name: 'Burger', oldPrice: 500, newPrice: 650, active: true }])
  assert.equal(supabase.state.remote_orders_v2.length, 0)
})

test('[RED-TEAM] flood_50_requests', async () => {
  const { route, supabase } = await routeWith({ throttleResult: (attempt) => ({ allowed: attempt <= 5, retryAfter: 600 }) })
  const responses = await Promise.all(Array.from({ length: 50 }, (_, n) => route.POST(request(baseBody({ clientRequestId: `11111111-1111-4111-8111-${String(n).padStart(12, '0')}` })))))
  assert.equal(responses.filter((response) => response.status === 201).length, 5)
  assert.equal(responses.filter((response) => response.status === 429).length, 45)
  assert.ok(supabase.state.remote_orders_v2.length <= 5, 'the per-IP+machine cap bounds persisted rows')
})

test('[RED-TEAM] body_over_64k_rejected_before_parse', async () => {
  const { route, supabase } = await routeWith()
  const response = await route.POST(oversizedRequest())
  const result = await json(response)
  assert.equal(result.status, 400)
  assert.equal(result.body.error, 'bad_input')
  assert.equal(supabase.state.remote_orders_v2.length, 0)
})
