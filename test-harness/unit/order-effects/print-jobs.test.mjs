// WP-F acceptance tests — durable print-job lifecycle (frozen; see
// order-effects.contract.d.ts for createPrintQueueWorker's exact shape and the
// classification rules it must implement, mirrored from the existing but
// Electron-coupled processPendingPrintJobs() in printer.ipc.ts).
//
// Covers brief items:
//   5. print_job_lifecycle
//   6. print_ambiguous_attention
//
// Run with: ELECTRON_RUN_AS_NODE=1 node_modules/electron/dist/electron.exe --no-warnings
//   --test test-harness/unit/order-effects/print-jobs.test.mjs
// (see create-order.test.mjs's header comment / the test-author report for why)

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
const { createPrintQueueWorker } = await import('../../../src/main/services/print-queue.ts')

function freshDb() {
  const dir = mkdtempSync(path.join(tmpdir(), 'ffm-wpf-test-'))
  const dbPath = path.join(dir, 'test.db')
  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  runMigrations(db)
  return { db, dir }
}

function seedOrder(db, id) {
  db.prepare(
    `INSERT INTO orders (id, daily_number, order_date, order_type, status, subtotal, total)
     VALUES (?, ?, '2026-01-01', 'local', 'preparing', 1000, 1000)`
  ).run(id, id)
}

function insertPrintJob(db, { id, orderId, documentType = 'kitchen', scope = 'all' }) {
  db.prepare(
    `INSERT INTO print_jobs (id, order_id, event_type, event_sequence, document_type, scope, worker_id, status)
     VALUES (?, ?, 'new', 1, ?, ?, NULL, 'pending')`
  ).run(id, orderId, documentType, scope)
}

function getJob(db, id) {
  return db.prepare('SELECT * FROM print_jobs WHERE id = ?').get(id)
}

test('print_job_lifecycle: transient failure retries with backoff, then succeeds -> done', async () => {
  const { db, dir } = freshDb()
  try {
    seedOrder(db, 1)
    insertPrintJob(db, { id: 1, orderId: 1 })

    let clock = new Date('2026-01-01T12:00:00.000Z')
    const now = () => clock
    let call = 0
    const attemptPrint = () => {
      call += 1
      // First attempt: transient failure (printer offline, not a config/timeout error).
      // Second attempt: succeeds.
      return call === 1 ? { success: false, error: 'Printer offline' } : { success: true }
    }

    const worker = createPrintQueueWorker({ db, attemptPrint, now })

    await worker.processOnce()
    let job = getJob(db, 1)
    assert.equal(job.status, 'pending', 'a transient failure must retry, not give up')
    assert.equal(job.attempts, 1)
    assert.equal(job.last_error, 'Printer offline')

    // Advance the injected clock well past any reasonable backoff window before retrying.
    clock = new Date(clock.getTime() + 5 * 60_000)
    await worker.processOnce()
    job = getJob(db, 1)
    assert.equal(job.status, 'succeeded', 'the retry must be allowed to succeed')
    assert.equal(call, 2, 'attemptPrint should have been invoked exactly twice')
  } finally {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('print_job_lifecycle: an unroutable split-group job fails visibly, NEVER a silent success', async () => {
  const { db, dir } = freshDb()
  try {
    seedOrder(db, 1)
    insertPrintJob(db, { id: 1, orderId: 1, documentType: 'kitchen', scope: 'worker' })

    const attemptPrint = () => ({ success: false, error: 'No printer configured for this station' })
    const worker = createPrintQueueWorker({ db, attemptPrint, now: () => new Date('2026-01-01T12:00:00Z') })

    await worker.processOnce()
    const job = getJob(db, 1)
    assert.notEqual(job.status, 'succeeded', 'an unroutable job must never be marked succeeded')
    assert.equal(job.status, 'attention', 'a configuration failure escalates to attention, not endless retry')
    assert.ok(job.last_error && job.last_error.length > 0)
  } finally {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('print_ambiguous_attention: an OS-spool timeout goes straight to attention, NOT auto-retried', async () => {
  const { db, dir } = freshDb()
  try {
    seedOrder(db, 1)
    insertPrintJob(db, { id: 1, orderId: 1 })

    let calls = 0
    const attemptPrint = () => {
      calls += 1
      return { success: false, error: 'Print timeout — possible OS spool in progress' }
    }
    const worker = createPrintQueueWorker({ db, attemptPrint, now: () => new Date('2026-01-01T12:00:00Z') })

    await worker.processOnce()
    let job = getJob(db, 1)
    assert.equal(job.status, 'attention', 'an ambiguous timeout must require human attention')
    assert.equal(job.attempts, 1)

    // Confirm it is NOT auto-retried on a later processOnce() call — attention jobs
    // require an explicit human retry action, never blind automatic re-attempt.
    await worker.processOnce()
    job = getJob(db, 1)
    assert.equal(job.status, 'attention', 'attention jobs must not be picked back up automatically')
    assert.equal(calls, 1, 'attemptPrint must not be invoked again for a job awaiting attention')
  } finally {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  }
})
