// WP-F acceptance tests — immutable audit trail for price overrides and voids
// (frozen; see order-effects.contract.d.ts / ASSUMPTION 10 and 11).
//
// Covers brief item:
//   14. audit_events_written
//
// Run with: ELECTRON_RUN_AS_NODE=1 node_modules/electron/dist/electron.exe --no-warnings
//   --test test-harness/unit/order-effects/audit-events.test.mjs

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
const { recordAuditEvent } = await import('../../../src/main/services/audit-events.ts')

function freshDb() {
  const dir = mkdtempSync(path.join(tmpdir(), 'ffm-wpf-test-'))
  const dbPath = path.join(dir, 'test.db')
  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  runMigrations(db)
  return { db, dir }
}

function seedOrder(db, id = 1) {
  db.exec(`INSERT OR IGNORE INTO categories (id, name) VALUES (1, 'Burgers')`)
  db.exec(
    `INSERT OR IGNORE INTO menu_items (id, name, price, category_id, is_active) VALUES (1, 'Classic Burger', 500, 1, 1)`
  )
  db.prepare(
    `INSERT INTO orders (id, daily_number, order_date, order_type, status, subtotal, total)
     VALUES (?, 1, '2026-01-01', 'local', 'preparing', 500, 500)`
  ).run(id)
  db.prepare(
    `INSERT INTO order_items (id, order_id, menu_item_id, quantity, unit_price, total_price)
     VALUES (1, ?, 1, 1, 500, 500)`
  ).run(id)
}

test('audit_events_written: a price override appends an immutable row with original/new value, operator and timestamp', () => {
  const { db, dir } = freshDb()
  try {
    seedOrder(db)

    recordAuditEvent(db, {
      eventType: 'price_override',
      orderId: 1,
      orderItemId: 1,
      originalValue: '500',
      newValue: '0',
      operator: 'Manager Alice',
      reason: 'Customer goodwill'
    })

    const rows = db.prepare('SELECT * FROM audit_events WHERE order_id = 1').all()
    assert.equal(rows.length, 1)
    assert.equal(rows[0].event_type, 'price_override')
    assert.equal(rows[0].original_value, '500')
    assert.equal(rows[0].new_value, '0')
    assert.equal(rows[0].operator, 'Manager Alice')
    assert.ok(rows[0].created_at, 'created_at must be recorded')
  } finally {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('audit_events_written: a void appends its own immutable row alongside the price-override row', () => {
  const { db, dir } = freshDb()
  try {
    seedOrder(db)

    recordAuditEvent(db, {
      eventType: 'price_override',
      orderId: 1,
      orderItemId: 1,
      originalValue: '500',
      newValue: '0',
      operator: 'Manager Alice'
    })
    recordAuditEvent(db, {
      eventType: 'void',
      orderId: 1,
      originalValue: 'preparing',
      newValue: 'cancelled',
      operator: 'Manager Bob',
      reason: 'Customer walked out'
    })

    const rows = db.prepare('SELECT * FROM audit_events WHERE order_id = 1 ORDER BY id').all()
    assert.equal(rows.length, 2)
    assert.deepEqual(
      rows.map((r) => r.event_type),
      ['price_override', 'void']
    )
  } finally {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('audit_events_written: rows cannot be updated once written (immutable schema)', () => {
  const { db, dir } = freshDb()
  try {
    seedOrder(db)
    recordAuditEvent(db, {
      eventType: 'price_override',
      orderId: 1,
      orderItemId: 1,
      originalValue: '500',
      newValue: '0',
      operator: 'Manager Alice'
    })
    const row = db.prepare('SELECT id FROM audit_events WHERE order_id = 1').get()

    assert.throws(
      () => db.prepare(`UPDATE audit_events SET new_value = 'tampered' WHERE id = ?`).run(row.id),
      /abort|immutable|not allowed/i,
      'audit_events rows must have no update path — verified here at the schema/trigger level'
    )

    const after = db.prepare('SELECT new_value FROM audit_events WHERE id = ?').get(row.id)
    assert.equal(after.new_value, '0', 'the original value must remain untouched')
  } finally {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  }
})
