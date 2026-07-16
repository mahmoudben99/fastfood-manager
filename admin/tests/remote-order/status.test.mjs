import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'

const NOW = new Date('2026-07-16T10:00:00.000Z')
const TOKEN = Buffer.alloc(32, 9).toString('base64url')
const hash = (value) => createHash('sha256').update(value).digest('hex')

function mockSupabase(rows) {
  const state = { remote_orders_v2: rows, calls: [] }
  class Query {
    constructor() { this.filters = []; this.patch = null; this.singleRow = false }
    select() { return this }
    update(patch) { this.patch = patch; return this }
    eq(key, value) { this.filters.push([key, value]); return this }
    single() { this.singleRow = true; return this }
    maybeSingle() { this.singleRow = true; return this }
    then(resolve, reject) {
      const matching = state.remote_orders_v2.filter((row) => this.filters.every(([key, value]) => row[key] === value))
      state.calls.push({ filters: this.filters, patch: this.patch })
      if (this.patch) matching.forEach((row) => Object.assign(row, this.patch))
      return Promise.resolve({ data: this.singleRow ? matching[0] || null : matching, error: null, count: matching.length }).then(resolve, reject)
    }
  }
  return { state, from(table) { assert.equal(table, 'remote_orders_v2'); return new Query() } }
}

async function statusWith(rows) {
  const module = await import('../../app/api/remote-order/status/_handler.ts')
  assert.equal(typeof module.createRemoteOrderStatusRoute, 'function', 'status route must export createRemoteOrderStatusRoute; see remote-order.contract.d.ts')
  const supabase = mockSupabase(rows)
  return { status: module.createRemoteOrderStatusRoute({ supabase, now: () => NOW, sha256Hex: hash }), supabase }
}

const get = (suffix) => new Request(`https://admin.example/api/remote-order/status${suffix}`)

test('status_poll_by_capability_only', async () => {
  const { status, supabase } = await statusWith([{ id: 'server-row-id', client_request_id: '11111111-1111-4111-8111-111111111111', status_token_hash: hash(TOKEN), status: 'submitted', expires_at: '2026-07-16T10:15:00.000Z' }])
  const guessed = await status.GET(get('?requestId=server-row-id'))
  assert.equal(guessed.status, 404, 'request IDs are never customer lookup keys')
  const valid = await status.GET(get(`?token=${encodeURIComponent(TOKEN)}`))
  assert.equal(valid.status, 200)
  assert.equal((await valid.json()).status, 'submitted')
  assert.ok(supabase.state.calls.some((call) => call.filters.some(([key, value]) => key === 'status_token_hash' && value === hash(TOKEN))), 'lookup must use a SHA-256 token hash')
})

test('status_reflects_lifecycle', async (t) => {
  const cases = [
    ['submitted', { status: 'submitted' }, { status: 'submitted', expiresAt: '2026-07-16T10:15:00.000Z' }],
    ['accepted', { status: 'accepted', daily_number: 17 }, { status: 'accepted', dailyNumber: 17, expiresAt: '2026-07-16T10:15:00.000Z' }],
    ['rejected', { status: 'rejected', rejected_reason: 'Kitchen closed' }, { status: 'rejected', rejectedReason: 'Kitchen closed', expiresAt: '2026-07-16T10:15:00.000Z' }],
    ['lazy_expired', { status: 'submitted', expires_at: '2026-07-16T09:59:59.999Z' }, { status: 'expired', expiresAt: '2026-07-16T09:59:59.999Z' }]
  ]
  for (const [name, rowPatch, expected] of cases) await t.test(name, async () => {
    const row = { status_token_hash: hash(TOKEN), status: 'submitted', expires_at: '2026-07-16T10:15:00.000Z', ...rowPatch }
    const { status, supabase } = await statusWith([row])
    const response = await status.GET(get(`?token=${encodeURIComponent(TOKEN)}`))
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), expected)
    if (name === 'lazy_expired') assert.equal(supabase.state.remote_orders_v2[0].status, 'expired', 'expired must be persisted lazily')
  })
})

test('[RED-TEAM] capability_token_brute', async () => {
  const { status } = await statusWith([{ status_token_hash: hash(TOKEN), status: 'submitted', expires_at: '2026-07-16T10:15:00.000Z' }])
  assert.ok(Buffer.from(TOKEN, 'base64url').length >= 16, 'capability entropy must be at least 128 bits')
  for (let guess = 0; guess < 32; guess++) {
    const response = await status.GET(get(`?token=${Buffer.alloc(32, guess).toString('base64url')}`))
    assert.equal(response.status, guess === 9 ? 200 : 404, 'only the opaque capability may resolve an order')
  }
})
