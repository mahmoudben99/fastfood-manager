import http from 'node:http'
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { req, waitFor } from './helpers/client.mjs'

// CONTRACT §1.5 Cron: scheduled handler GET <SUPABASE_URL>/rest/v1/?apikey=<anon>
// (keep-alive) + prunes rate_limits rows older than 48h (not asserted here —
// out of scope per the brief's named test).
//
// ASSUMPTION (flagged in report): CONTRACT names the env value only as "the
// configured Supabase URL" — the license-server Env interface (skeleton) does
// not enumerate exact var names for it. This suite assumes SUPABASE_URL /
// SUPABASE_ANON_KEY; see test/README.md for the .dev.vars this test requires.
//
// Triggering: wrangler's local `--test-scheduled` flag exposes
// GET /__scheduled?cron=<urlencoded expr> to invoke the scheduled handler
// without waiting for real wall-clock cron. See test/README.md.

const MOCK_PORT = Number(process.env.TEST_SUPABASE_MOCK_PORT || 8788)
const CRON_EXPR = '0 3 * * *' // wrangler.toml [triggers] crons, per CONTRACT §1.5

let server
let hits = []

before(async () => {
  hits = []
  server = http.createServer((request, response) => {
    hits.push({ url: request.url, method: request.method })
    response.writeHead(200, { 'Content-Type': 'application/json' })
    response.end('{}')
  })
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(MOCK_PORT, '127.0.0.1', resolve)
  })
})

after(async () => {
  await new Promise((resolve) => server.close(resolve))
})

test('keepalive_cron_defined', async () => {
  hits = []
  const res = await req(`/__scheduled?cron=${encodeURIComponent(CRON_EXPR)}`, { method: 'GET' })
  assert.notEqual(
    res.status,
    404,
    '/__scheduled not available — start `wrangler dev --local --test-scheduled` (see test/README.md)'
  )

  const hit = await waitFor(() => hits.find((h) => h.url.startsWith('/rest/v1')), { timeoutMs: 5000 })
  assert.ok(
    hit,
    'scheduled handler must GET <SUPABASE_URL>/rest/v1/...; the mock server received nothing — ' +
      'check .dev.vars SUPABASE_URL points at http://127.0.0.1:' +
      MOCK_PORT +
      ' (see test/README.md)'
  )
  const url = new URL('http://127.0.0.1' + hit.url)
  assert.ok(url.searchParams.get('apikey'), 'ping must include ?apikey=<anon>')
})
