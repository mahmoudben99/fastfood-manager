// WP-F acceptance tests — edit safety (frozen; see order-effects.contract.d.ts /
// ASSUMPTION 8 for updateOrderHeader / updateOrderLines / updateOrderStatus shapes).
//
// Covers brief items:
//   9.  edit_preserves_discount
//   10. header_edit_no_stock_touch
//   11. line_edit_same_day_only
//   12. restore_clears_completed_at
//
// Run with: ELECTRON_RUN_AS_NODE=1 node_modules/electron/dist/electron.exe --no-warnings
//   --test test-harness/unit/order-effects/edit-safety.test.mjs

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
  const dir = mkdtempSync(path.join(tmpdir(), 'ffm-wpf-test-'))
  const dbPath = path.join(dir, 'test.db')
  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  runMigrations(db)
  return { db, dir }
}

function seedBasicMenu(db) {
  db.exec(`INSERT INTO categories (id, name) VALUES (1, 'Burgers')`)
  db.exec(`INSERT INTO stock_items (id, name, unit_type, quantity, price_per_unit, is_active)
           VALUES (1, 'Beef', 'kg', 100, 1200, 1)`)
  db.exec(`INSERT INTO menu_items (id, name, price, category_id, is_active)
           VALUES (1, 'Classic Burger', 500, 1, 1)`)
  db.exec(`INSERT INTO menu_item_ingredients (menu_item_id, stock_item_id, quantity, unit)
           VALUES (1, 1, 150, 'g')`)
}

function seedPromotion(db, { id, discountValue }) {
  db.prepare(
    `INSERT INTO promotions (id, name, type, discount_value, applies_to, is_active)
     VALUES (?, ?, 'percentage', ?, 'all', 1)`
  ).run(id, 'Promo ' + id, discountValue)
}

test('edit_preserves_discount: header edit keeps the stored total/discount even with a new promotion now active', () => {
  const { db, dir } = freshDb()
  try {
    seedBasicMenu(db)
    seedPromotion(db, { id: 1, discountValue: 10 }) // 10% off, active at creation time
    const service = createOrderService({ db })

    const created = service.createOrder({
      source: 'pos',
      sourceRequestId: randomUUID(),
      orderType: 'local',
      lines: [{ menuItemId: 1, quantity: 2 }],
      applyAutoPromotions: true
    })
    assert.equal(created.ok, true)
    assert.ok(created.discountAmount > 0, 'setup requires a real discount on the original order')

    // A much more generous promotion becomes active AFTER the order was placed.
    seedPromotion(db, { id: 2, discountValue: 50 })

    const edited = service.updateOrderHeader({
      orderId: created.orderId,
      note: 'Called back, confirmed address',
      customer: { phone: '0550998877' }
    })

    assert.equal(edited.ok, true)
    assert.equal(edited.total, created.total, 'header edit must not reprice the order')
    assert.equal(edited.discountAmount, created.discountAmount, 'the ORIGINAL discount must be preserved exactly')

    const row = db.prepare('SELECT * FROM orders WHERE id = ?').get(created.orderId)
    assert.equal(row.total, created.total)
    assert.equal(row.discount_amount, created.discountAmount)
    assert.equal(row.notes, 'Called back, confirmed address', 'the header fields must actually have changed')
  } finally {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('header_edit_no_stock_touch: a header-only edit leaves deductions byte-identical and adds no stock movement', () => {
  const { db, dir } = freshDb()
  try {
    seedBasicMenu(db)
    const service = createOrderService({ db })

    const created = service.createOrder({
      source: 'pos',
      sourceRequestId: randomUUID(),
      orderType: 'local',
      lines: [{ menuItemId: 1, quantity: 2 }],
      applyAutoPromotions: false
    })
    assert.equal(created.ok, true)

    const deductionsBefore = db
      .prepare(
        `SELECT oid.* FROM order_item_deductions oid
         JOIN order_items oi ON oi.id = oid.order_item_id
         WHERE oi.order_id = ? ORDER BY oid.id`
      )
      .all(created.orderId)
    const stockAdjustmentsBefore = db.prepare('SELECT COUNT(*) AS n FROM stock_adjustments').get().n
    const stockQtyBefore = db.prepare('SELECT quantity FROM stock_items WHERE id = 1').get().quantity

    const edited = service.updateOrderHeader({ orderId: created.orderId, tableNumber: '9' })
    assert.equal(edited.ok, true)

    const deductionsAfter = db
      .prepare(
        `SELECT oid.* FROM order_item_deductions oid
         JOIN order_items oi ON oi.id = oid.order_item_id
         WHERE oi.order_id = ? ORDER BY oid.id`
      )
      .all(created.orderId)
    assert.deepEqual(deductionsAfter, deductionsBefore, 'deductions must be byte-identical after a header-only edit')
    assert.equal(
      db.prepare('SELECT COUNT(*) AS n FROM stock_adjustments').get().n,
      stockAdjustmentsBefore,
      'no new stock_adjustments rows from a header-only edit'
    )
    assert.equal(
      db.prepare('SELECT quantity FROM stock_items WHERE id = 1').get().quantity,
      stockQtyBefore,
      'stock quantity must not move for a header-only edit'
    )

    const row = db.prepare('SELECT table_number FROM orders WHERE id = ?').get(created.orderId)
    assert.equal(row.table_number, '9')
  } finally {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('line_edit_same_day_only: a same-day, non-completed order accepts a line edit', () => {
  const { db, dir } = freshDb()
  try {
    seedBasicMenu(db)
    const service = createOrderService({ db })

    const created = service.createOrder({
      source: 'pos',
      sourceRequestId: randomUUID(),
      orderType: 'local',
      lines: [{ menuItemId: 1, quantity: 1 }],
      applyAutoPromotions: false
    })
    assert.equal(created.ok, true)

    const edited = service.updateOrderLines({
      orderId: created.orderId,
      lines: [{ menuItemId: 1, quantity: 2 }]
    })
    assert.equal(edited.ok, true, 'a same-day, non-finalized order must accept a line edit')
    assert.equal(edited.subtotal, 1000) // 500 * 2
  } finally {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('line_edit_same_day_only: a completed order from a PAST day rejects a line edit with a typed error', () => {
  const { db, dir } = freshDb()
  try {
    seedBasicMenu(db)
    const service = createOrderService({ db })

    const created = service.createOrder({
      source: 'pos',
      sourceRequestId: randomUUID(),
      orderType: 'local',
      lines: [{ menuItemId: 1, quantity: 1 }],
      applyAutoPromotions: false
    })
    assert.equal(created.ok, true)

    // Simulate this order having been placed, and finalized, on a prior calendar day.
    db.prepare(`UPDATE orders SET order_date = '2000-01-01', status = 'completed' WHERE id = ?`).run(
      created.orderId
    )

    const edited = service.updateOrderLines({
      orderId: created.orderId,
      lines: [{ menuItemId: 1, quantity: 5 }]
    })
    assert.equal(edited.ok, false)
    assert.equal(edited.code, 'line_edit_not_allowed')

    // Nothing must have changed.
    const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(created.orderId)
    assert.equal(items.length, 1)
    assert.equal(items[0].quantity, 1)
  } finally {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('restore_clears_completed_at: completed -> preparing clears completed_at', () => {
  const { db, dir } = freshDb()
  try {
    seedBasicMenu(db)
    const service = createOrderService({ db })

    const created = service.createOrder({
      source: 'pos',
      sourceRequestId: randomUUID(),
      orderType: 'local',
      lines: [{ menuItemId: 1, quantity: 1 }],
      applyAutoPromotions: false
    })
    assert.equal(created.ok, true)

    const completed = service.updateOrderStatus(created.orderId, 'completed')
    assert.equal(completed.ok, true)
    let row = db.prepare('SELECT status, completed_at FROM orders WHERE id = ?').get(created.orderId)
    assert.equal(row.status, 'completed')
    assert.ok(row.completed_at, 'completed_at must be set when completing')

    const restored = service.updateOrderStatus(created.orderId, 'preparing')
    assert.equal(restored.ok, true)
    row = db.prepare('SELECT status, completed_at FROM orders WHERE id = ?').get(created.orderId)
    assert.equal(row.status, 'preparing')
    assert.equal(row.completed_at, null, 'restoring to an active status must clear completed_at')
  } finally {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  }
})
