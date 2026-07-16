import { test } from 'node:test'
import assert from 'node:assert/strict'
import { req } from './helpers/client.mjs'

// CONTRACT §1.5: GET /health — no auth. 200 { ok: true, service: 'ffm-license' }.
test('health', async () => {
  const res = await req('/health', { method: 'GET' })
  assert.equal(res.status, 200)
  assert.equal(res.json?.ok, true)
  assert.equal(res.json?.service, 'ffm-license')
})
