// WP-F acceptance tests — order creation atomicity (frozen; see order-effects.contract.d.ts).
//
// Covers brief items:
//   1. create_atomic
//   2. create_duplicate_request
//   3. create_infra_error_rethrow
//   4. create_bad_line_rejected
//
// HOW TO RUN (see test-author report for the full explanation of why this is required):
//   ELECTRON_RUN_AS_NODE=1 node_modules/electron/dist/electron.exe --no-warnings --test \
//     test-harness/unit/order-effects/create-order.test.mjs
//
// Plain `node --test` will NOT work: this project's better-sqlite3 native build is
// compiled for Electron's bundled Node ABI, not the system Node. Electron's own Node
// (via ELECTRON_RUN_AS_NODE=1) matches that ABI but lacks native TypeScript support, so
// this file also registers a tiny esbuild-backed loader (below) purely to make this
// codebase's extensionless relative TS imports resolve — it changes nothing in src/.

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
// This import will fail with "Cannot find module" until WP-F actually creates
// src/main/services/order-service.ts per order-effects.contract.d.ts. That failure is
// expected and correct for a frozen acceptance test written before implementation.
const { createOrderService } = await import('../../../src/main/services/order-service.ts')

function freshDb() {
  const dir = mkdtempSync(path.join(tmpdir(), 'ffm-wpf-test-'))
  const dbPath = path.join(dir, 'test.db')
  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  runMigrations(db)
  return { db, dir, dbPath }
}

/** One active menu item (price 500) backed by 100kg of stock, 150g/unit recipe. */
function seedBasicMenu(db) {
  db.exec(`INSERT INTO categories (id, name) VALUES (1, 'Burgers')`)
  db.exec(`INSERT INTO stock_items (id, name, unit_type, quantity, price_per_unit, is_active)
           VALUES (1, 'Beef', 'kg', 100, 1200, 1)`)
  db.exec(`INSERT INTO menu_items (id, name, price, category_id, is_active)
           VALUES (1, 'Classic Burger', 500, 1, 1)`)
  db.exec(`INSERT INTO menu_item_ingredients (menu_item_id, stock_item_id, quantity, unit)
           VALUES (1, 1, 150, 'g')`)
}

function seedInactiveMenuItem(db, id = 2) {
  db.prepare(
    `INSERT INTO menu_items (id, name, price, category_id, is_active) VALUES (?, 'Discontinued', 300, 1, 0)`
  ).run(id)
}

function seedActivePromotion(db) {
  // 10% off everything.
  db.exec(
    `INSERT INTO promotions (id, name, type, discount_value, applies_to, is_active)
     VALUES (1, 'Everything 10%', 'percentage', 10, 'all', 1)`
  )
}

function countRows(db, table) {
  return db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n
}

test('create_atomic: persists order + items + deductions + loyalty + print_jobs + outbox_events in ONE transaction, totals net of discount', () => {
  const { db, dir } = freshDb()
  try {
    seedBasicMenu(db)
    seedActivePromotion(db)
    const service = createOrderService({ db })

    const result = service.createOrder({
      source: 'pos',
      sourceRequestId: randomUUID(),
      orderType: 'local',
      tableNumber: '5',
      lines: [{ menuItemId: 1, quantity: 2 }],
      customer: { phone: '0550123456', name: 'Test Customer' },
      applyAutoPromotions: true
    })

    assert.equal(result.ok, true)
    assert.equal(result.duplicate, false)
    assert.equal(result.subtotal, 1000) // 500 * 2
    assert.ok(result.discountAmount > 0, 'expected the active 10% promotion to apply a discount')
    assert.equal(result.total, result.subtotal - result.discountAmount, 'total must be net of discount')
    assert.ok(Array.isArray(result.printJobIds))

    // Order row exists and its stored totals match what the caller was told.
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(result.orderId)
    assert.ok(order, 'order row must exist')
    assert.equal(order.subtotal, result.subtotal)
    assert.equal(order.total, result.total)
    assert.equal(order.discount_amount, result.discountAmount)
    assert.equal(order.daily_number, result.dailyNumber)
    assert.equal(order.order_date, result.orderDate)

    // Items + deductions.
    const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(result.orderId)
    assert.equal(items.length, 1)
    assert.equal(items[0].quantity, 2)
    const deductions = db
      .prepare('SELECT * FROM order_item_deductions WHERE order_item_id = ?')
      .all(items[0].id)
    assert.equal(deductions.length, 1)
    assert.ok(deductions[0].quantity_deducted > 0)

    // Loyalty: customer created/linked and accrued this order's net total.
    const customer = db.prepare('SELECT * FROM customers WHERE order_count > 0').get()
    assert.ok(customer, 'a customer row must have been created for the loyalty phone')
    assert.equal(customer.total_spent, result.total)
    assert.equal(order.customer_id, customer.id)

    // Durable print jobs committed in the same transaction as the order.
    assert.ok(result.printJobIds.length > 0, 'expected at least one print job to be enqueued')
    const printJobs = db
      .prepare('SELECT * FROM print_jobs WHERE order_id = ?')
      .all(result.orderId)
    assert.equal(printJobs.length, result.printJobIds.length)
    for (const job of printJobs) assert.equal(job.status, 'pending')

    // Durable outbox rows for the required side effects.
    const outboxCount = countRows(db, 'outbox_events')
    assert.ok(outboxCount > 0, 'expected at least one outbox_events row for the new order')
  } finally {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('create_bad_line_rejected: a non-finite quantity rejects the WHOLE order, nothing persisted', () => {
  const { db, dir } = freshDb()
  try {
    seedBasicMenu(db)
    const service = createOrderService({ db })

    const result = service.createOrder({
      source: 'pos',
      sourceRequestId: randomUUID(),
      orderType: 'local',
      lines: [
        { menuItemId: 1, quantity: 1 },
        { menuItemId: 1, quantity: Number.NaN }
      ],
      applyAutoPromotions: false
    })

    assert.equal(result.ok, false)
    assert.equal(result.code, 'invalid_input')
    assert.equal(result.lineIndex, 1)
    assert.equal(countRows(db, 'orders'), 0, 'no order row on rejection')
    assert.equal(countRows(db, 'order_items'), 0, 'no order_items on rejection')
    assert.equal(countRows(db, 'order_item_deductions'), 0)
  } finally {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('create_bad_line_rejected: a quantity over the 999-unit cap rejects the WHOLE order', () => {
  const { db, dir } = freshDb()
  try {
    seedBasicMenu(db)
    const service = createOrderService({ db })

    const result = service.createOrder({
      source: 'pos',
      sourceRequestId: randomUUID(),
      orderType: 'local',
      lines: [{ menuItemId: 1, quantity: 1000 }],
      applyAutoPromotions: false
    })

    assert.equal(result.ok, false)
    assert.equal(result.code, 'invalid_input')
    assert.equal(countRows(db, 'orders'), 0)
  } finally {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('create_bad_line_rejected: an inactive menu item rejects the WHOLE order, not just that line', () => {
  const { db, dir } = freshDb()
  try {
    seedBasicMenu(db)
    seedInactiveMenuItem(db, 2)
    const service = createOrderService({ db })

    const result = service.createOrder({
      source: 'pos',
      sourceRequestId: randomUUID(),
      orderType: 'local',
      lines: [
        { menuItemId: 1, quantity: 1 }, // active, would otherwise succeed
        { menuItemId: 2, quantity: 1 } // inactive
      ],
      applyAutoPromotions: false
    })

    assert.equal(result.ok, false)
    assert.equal(result.code, 'inactive_item')
    assert.equal(result.lineIndex, 1)
    assert.equal(countRows(db, 'orders'), 0, 'the active line must NOT be silently kept')
    assert.equal(countRows(db, 'order_items'), 0)
  } finally {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('create_duplicate_request: same (source, sourceRequestId) returns the existing order with ZERO new side effects', () => {
  const { db, dir } = freshDb()
  try {
    seedBasicMenu(db)
    const service = createOrderService({ db })
    const sourceRequestId = randomUUID()

    const input = {
      source: 'pos',
      sourceRequestId,
      orderType: 'local',
      lines: [{ menuItemId: 1, quantity: 3 }],
      applyAutoPromotions: false
    }

    const first = service.createOrder(input)
    assert.equal(first.ok, true)
    assert.equal(first.duplicate, false)

    const ordersBefore = countRows(db, 'orders')
    const itemsBefore = countRows(db, 'order_items')
    const deductionsBefore = countRows(db, 'order_item_deductions')
    const printJobsBefore = countRows(db, 'print_jobs')
    const outboxBefore = countRows(db, 'outbox_events')
    const stockBefore = db.prepare('SELECT quantity FROM stock_items WHERE id = 1').get().quantity

    const second = service.createOrder(input)
    assert.equal(second.ok, true)
    assert.equal(second.duplicate, true)
    assert.equal(second.orderId, first.orderId)
    assert.equal(second.dailyNumber, first.dailyNumber)
    assert.equal(second.total, first.total)

    assert.equal(countRows(db, 'orders'), ordersBefore, 'no new order row on duplicate resubmit')
    assert.equal(countRows(db, 'order_items'), itemsBefore, 'no new order_items on duplicate resubmit')
    assert.equal(countRows(db, 'order_item_deductions'), deductionsBefore, 'no new deductions')
    assert.equal(countRows(db, 'print_jobs'), printJobsBefore, 'no new print jobs on duplicate resubmit')
    assert.equal(countRows(db, 'outbox_events'), outboxBefore, 'no new outbox events on duplicate resubmit')
    assert.equal(
      db.prepare('SELECT quantity FROM stock_items WHERE id = 1').get().quantity,
      stockBefore,
      'stock must not be deducted twice'
    )
  } finally {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('create_infra_error_rethrow: an infrastructure failure during the transaction leaves NO rows anywhere (clean rollback)', () => {
  const { db, dir, dbPath } = freshDb()
  try {
    seedBasicMenu(db)
    db.close()

    // Reopen the SAME file read-only: every write inside createOrder()'s transaction
    // will fail with SQLITE_READONLY, simulating an infra-level failure (SQLITE_FULL/
    // SQLITE_BUSY per SOL §4.20) regardless of which statement the implementer writes
    // first. This is deliberately implementation-agnostic (no coupling to exact SQL
    // text) — see the brief's own suggested techniques and the test-author report.
    const readonlyDb = new Database(dbPath, { readonly: true })
    const service = createOrderService({ db: readonlyDb })

    let thrown = null
    let result
    try {
      result = service.createOrder({
        source: 'pos',
        sourceRequestId: randomUUID(),
        orderType: 'local',
        lines: [{ menuItemId: 1, quantity: 1 }],
        applyAutoPromotions: false
      })
    } catch (err) {
      thrown = err
    }

    // CONTRACT §3: the service either rethrows (caller sees an exception) or returns
    // {ok:false, code:'db_failure'} — never a silently "succeeded" order and never a
    // caught-and-continued write. Accept either surfacing mechanism.
    if (thrown === null) {
      assert.equal(result.ok, false)
      assert.equal(result.code, 'db_failure')
    }

    assert.equal(
      readonlyDb.prepare('SELECT COUNT(*) AS n FROM orders').get().n,
      0,
      'no order row after an infra failure'
    )
    assert.equal(readonlyDb.prepare('SELECT COUNT(*) AS n FROM order_items').get().n, 0)
    assert.equal(readonlyDb.prepare('SELECT COUNT(*) AS n FROM print_jobs').get().n, 0, 'no orphan print_jobs')
    assert.equal(readonlyDb.prepare('SELECT COUNT(*) AS n FROM outbox_events').get().n, 0, 'no orphan outbox_events')
    readonlyDb.close()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
