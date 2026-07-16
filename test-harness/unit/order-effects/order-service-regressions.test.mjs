// WP-F implementer regressions. Frozen author tests remain unchanged.
// Run with ELECTRON_RUN_AS_NODE=1 and Electron's bundled Node (same as the frozen suite).

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
      const base = path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier)
      for (const candidate of [base + '.ts', path.join(base, 'index.ts')]) {
        if (existsSync(candidate) && statSync(candidate).isFile()) {
          return nextResolve(pathToFileURL(candidate).href, context)
        }
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
register('data:text/javascript,' + encodeURIComponent(loaderSrc), import.meta.url, {
  data: { esbuildEntry }
})

const { runMigrations } = await import('../../../src/main/database/migrations/index.ts')
const { createOrderService } = await import('../../../src/main/services/order-service.ts')

function freshDb() {
  const dir = mkdtempSync(path.join(tmpdir(), 'ffm-wpf-regression-'))
  const db = new Database(path.join(dir, 'test.db'))
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  runMigrations(db)
  return { db, dir }
}

function seedMenu(db) {
  db.exec(`
    INSERT INTO categories (id, name) VALUES (1, 'Food');
    INSERT INTO stock_items (id, name, unit_type, quantity, price_per_unit, is_active)
      VALUES (1, 'Beef', 'kg', 100, 1200, 1), (2, 'Potato', 'kg', 100, 300, 1);
    INSERT INTO menu_items (id, name, price, category_id, is_active)
      VALUES (1, 'Burger', 500, 1, 1), (2, 'Fries', 200, 1, 1);
    INSERT INTO menu_item_ingredients (menu_item_id, stock_item_id, quantity, unit)
      VALUES (1, 1, 150, 'g'), (2, 2, 100, 'g');
  `)
}

const fixedNow = () => new Date('2026-07-16T12:00:00.000Z')

test('retained-line edit preserves its stored unit price after the menu price changes', () => {
  const { db, dir } = freshDb()
  try {
    seedMenu(db)
    const service = createOrderService({ db, now: fixedNow })
    const created = service.createOrder({
      source: 'pos',
      sourceRequestId: randomUUID(),
      orderType: 'local',
      lines: [{ menuItemId: 1, quantity: 1 }, { menuItemId: 2, quantity: 1 }],
      applyAutoPromotions: false
    })
    assert.equal(created.ok, true)
    const original = db.prepare(
      'SELECT * FROM order_items WHERE order_id = ? ORDER BY menu_item_id'
    ).all(created.orderId)

    db.prepare('UPDATE menu_items SET price = 650 WHERE id = 1').run()
    const edited = service.updateOrderLines({
      orderId: created.orderId,
      lines: [
        { orderItemId: original[0].id, menuItemId: 1, quantity: 1 },
        { orderItemId: original[1].id, menuItemId: 2, quantity: 2 }
      ]
    })

    assert.equal(edited.ok, true)
    assert.equal(edited.subtotal, 900, '500 stored Burger + 2x200 Fries')
    const burger = db.prepare(
      'SELECT id, unit_price FROM order_items WHERE order_id = ? AND menu_item_id = 1'
    ).get(created.orderId)
    assert.equal(burger.id, original[0].id, 'retained line identity must survive the edit')
    assert.equal(burger.unit_price, 500, 'retained line must not reprice to the new 650 menu price')
  } finally {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('cancel restores stock and loyalty; restore reapplies both exactly once', () => {
  const { db, dir } = freshDb()
  try {
    seedMenu(db)
    const service = createOrderService({ db, now: fixedNow })
    const created = service.createOrder({
      source: 'pos',
      sourceRequestId: randomUUID(),
      orderType: 'takeout',
      customer: { phone: '0550000000', name: 'Regular' },
      lines: [{ menuItemId: 1, quantity: 1 }],
      applyAutoPromotions: false
    })
    assert.equal(created.ok, true)

    assert.equal(db.prepare('SELECT quantity FROM stock_items WHERE id = 1').get().quantity, 99.85)
    assert.deepEqual(
      db.prepare('SELECT total_spent, order_count FROM customers').get(),
      { total_spent: 500, order_count: 1 }
    )

    assert.equal(service.updateOrderStatus(created.orderId, 'cancelled').ok, true)
    assert.equal(db.prepare('SELECT quantity FROM stock_items WHERE id = 1').get().quantity, 100)
    assert.deepEqual(
      db.prepare('SELECT total_spent, order_count FROM customers').get(),
      { total_spent: 0, order_count: 0 }
    )

    // Same-state replay must not reverse twice.
    assert.equal(service.updateOrderStatus(created.orderId, 'cancelled').ok, true)
    assert.equal(db.prepare('SELECT quantity FROM stock_items WHERE id = 1').get().quantity, 100)

    assert.equal(service.updateOrderStatus(created.orderId, 'preparing').ok, true)
    assert.equal(db.prepare('SELECT quantity FROM stock_items WHERE id = 1').get().quantity, 99.85)
    assert.deepEqual(
      db.prepare('SELECT total_spent, order_count FROM customers').get(),
      { total_spent: 500, order_count: 1 }
    )
  } finally {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('audit trail is append-only: DELETE is rejected as well as UPDATE', () => {
  const { db, dir } = freshDb()
  try {
    seedMenu(db)
    const service = createOrderService({ db, now: fixedNow })
    const created = service.createOrder({
      source: 'pos',
      sourceRequestId: randomUUID(),
      orderType: 'takeout',
      lines: [{ menuItemId: 1, quantity: 1, unitPriceOverride: 450 }],
      applyAutoPromotions: false
    })
    assert.equal(created.ok, true)
    const audit = db.prepare('SELECT id FROM audit_events WHERE order_id = ?').get(created.orderId)
    assert.ok(audit)
    assert.throws(
      () => db.prepare('DELETE FROM audit_events WHERE id = ?').run(audit.id),
      /append-only|abort|not allowed/i
    )
  } finally {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('subtotal, discount, and total are rounded to whole dinars at the order boundary', () => {
  const { db, dir } = freshDb()
  try {
    seedMenu(db)
    db.prepare('UPDATE menu_items SET price = 100.6 WHERE id = 1').run()
    db.prepare(
      `INSERT INTO promotions (name, type, discount_value, applies_to, is_active)
       VALUES ('Ten percent', 'percentage', 10, 'all', 1)`
    ).run()
    const result = createOrderService({ db, now: fixedNow }).createOrder({
      source: 'pos',
      sourceRequestId: randomUUID(),
      orderType: 'takeout',
      lines: [{ menuItemId: 1, quantity: 1 }],
      applyAutoPromotions: true
    })
    assert.equal(result.ok, true)
    assert.deepEqual(
      { subtotal: result.subtotal, discount: result.discountAmount, total: result.total },
      { subtotal: 101, discount: 10, total: 91 }
    )
  } finally {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('source-request UNIQUE race re-selects the winner as duplicate instead of db_failure', () => {
  const { db, dir } = freshDb()
  try {
    seedMenu(db)
    const sourceRequestId = randomUUID()
    const input = {
      source: 'pos',
      sourceRequestId,
      orderType: 'takeout',
      lines: [{ menuItemId: 1, quantity: 1 }],
      applyAutoPromotions: false
    }
    const first = createOrderService({ db, now: fixedNow }).createOrder(input)
    assert.equal(first.ok, true)

    // Simulate two connections both observing "absent": hide only the transaction's first
    // duplicate read. The INSERT then hits the real unique index; the post-rollback re-read sees it.
    let hideInitialRead = true
    const raceDb = {
      prepare(sql) {
        const statement = db.prepare(sql)
        if (!sql.startsWith('SELECT * FROM orders WHERE source = ?')) return statement
        return new Proxy(statement, {
          get(target, property) {
            if (property === 'get') {
              return (...args) => {
                if (hideInitialRead) { hideInitialRead = false; return undefined }
                return target.get(...args)
              }
            }
            const value = Reflect.get(target, property)
            return typeof value === 'function' ? value.bind(target) : value
          }
        })
      },
      transaction: db.transaction.bind(db)
    }
    const raced = createOrderService({ db: raceDb, now: fixedNow }).createOrder(input)
    assert.equal(raced.ok, true)
    assert.equal(raced.duplicate, true)
    assert.equal(raced.orderId, first.orderId)
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM orders').get().n, 1)
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM outbox_events').get().n, 4)
  } finally {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  }
})
