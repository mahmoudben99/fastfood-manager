// v4 KDS: LAN endpoints (auth, actions, SSE push) against a real HTTP server + SQLite.
//
// Run with: ELECTRON_RUN_AS_NODE=1 node_modules/electron/dist/electron.exe --no-warnings
//   --test test-harness/unit/kds/*.test.mjs

import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { randomUUID } from 'node:crypto'
import { freshDb, seedKitchen, load } from './_setup.mjs'

const { createOrderService } = await load('main/services/order-service.ts')
const { handleKdsRequest, closeKdsStreams, kdsStreamCount } = await load('main/tablet/kds-http.ts')
const { setKdsPin } = await load('main/services/kds/kds-settings.ts')

async function startServer(db) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    handleKdsRequest(req, res, url, { getDb: () => db })
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  return { base, close: () => new Promise((resolve) => { closeKdsStreams(); server.close(resolve) }) }
}

async function call(base, path, { method = 'GET', token, body } = {}) {
  const response = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body)
  })
  const text = await response.text()
  let json = null
  try { json = JSON.parse(text) } catch { /* html */ }
  return { status: response.status, json, text }
}

/** Minimal SSE reader: collects parsed `event:` frames from a streaming GET. */
function openStream(url) {
  const events = []
  const waiters = []
  let buffer = ''
  let request
  const ready = new Promise((resolve, reject) => {
    request = http.get(url, (res) => {
      resolve(res.statusCode)
      res.setEncoding('utf8')
      res.on('data', (chunk) => {
        buffer += chunk
        let index
        while ((index = buffer.indexOf('\n\n')) >= 0) {
          const frame = buffer.slice(0, index)
          buffer = buffer.slice(index + 2)
          const event = /^event: (.+)$/m.exec(frame)?.[1]
          const data = /^data: (.+)$/m.exec(frame)?.[1]
          if (!event) continue
          events.push({ event, data: data ? JSON.parse(data) : null })
          for (const waiter of [...waiters]) waiter()
        }
      })
    })
    request.on('error', reject)
  })
  const next = (predicate, timeoutMs = 3000) => new Promise((resolve, reject) => {
    const check = () => {
      const hit = events.find(predicate)
      if (!hit) return false
      waiters.splice(waiters.indexOf(check), 1)
      clearTimeout(timer)
      resolve(hit)
      return true
    }
    const timer = setTimeout(() => {
      waiters.splice(waiters.indexOf(check), 1)
      reject(new Error('SSE event timeout; got ' + events.map((e) => e.event).join(',')))
    }, timeoutMs)
    waiters.push(check)
    check()
  })
  return { ready, events, next, close: () => request.destroy() }
}

function newOrder(db, lines) {
  const result = createOrderService({ db }).createOrder({
    source: 'tablet', sourceRequestId: randomUUID(), orderType: 'takeout', lines, applyAutoPromotions: false
  })
  assert.equal(result.ok, true)
  return result.orderId
}

test('LAN KDS: PIN pairing, auth on every data route, actions, and live SSE snapshots', async () => {
  const { db, cleanup } = freshDb()
  seedKitchen(db)
  setKdsPin(db, '4321')
  const { base, close } = await startServer(db)
  try {
    const page = await call(base, '/kds?lang=ar')
    assert.equal(page.status, 200)
    assert.match(page.text, /dir="rtl"/)
    assert.match(page.text, /window\.KDS_CONFIG/)

    assert.equal((await call(base, '/kds/api/snapshot')).status, 401)
    assert.equal((await call(base, '/kds/api/snapshot', { token: 'f'.repeat(64) })).status, 401)
    assert.equal((await call(base, '/kds/api/action', { method: 'POST', body: { type: 'recall-last', station: 'all' } })).status, 401)
    const noTokenStream = openStream(`${base}/kds/stream?station=all`)
    assert.equal(await noTokenStream.ready, 401)
    noTokenStream.close()

    assert.equal((await call(base, '/kds/api/pin', { method: 'POST', body: { pin: '0000' } })).status, 401)
    const paired = await call(base, '/kds/api/pin', { method: 'POST', body: { pin: '4321' } })
    assert.equal(paired.status, 200)
    const token = paired.json.token
    assert.equal(token.length, 64)

    const first = newOrder(db, [{ menuItemId: 1, quantity: 1 }, { menuItemId: 3, quantity: 1 }])
    const snapshot = await call(base, '/kds/api/snapshot?station=all', { token })
    assert.equal(snapshot.status, 200)
    assert.deepEqual(snapshot.json.cards.map((c) => c.orderId), [first])

    const stream = openStream(`${base}/kds/stream?station=1&token=${token}`)
    assert.equal(await stream.ready, 200)
    const initial = await stream.next((e) => e.event === 'snapshot')
    assert.equal(initial.data.cards.length, 1)
    assert.equal(kdsStreamCount(), 1)

    // A new order anywhere (POS, tablet, remote) is pushed to the open screen.
    const second = newOrder(db, [{ menuItemId: 1, quantity: 2 }])
    const pushed = await stream.next((e) => e.event === 'snapshot' && e.data.cards.some((c) => c.orderId === second))
    assert.deepEqual(pushed.data.cards.map((c) => c.orderId), [first, second])

    const ticketId = pushed.data.cards[0].tickets[0].id
    assert.deepEqual((await call(base, '/kds/api/action', { method: 'POST', token, body: { type: 'bump', ticketId } })).json, { ok: true })
    await stream.next((e) => e.event === 'snapshot' && e.data.cards.length === 1 && e.data.canRecall)
    assert.equal((await call(base, '/kds/api/action', { method: 'POST', token, body: { type: 'bump', ticketId: 424242 } })).status, 409)
    assert.equal((await call(base, '/kds/api/action', { method: 'POST', token, body: { type: 'explode' } })).status, 400)
    assert.equal((await call(base, '/kds/api/action', { method: 'POST', token, body: '{not json' })).status, 400)
    assert.equal((await call(base, '/kds/api/action', { method: 'POST', token, body: { type: 'recall-last', station: 1 } })).status, 200)
    stream.close()

    // Changing the PIN revokes every paired screen.
    setKdsPin(db, '9999')
    assert.equal((await call(base, '/kds/api/snapshot', { token })).status, 401)
  } finally {
    await close()
    cleanup()
  }
})

test('LAN board: public read-only state and stream; wrong PINs lock the client out', async () => {
  const { db, cleanup } = freshDb()
  seedKitchen(db)
  setKdsPin(db, '1234')
  const { base, close } = await startServer(db)
  try {
    const page = await call(base, '/board')
    assert.equal(page.status, 200)
    assert.match(page.text, /window\.BOARD_CONFIG/)
    const stream = openStream(`${base}/board/stream`)
    assert.equal(await stream.ready, 200)
    await stream.next((e) => e.event === 'board')
    const orderId = newOrder(db, [{ menuItemId: 2, quantity: 1 }])
    const pushed = await stream.next((e) => e.event === 'board' && e.data.preparing.length === 1)
    assert.equal(pushed.data.preparing[0].orderId, orderId)
    const state = await call(base, '/board/api/state')
    assert.deepEqual(Object.keys(state.json).sort(), ['clearMinutes', 'preparing', 'ready', 'restaurantName', 'serverTime'])
    stream.close()

    for (let i = 0; i < 5; i++) await call(base, '/kds/api/pin', { method: 'POST', body: { pin: '0000' } })
    const locked = await call(base, '/kds/api/pin', { method: 'POST', body: { pin: '1234' } })
    assert.equal(locked.status, 429, 'even the right PIN waits out the lock')
    assert.equal((await call(base, '/kds/nope')).status, 404)
  } finally {
    await close()
    cleanup()
  }
})
