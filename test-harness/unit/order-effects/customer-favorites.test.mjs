// WP-F acceptance tests — customer favorites exclude cancelled orders (frozen; see
// order-effects.contract.d.ts / ASSUMPTION 12). This is a regression guard: the
// existing customers.repo.ts:64-78 query already filters `status != 'cancelled'`
// correctly, but that code is unreachable from a plain node:test process because it
// transitively imports Electron via connection.ts. This suite locks the same query's
// behavior in via a pure, explicit-db function.
//
// Covers brief item:
//   16. favorites_exclude_cancelled
//
// Run with: ELECTRON_RUN_AS_NODE=1 node_modules/electron/dist/electron.exe --no-warnings
//   --test test-harness/unit/order-effects/customer-favorites.test.mjs

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
const { getFavoriteItems } = await import('../../../src/main/services/customer-favorites.ts')

function freshDb() {
  const dir = mkdtempSync(path.join(tmpdir(), 'ffm-wpf-test-'))
  const dbPath = path.join(dir, 'test.db')
  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  runMigrations(db)
  return { db, dir }
}

function seedCustomerAndMenu(db) {
  db.exec(`INSERT INTO categories (id, name) VALUES (1, 'Burgers')`)
  db.exec(`INSERT INTO menu_items (id, name, price, category_id, is_active) VALUES
           (1, 'Burger', 500, 1, 1), (2, 'Fries', 200, 1, 1)`)
  db.exec(
    `INSERT INTO customers (id, phone, phone_normalized, name, total_spent, order_count)
     VALUES (1, '0550000000', '+213550000000', 'Regular', 0, 0)`
  )
}

function seedOrder(db, { id, status, customerId }) {
  db.prepare(
    `INSERT INTO orders (id, daily_number, order_date, order_type, status, subtotal, total, customer_id)
     VALUES (?, ?, '2026-01-01', 'local', ?, 100, 100, ?)`
  ).run(id, id, status, customerId)
}

function seedOrderItem(db, { id, orderId, menuItemId, quantity }) {
  db.prepare(
    `INSERT INTO order_items (id, order_id, menu_item_id, quantity, unit_price, total_price)
     VALUES (?, ?, ?, ?, 100, ?)`
  ).run(id, orderId, menuItemId, quantity, quantity * 100)
}

test('favorites_exclude_cancelled: a cancelled order never contributes to favorites', () => {
  const { db, dir } = freshDb()
  try {
    seedCustomerAndMenu(db)

    // Completed order: 3x Burger.
    seedOrder(db, { id: 1, status: 'completed', customerId: 1 })
    seedOrderItem(db, { id: 1, orderId: 1, menuItemId: 1, quantity: 3 })

    // Cancelled order: 10x Fries — must NOT surface as a favorite despite the larger quantity.
    seedOrder(db, { id: 2, status: 'cancelled', customerId: 1 })
    seedOrderItem(db, { id: 2, orderId: 2, menuItemId: 2, quantity: 10 })

    const favorites = getFavoriteItems(db, 1)
    const menuItemIds = favorites.map((f) => f.menu_item_id)

    assert.ok(menuItemIds.includes(1), 'Burger from the completed order must appear')
    assert.ok(!menuItemIds.includes(2), 'Fries only ordered on a cancelled order must NOT appear')
  } finally {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('favorites_exclude_cancelled: a customer with only cancelled orders has zero favorites', () => {
  const { db, dir } = freshDb()
  try {
    seedCustomerAndMenu(db)
    seedOrder(db, { id: 1, status: 'cancelled', customerId: 1 })
    seedOrderItem(db, { id: 1, orderId: 1, menuItemId: 1, quantity: 5 })

    const favorites = getFavoriteItems(db, 1)
    assert.deepEqual(favorites, [])
  } finally {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  }
})
