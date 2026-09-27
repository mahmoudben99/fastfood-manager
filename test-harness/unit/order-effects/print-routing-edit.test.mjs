// v3.2.1 print routing through the real order service: one durable job per assigned printer,
// "All Items" printers keep the full ticket in split mode, task-less printers are not a
// fallback, and an order edit reaches the station whose only line was removed.
//
// Run with: ELECTRON_RUN_AS_NODE=1 node_modules/electron/dist/electron.exe --no-warnings
//   --test test-harness/unit/order-effects/print-routing-edit.test.mjs

import { register } from 'node:module'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import assert from 'node:assert/strict'
import Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'

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
const { createOrderService } = await import('../../../src/main/services/order-service.ts')

function freshDb() {
  const dir = mkdtempSync(path.join(tmpdir(), 'ffm-print-test-'))
  const db = new Database(path.join(dir, 'test.db'))
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  runMigrations(db)
  return { db, dir }
}

function seedStations(db) {
  db.exec(`INSERT INTO categories (id, name) VALUES (1, 'Burgers'), (2, 'Drinks')`)
  db.exec(`INSERT INTO menu_items (id, name, price, category_id, is_active)
           VALUES (1, 'Classic Burger', 500, 1, 1), (2, 'Soda', 100, 2, 1)`)
  db.exec(`INSERT INTO workers (id, name, role, pay_full_day, pay_half_day) VALUES (1, 'Grill', 'cook', 1, 1), (2, 'Drinks', 'cook', 1, 1)`)
  const insert = db.prepare(
    `INSERT INTO printer_assignments (printer_name, assignment_type, worker_id, is_active, auto_print)
     VALUES (?, ?, ?, 1, 1)`
  )
  insert.run('OFFICE', 'default', null)
  insert.run('KITCHEN', 'kitchen_all', null)
  insert.run('GRILL', 'worker', 1)
  insert.run('BAR', 'worker', 2)
  insert.run('BAR2', 'worker', 2)
  db.exec(`INSERT OR REPLACE INTO settings (key, value) VALUES
    ('split_kitchen_tickets', 'true'), ('auto_print_receipt', 'false'), ('auto_print_kitchen', 'true'),
    ('printer_name', 'OFFICE'), ('kitchen_printer_name', 'OFFICE')`)
}

const jobsFor = (db, orderId, eventType) =>
  db.prepare('SELECT * FROM print_jobs WHERE order_id = ? AND event_type = ? ORDER BY id').all(orderId, eventType)
const brief = (jobs) => jobs.map((j) => `${j.scope}/${j.worker_id ?? '-'}@${j.printer_name}`).sort()

test('new order: one job per assigned printer, full ticket on All Items, nothing on the task-less office printer', () => {
  const { db, dir } = freshDb()
  try {
    seedStations(db)
    const service = createOrderService({ db })
    const created = service.createOrder({
      source: 'pos',
      sourceRequestId: randomUUID(),
      orderType: 'local',
      lines: [{ menuItemId: 1, quantity: 1, workerId: 1 }, { menuItemId: 2, quantity: 1, workerId: 2 }],
      applyAutoPromotions: false
    })
    assert.equal(created.ok, true)
    assert.deepEqual(brief(jobsFor(db, created.orderId, 'new')), [
      'all/-@KITCHEN', 'worker/1@GRILL', 'worker/2@BAR', 'worker/2@BAR2'
    ])
  } finally {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('order edit: the station whose only line was removed gets an UPDATED ticket with the removal', () => {
  const { db, dir } = freshDb()
  try {
    seedStations(db)
    const service = createOrderService({ db })
    const created = service.createOrder({
      source: 'pos',
      sourceRequestId: randomUUID(),
      orderType: 'local',
      lines: [{ menuItemId: 1, quantity: 1, workerId: 1 }, { menuItemId: 2, quantity: 1, workerId: 2 }],
      applyAutoPromotions: false
    })
    const burger = db.prepare('SELECT id FROM order_items WHERE order_id = ? AND menu_item_id = 1').get(created.orderId)
    const edited = service.updateOrderLines({
      orderId: created.orderId,
      lines: [{ orderItemId: burger.id, menuItemId: 1, quantity: 1 }]
    })
    assert.equal(edited.ok, true)
    const updated = jobsFor(db, created.orderId, 'updated')
    // Drinks lost its only line (it would never have heard otherwise); Grill had no change.
    assert.deepEqual(brief(updated), ['all/-@KITCHEN', 'worker/2@BAR', 'worker/2@BAR2'])
    const detail = JSON.parse(updated.find((j) => j.printer_name === 'BAR').detail)
    assert.equal(detail.changes.length, 1)
    assert.equal(detail.changes[0].kind, 'removed')
    assert.equal(detail.changes[0].workerId, 2)
    assert.equal(detail.changes[0].menuItemId, 2)
  } finally {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  }
})
