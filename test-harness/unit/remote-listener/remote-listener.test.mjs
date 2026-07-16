import assert from 'node:assert/strict'
import Database from 'better-sqlite3'
import test from 'node:test'

const NOW = new Date('2026-07-16T10:00:00.000Z')
const MACHINE = 'ABC123'

function remoteRow(overrides = {}) {
  return {
    id: 'cloud-1', machine_id: MACHINE, client_request_id: '11111111-1111-4111-8111-111111111111',
    status: 'submitted', order_type: 'takeout', customer_name: 'Ada', customer_phone: '0550000000',
    note: 'No onions', items: [{ menuItemId: 3, quantity: 2, unitPrice: 650, name: 'Burger' }],
    quote_revision: 12, quoted_total: 1300, created_at: '2026-07-16T09:58:00.000Z', expires_at: '2026-07-16T10:15:00.000Z',
    ...overrides
  }
}

function scratchPos() {
  const db = new Database(':memory:')
  db.exec('CREATE TABLE create_calls (source TEXT, source_request_id TEXT UNIQUE, payload TEXT); CREATE TABLE effects (kind TEXT);')
  let sequence = 40
  const createOrder = (input) => {
    const existing = db.prepare('SELECT rowid FROM create_calls WHERE source = ? AND source_request_id = ?').get(input.source, input.sourceRequestId)
    if (existing) return { ok: true, duplicate: true, orderId: existing.rowid, dailyNumber: existing.rowid }
    const info = db.prepare('INSERT INTO create_calls (source, source_request_id, payload) VALUES (?, ?, ?)').run(input.source, input.sourceRequestId, JSON.stringify(input))
    db.prepare('INSERT INTO effects (kind) VALUES (?)').run('print')
    return { ok: true, duplicate: false, orderId: info.lastInsertRowid, dailyNumber: sequence++ }
  }
  return { db, createOrder }
}

/** Mocked Supabase client with conditional-update semantics (0 matching rows means a lost race). */
function cloud(rows, options = {}) {
  const state = { remote_orders_v2: rows, calls: [], offline: false, ...options }
  class Query {
    constructor(table) { this.table = table; this.filters = []; this.patch = null; this.sort = null; this.take = null; this.one = false }
    select() { return this }
    update(patch) { this.patch = patch; return this }
    eq(key, value) { this.filters.push(['eq', key, value]); return this }
    gt(key, value) { this.filters.push(['gt', key, value]); return this }
    lt(key, value) { this.filters.push(['lt', key, value]); return this }
    order(key, config = {}) { this.sort = [key, config.ascending !== false]; return this }
    limit(count) { this.take = count; return this }
    single() { this.one = true; return this }
    maybeSingle() { this.one = true; return this }
    then(resolve, reject) {
      if (state.offline) return Promise.reject(new Error('offline'))
      const match = (row) => this.filters.every(([op, key, value]) => op === 'eq' ? row[key] === value : op === 'gt' ? row[key] > value : row[key] < value)
      let found = state.remote_orders_v2.filter(match)
      if (this.sort) found = found.slice().sort((a, b) => a[this.sort[0]] > b[this.sort[0]] ? (this.sort[1] ? 1 : -1) : 0)
      if (this.take != null) found = found.slice(0, this.take)
      state.calls.push({ table: this.table, filters: this.filters, patch: this.patch, count: found.length })
      if (this.patch) found.forEach((row) => Object.assign(row, this.patch))
      return Promise.resolve({ data: this.one ? found[0] || null : found, error: null, count: found.length }).then(resolve, reject)
    }
  }
  return { state, from(table) { assert.equal(table, 'remote_orders_v2'); return new Query(table) } }
}

async function listenerWith(rows, options = {}) {
  const module = await import('../../../src/main/sync/remote-order-listener.ts')
  assert.equal(typeof module.createRemoteOrderListener, 'function', 'listener must export createRemoteOrderListener; see remote-order.contract.d.ts')
  const pos = scratchPos()
  const supabase = cloud(rows, options.cloud)
  const presented = []
  let broadcasts = 0
  const listener = module.createRemoteOrderListener({
    supabase, machineId: MACHINE, now: () => NOW, createOrder: pos.createOrder,
    broadcastQueue: () => { broadcasts++ }, present: (row) => presented.push(row)
  })
  return { listener, pos, supabase, presented, broadcasts: () => broadcasts }
}

const countCalls = (pos) => Number(pos.db.prepare('SELECT count(*) AS count FROM create_calls').get().count)
const countEffects = (pos) => Number(pos.db.prepare('SELECT count(*) AS count FROM effects').get().count)

test('listener_ignores_nonsubmitted', async () => {
  const { listener, pos, presented, supabase } = await listenerWith([remoteRow({ status: 'accepted' }), remoteRow({ id: 'cloud-2', status: 'rejected' }), remoteRow({ id: 'cloud-3', status: 'expired' })])
  await listener.pollOnce()
  assert.equal(presented.length, 0)
  assert.equal(countCalls(pos), 0)
  assert.equal(supabase.state.calls.filter((call) => call.patch).length, 0)
})

test('listener_ttl_expires_stale', async () => {
  const row = remoteRow({ expires_at: '2026-07-16T09:59:59.999Z' })
  const { listener, pos, presented } = await listenerWith([row])
  await listener.pollOnce()
  assert.equal(row.status, 'expired')
  assert.equal(presented.length, 0)
  assert.equal(countCalls(pos), 0)
  assert.equal(countEffects(pos), 0)
})

test('accept_creates_order_exactly_once', async () => {
  const row = remoteRow()
  const { listener, pos, supabase, broadcasts } = await listenerWith([row])
  await listener.accept(row.id)
  assert.equal(countCalls(pos), 1)
  const call = pos.db.prepare('SELECT source, source_request_id, payload FROM create_calls').get()
  assert.equal(call.source, 'remote')
  assert.equal(call.source_request_id, row.client_request_id)
  const input = JSON.parse(call.payload)
  assert.equal(input.applyAutoPromotions, true)
  assert.equal(input.sourceRequestId, row.client_request_id)
  assert.equal(row.status, 'accepted')
  assert.equal(row.daily_number, 40)
  assert.equal(broadcasts(), 1)
  assert.ok(supabase.state.calls.some((call) => call.patch?.status === 'accepted'))
})

test('accept_twice_single_order', async () => {
  const row = remoteRow()
  const { listener, pos, supabase } = await listenerWith([row])
  await listener.accept(row.id)
  await listener.accept(row.id)
  assert.equal(countCalls(pos), 1, 'conditional cloud claim failure must suppress a second createOrder call')
  assert.ok(supabase.state.calls.some((call) => call.patch?.status === 'accepted' && call.count === 0), 'second accept must observe WHERE status=submitted updating zero rows')
})

test('reject_no_effects', async () => {
  const row = remoteRow()
  const { listener, pos, broadcasts } = await listenerWith([row])
  await listener.reject(row.id, 'Kitchen closed')
  assert.equal(row.status, 'rejected')
  assert.equal(row.rejected_reason, 'Kitchen closed')
  assert.equal(countCalls(pos), 0)
  assert.equal(countEffects(pos), 0)
  assert.equal(broadcasts(), 0)
})

test('accepted_returns_daily_number_to_cloud', async () => {
  const row = remoteRow()
  const { listener } = await listenerWith([row])
  await listener.accept(row.id)
  assert.equal(row.status, 'accepted')
  assert.equal(row.daily_number, 40, 'cloud receives the actual local POS daily number')
})

test('pos_offline_stays_submitted', async () => {
  const row = remoteRow()
  const { listener, pos } = await listenerWith([row], { cloud: { offline: true } })
  await listener.pollOnce()
  assert.equal(row.status, 'submitted')
  assert.equal(countCalls(pos), 0)
  assert.equal(countEffects(pos), 0)
})

test('revision_change_before_accept_expires', async () => {
  const row = remoteRow({ quote_revision: 12, current_catalog_revision: 13 })
  const { listener, pos } = await listenerWith([row])
  await listener.accept(row.id)
  assert.equal(row.status, 'expired')
  assert.equal(countCalls(pos), 0)
  assert.equal(countEffects(pos), 0)
})
