/**
 * WP-G listener hardening tests (red-team remediation, additional to the frozen
 * remote-listener.test.mjs). Covers:
 *  - #2 fail-closed accept: claim errors / unavailable revision source never
 *    reach createOrder; every cloud {error} is inspected
 *  - #2/#4 crash safety: a THROWN createOrder (SQLITE_BUSY/FULL) reverts the
 *    claim; a crashed claim (accepted, no daily number) is converged by the
 *    recovery sweep via the idempotent (source, source_request_id) key
 *  - #2 atomic DB-side claim RPC is used when available; a lost RPC claim never
 *    calls createOrder
 */
import assert from 'node:assert/strict'
import test from 'node:test'

const NOW = new Date('2026-07-16T10:00:00.000Z')
const MACHINE = 'ABC123'

function remoteRow(overrides = {}) {
  return {
    id: 'cloud-1', machine_id: MACHINE, client_request_id: '33333333-3333-4333-8333-333333333333',
    status: 'submitted', order_type: 'takeout', customer_name: 'Ada', customer_phone: '0550000000',
    note: 'No onions', items: [{ menuItemId: 3, quantity: 2, unitPrice: 650, name: 'Burger' }],
    quote_revision: 12, quoted_total: 1300, created_at: '2026-07-16T09:58:00.000Z', expires_at: '2026-07-16T10:15:00.000Z',
    ...overrides
  }
}

/** Idempotent in-memory createOrder keyed by (source, sourceRequestId). */
function fakePos({ throwWith = null } = {}) {
  const committed = new Map()
  const calls = []
  let sequence = 40
  const createOrder = (input) => {
    calls.push(input)
    if (throwWith) throw throwWith
    const key = `${input.source}:${input.sourceRequestId}`
    if (committed.has(key)) return { ok: true, duplicate: true, ...committed.get(key) }
    const record = { orderId: committed.size + 1, dailyNumber: sequence++ }
    committed.set(key, record)
    return { ok: true, duplicate: false, ...record }
  }
  return { calls, committed, createOrder }
}

/** Cloud fake with injectable update errors and optional rpc handler. */
function cloud(rows, options = {}) {
  const state = { remote_orders_v2: rows, calls: [], rpcCalls: [], ...options }
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
      const match = (row) => this.filters.every(([op, key, value]) => op === 'eq' ? row[key] === value : op === 'gt' ? row[key] > value : row[key] < value)
      let found = state.remote_orders_v2.filter(match)
      if (this.sort) found = found.slice().sort((a, b) => (a[this.sort[0]] > b[this.sort[0]] ? (this.sort[1] ? 1 : -1) : 0))
      if (this.take != null) found = found.slice(0, this.take)
      state.calls.push({ table: this.table, filters: this.filters, patch: this.patch, count: found.length })
      if (this.patch) {
        if (state.updateError) {
          return Promise.resolve({ data: null, error: state.updateError, count: 0 }).then(resolve, reject)
        }
        found.forEach((row) => Object.assign(row, this.patch))
      }
      return Promise.resolve({ data: this.one ? found[0] || null : found, error: null, count: found.length }).then(resolve, reject)
    }
  }
  const client = { state, from(table) { return new Query(table) } }
  if (options.rpc) client.rpc = (name, args) => { state.rpcCalls.push({ name, args }); return Promise.resolve(options.rpc(name, args)) }
  return client
}

async function listenerWith(rows, { cloudOptions = {}, pos = fakePos(), deps = {} } = {}) {
  const module = await import('../../../src/main/sync/remote-order-listener.ts')
  const supabase = cloud(rows, cloudOptions)
  let broadcasts = 0
  const presented = []
  const listener = module.createRemoteOrderListener({
    supabase, machineId: MACHINE, now: () => NOW, createOrder: pos.createOrder,
    broadcastQueue: () => { broadcasts++ }, present: (row) => presented.push(row), ...deps
  })
  return { listener, pos, supabase, presented, broadcasts: () => broadcasts }
}

// ── createOrder THROW (WP-F rethrows SQLITE_BUSY/FULL) reverts the claim ───────

test('hardening_accept_reverts_when_createOrder_throws', async () => {
  const row = remoteRow()
  const pos = fakePos({ throwWith: Object.assign(new Error('database is locked'), { code: 'SQLITE_BUSY' }) })
  const { listener, broadcasts } = await listenerWith([row], { pos })
  const outcome = await listener.accept(row.id)
  assert.equal(outcome.outcome, 'failed')
  assert.equal(row.status, 'submitted', 'a thrown createOrder must revert the claim to submitted')
  assert.equal(row.daily_number, undefined)
  assert.equal(row.accept_attempts, 1, 'revert records the attempt')
  assert.equal(pos.committed.size, 0, 'no local order exists')
  assert.equal(broadcasts(), 0)
})

// ── Fail-closed guards before createOrder ──────────────────────────────────────

test('hardening_accept_fails_closed_on_claim_error', async () => {
  const row = remoteRow()
  const pos = fakePos()
  const { listener } = await listenerWith([row], { pos, cloudOptions: { updateError: { message: 'connection reset' } } })
  const outcome = await listener.accept(row.id)
  assert.equal(outcome.outcome, 'failed')
  assert.equal(pos.calls.length, 0, 'an inconclusive claim must never reach createOrder')
})

test('hardening_accept_fails_closed_when_revision_source_errors', async () => {
  const row = remoteRow()
  const pos = fakePos()
  const { listener, supabase } = await listenerWith([row], {
    pos,
    deps: { getCatalogRevision: () => { throw new Error('catalog revision unavailable') } }
  })
  const outcome = await listener.accept(row.id)
  assert.equal(outcome.outcome, 'failed')
  assert.equal(pos.calls.length, 0)
  assert.equal(row.status, 'submitted')
  assert.equal(supabase.state.calls.filter((call) => call.patch).length, 0, 'no claim may be taken when the revision cannot be verified')
})

// ── Atomic DB-side claim RPC path ──────────────────────────────────────────────

test('hardening_accept_uses_atomic_claim_rpc_when_available', async () => {
  const row = remoteRow()
  const pos = fakePos()
  const { listener, supabase, broadcasts } = await listenerWith([row], {
    pos,
    cloudOptions: {
      rpc: (name) => {
        assert.equal(name, 'remote_order_claim')
        Object.assign(row, { status: 'accepted', decided_at: NOW.toISOString() })
        return { data: { outcome: 'claimed', row: { ...row } }, error: null }
      }
    }
  })
  const outcome = await listener.accept(row.id)
  assert.equal(outcome.outcome, 'accepted')
  assert.equal(supabase.state.rpcCalls.length, 1)
  assert.equal(pos.calls.length, 1)
  assert.equal(pos.calls[0].sourceRequestId, row.client_request_id)
  assert.equal(row.daily_number, 40, 'daily number is finalized after the local commit')
  assert.equal(broadcasts(), 1)
})

test('hardening_rpc_lost_race_never_creates', async () => {
  const row = remoteRow({ status: 'accepted', daily_number: 41 })
  const pos = fakePos()
  const { listener, broadcasts } = await listenerWith([row], {
    pos,
    cloudOptions: { rpc: () => ({ data: { outcome: 'lost_race' }, error: null }) }
  })
  const outcome = await listener.accept(row.id)
  assert.equal(outcome.outcome, 'lost_race')
  assert.equal(pos.calls.length, 0)
  assert.equal(broadcasts(), 0)
})

// ── Crash recovery: claimed-but-unfinalized rows converge idempotently ─────────

test('hardening_recovery_finalizes_crashed_claim', async () => {
  // Claim taken 10 minutes ago, process died before/after the local commit.
  const row = remoteRow({ status: 'accepted', decided_at: '2026-07-16T09:50:00.000Z' })
  const pos = fakePos()
  const { listener, broadcasts, presented } = await listenerWith([row], { pos })
  await listener.pollOnce()
  assert.equal(pos.calls.length, 1, 'recovery re-runs the idempotent createOrder')
  assert.equal(row.daily_number, 40, 'daily number is written back after convergence')
  assert.equal(broadcasts(), 1)
  assert.equal(presented.length, 0, 'a claimed row is never re-presented to staff')

  // Second sweep: (source, source_request_id) idempotency — no second order.
  await listener.pollOnce()
  assert.equal(pos.committed.size, 1, 'recovery must never double-create')
})

test('hardening_recovery_skips_fresh_and_undecided_claims', async () => {
  const fresh = remoteRow({ id: 'cloud-2', status: 'accepted', decided_at: '2026-07-16T09:59:30.000Z' })
  const undecided = remoteRow({ id: 'cloud-3', status: 'accepted' })
  const pos = fakePos()
  const { listener } = await listenerWith([fresh, undecided], { pos })
  await listener.pollOnce()
  assert.equal(pos.calls.length, 0, 'in-flight (fresh) and unattributable claims are left alone')
  assert.equal(fresh.daily_number, undefined)
  assert.equal(undecided.daily_number, undefined)
})
