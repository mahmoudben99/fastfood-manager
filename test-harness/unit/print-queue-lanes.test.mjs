import assert from 'node:assert/strict'
import test from 'node:test'
import { DatabaseSync } from 'node:sqlite'
import { createPrintQueueWorker, ensurePrintJobColumns } from '../../src/main/services/print-queue.ts'

// Schema of migration 015 (print_jobs) — node:sqlite stands in for better-sqlite3 here.
function freshDb() {
  const db = new DatabaseSync(':memory:')
  db.exec(`
    CREATE TABLE print_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      event_type TEXT NOT NULL DEFAULT 'new',
      event_sequence INTEGER NOT NULL DEFAULT 1,
      document_type TEXT NOT NULL,
      scope TEXT NOT NULL DEFAULT 'all',
      worker_id INTEGER,
      status TEXT NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,
      next_attempt_at TEXT,
      last_error TEXT,
      last_attempt_at TEXT,
      completed_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE UNIQUE INDEX idx_print_jobs_unique_effect
    ON print_jobs(order_id, event_type, event_sequence, document_type, scope, IFNULL(worker_id, -1));
  `)
  ensurePrintJobColumns(db)
  return db
}

const insertJob = (db, id, printer, sequence = id) =>
  db.prepare(
    `INSERT INTO print_jobs (id, order_id, event_sequence, document_type, scope, printer_name, created_at)
     VALUES (?, 1, ?, 'kitchen', 'all', ?, datetime('now', ?))`
  ).run(id, sequence, printer, `+${id} seconds`)

const status = (db, id) => db.prepare('SELECT status FROM print_jobs WHERE id = ?').get(id).status

function deferred() {
  let resolve
  const promise = new Promise((r) => { resolve = r })
  return { promise, resolve }
}

test('ensurePrintJobColumns adds per-printer columns and lets one event fan out to several printers', () => {
  const db = freshDb()
  const columns = db.prepare('PRAGMA table_info(print_jobs)').all().map((c) => c.name)
  assert.ok(columns.includes('printer_name') && columns.includes('detail'))
  const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type = 'index'").all().map((i) => i.name)
  assert.ok(indexes.includes('idx_print_jobs_unique_printer'))
  assert.ok(!indexes.includes('idx_print_jobs_unique_effect'))
  // Same event, same scope, two printers: both allowed; the same printer twice is not.
  insertJob(db, 1, 'Counter', 1)
  insertJob(db, 2, 'Bar', 1)
  assert.throws(() => insertJob(db, 3, 'Bar', 1), /UNIQUE/)
  ensurePrintJobColumns(db) // idempotent
})

test('a hung printer does not block another printer; order is kept within a printer', async () => {
  const db = freshDb()
  insertJob(db, 1, 'Hung')
  insertJob(db, 2, 'Hung')
  insertJob(db, 3, 'Fast')
  const gate = deferred()
  const order = []
  const worker = createPrintQueueWorker({
    db,
    attemptPrint: async (job) => {
      order.push(job.id)
      if (job.id === 1) await gate.promise
      return { success: true }
    }
  })

  const first = worker.processOnce()
  await new Promise((r) => setTimeout(r, 20))
  assert.equal(status(db, 3), 'succeeded', 'the other printer printed while the first one hung')
  assert.equal(status(db, 1), 'printing')
  assert.equal(status(db, 2), 'pending')
  assert.equal(worker.isBusy(), true)

  // A tick while the lane is busy must not start a second runner on the same printer.
  await worker.processOnce()
  assert.deepEqual(order, [1, 3])

  gate.resolve()
  await first
  assert.deepEqual(order, [1, 3, 2])
  assert.equal(status(db, 2), 'succeeded')
  assert.equal(worker.isBusy(), false)
  await worker.idle()
})

test('a missing printer goes straight to attention instead of retrying for minutes', async () => {
  const db = freshDb()
  insertJob(db, 1, 'EPSON TM-T20')
  let calls = 0
  const worker = createPrintQueueWorker({
    db,
    attemptPrint: () => {
      calls += 1
      return { success: false, error: 'Printer "EPSON TM-T20" not found — check it is installed' }
    }
  })
  await worker.processOnce()
  const job = db.prepare('SELECT status, attempts, last_error FROM print_jobs WHERE id = 1').get()
  assert.equal(job.status, 'attention')
  assert.equal(job.attempts, 1)
  assert.match(job.last_error, /EPSON TM-T20/)
  await worker.processOnce()
  assert.equal(calls, 1)
})
