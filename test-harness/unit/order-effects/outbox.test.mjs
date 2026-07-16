// WP-F acceptance tests — durable transactional outbox (frozen; see
// order-effects.contract.d.ts / ASSUMPTION 5 and 6 for the outbox_events schema and
// the at-least-once-delivery + idempotent-consumer contract this suite pins down).
//
// Covers brief items:
//   7. outbox_idempotent_consumer
//   8. crash_after_commit_resumes
//
// Run with: ELECTRON_RUN_AS_NODE=1 node_modules/electron/dist/electron.exe --no-warnings
//   --test test-harness/unit/order-effects/outbox.test.mjs

import { register } from 'node:module'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import assert from 'node:assert/strict'
import Database from 'better-sqlite3'

const require = createRequire(import.meta.url)
const esbuildEntry = pathToFileURL(require.resolve('esbuild')).href
const loaderSrc = `
import { existsSync, statSync, readFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'
let esbuild
export async function initialize(data) { esbuild = await import(data.esbuildEntry) }
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('.') && context.parentURL) {
    try { return await nextResolve(specifier, context) }
    catch (err) {
      const parentDir = path.dirname(fileURLToPath(context.parentURL))
      const base = path.resolve(parentDir, specifier)
      const candidates = [base + '.ts', path.join(base, 'index.ts')]
      for (const cand of candidates) {
        if (existsSync(cand) && statSync(cand).isFile()) return nextResolve(pathToFileURL(cand).href, context)
      }
      throw err
    }
  }
  return nextResolve(specifier, context)
}
export async function load(url, context, nextLoad) {
  if (url.endsWith('.ts')) {
    const source = readFileSync(fileURLToPath(url), 'utf8')
    const result = esbuild.transformSync(source, { loader: 'ts', format: 'esm', target: 'node20' })
    return { format: 'module', source: result.code, shortCircuit: true }
  }
  return nextLoad(url, context)
}
`
register('data:text/javascript,' + encodeURIComponent(loaderSrc), import.meta.url, { data: { esbuildEntry } })

const { runMigrations } = await import('../../../src/main/database/migrations/index.ts')
const { createOutboxWorker } = await import('../../../src/main/services/outbox-worker.ts')

function freshDb(dbPath) {
  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  runMigrations(db)
  return db
}

function insertOutboxEvent(db, { id, eventType = 'analytics-dirty', payload = '{}' }) {
  db.prepare(
    `INSERT INTO outbox_events (id, event_type, payload, status, attempts) VALUES (?, ?, ?, 'pending', 0)`
  ).run(id, eventType, payload)
}

test('outbox_idempotent_consumer: a re-delivered event applies its downstream effect only once', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'ffm-wpf-test-'))
  const dbPath = path.join(dir, 'test.db')
  const db = freshDb(dbPath)
  try {
    insertOutboxEvent(db, { id: 1, eventType: 'analytics-dirty', payload: JSON.stringify({ orderId: 1 }) })

    // The consumer itself is idempotent, guarded by the event's own id — exactly what
    // a real owner-sync/telegram consumer must do, per SOL §4.9. This is the guarantee
    // item 7 actually cares about: the downstream EFFECT, not merely the worker's own
    // row bookkeeping.
    const appliedEffects = []
    const seenEventIds = new Set()
    const consumer = (event) => {
      if (seenEventIds.has(event.id)) return
      seenEventIds.add(event.id)
      appliedEffects.push(event.id)
    }

    const worker = createOutboxWorker({ db, consumers: { 'analytics-dirty': consumer } })

    await worker.processOnce()
    assert.deepEqual(appliedEffects, [1])
    let row = db.prepare('SELECT * FROM outbox_events WHERE id = 1').get()
    assert.equal(row.status, 'done')

    // Simulate a crash/restart replay that re-delivers the SAME already-handled event
    // (e.g. an operator replay, or a worker that crashed after invoking the consumer
    // but before committing its own 'done' bookkeeping) by resetting the row back to
    // 'pending' and processing it again with the same consumer.
    db.prepare(`UPDATE outbox_events SET status = 'pending' WHERE id = 1`).run()
    await worker.processOnce()

    assert.deepEqual(
      appliedEffects,
      [1],
      'the downstream effect must be applied exactly once even when the event is redelivered'
    )
  } finally {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('crash_after_commit_resumes: a fresh worker instance on the same DB picks up a pending event exactly once', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'ffm-wpf-test-'))
  const dbPath = path.join(dir, 'test.db')

  // "Before the crash": one process instance commits the order + its pending outbox row.
  const dbBeforeCrash = freshDb(dbPath)
  insertOutboxEvent(dbBeforeCrash, { id: 1, eventType: 'queue-broadcast', payload: '{}' })
  dbBeforeCrash.close() // simulate the process dying with the row still 'pending'

  // "After the restart": a brand-new Database handle + a brand-new worker instance,
  // as a real app restart would create.
  const dbAfterRestart = new Database(dbPath)
  dbAfterRestart.pragma('journal_mode = WAL')
  dbAfterRestart.pragma('foreign_keys = ON')

  let calls = 0
  const consumer = () => {
    calls += 1
  }
  const worker = createOutboxWorker({ db: dbAfterRestart, consumers: { 'queue-broadcast': consumer } })

  try {
    await worker.processOnce()
    assert.equal(calls, 1, 'the pending event must survive the restart and be picked up')
    assert.equal(
      dbAfterRestart.prepare('SELECT status FROM outbox_events WHERE id = 1').get().status,
      'done'
    )

    await worker.processOnce()
    assert.equal(calls, 1, 'a already-done event must not be picked up a second time')
  } finally {
    dbAfterRestart.close()
    rmSync(dir, { recursive: true, force: true })
  }
})
