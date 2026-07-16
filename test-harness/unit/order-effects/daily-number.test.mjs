// WP-F acceptance tests — daily order numbering (frozen).
//
// Covers brief item:
//   13. daily_number_midnight
//
// CONTRACT.md's header states: "Timezone for all 'restaurant-local' rules:
// Africa/Algiers." Algeria has used a fixed UTC+1 offset with no DST since 1981, so
// this pins order_date to that fixed offset rather than the machine's own local
// timezone (unlike the current orders.repo.ts's localDate(), which uses
// getTimezoneOffset() and assumes the POS machine itself is physically in Algeria).
// See the test-author report for why this is called out as an explicit choice.
//
// Run with: ELECTRON_RUN_AS_NODE=1 node_modules/electron/dist/electron.exe --no-warnings
//   --test test-harness/unit/order-effects/daily-number.test.mjs

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
           VALUES (1, 'Beef', 'kg', 1000, 1200, 1)`)
  db.exec(`INSERT INTO menu_items (id, name, price, category_id, is_active)
           VALUES (1, 'Classic Burger', 500, 1, 1)`)
  db.exec(`INSERT INTO menu_item_ingredients (menu_item_id, stock_item_id, quantity, unit)
           VALUES (1, 1, 150, 'g')`)
}

function makeOrder(service) {
  return service.createOrder({
    source: 'pos',
    sourceRequestId: randomUUID(),
    orderType: 'local',
    lines: [{ menuItemId: 1, quantity: 1 }],
    applyAutoPromotions: false
  })
}

test('daily_number_midnight: order_date is captured from a single clock read, not derived twice (Africa/Algiers, fixed UTC+1)', () => {
  const { db, dir } = freshDb()
  try {
    seedBasicMenu(db)

    // 22:59:59.500Z = 23:59:59.500 Africa/Algiers (still 16 July). If the implementation
    // reads the clock a SECOND time internally (e.g. once for order_date, again for the
    // daily-counter bucket), a stateful mock clock exposes it: the second read below is
    // 23:00:00.100Z = 00:00:00.100 Africa/Algiers (now 17 July) — a different day.
    const instants = [new Date('2026-07-16T22:59:59.500Z'), new Date('2026-07-16T23:00:00.100Z')]
    let reads = 0
    const now = () => instants[Math.min(reads++, instants.length - 1)]

    const service = createOrderService({ db, now })
    const result = makeOrder(service)

    assert.equal(result.ok, true)
    assert.equal(result.orderDate, '2026-07-16', 'must resolve to the Algiers-local calendar date, not UTC')

    const row = db.prepare('SELECT order_date, daily_number FROM orders WHERE id = ?').get(result.orderId)
    assert.equal(
      row.order_date,
      result.orderDate,
      'the persisted row and the returned orderDate must always agree (single canonical clock read)'
    )

    const counterRow16 = db.prepare('SELECT last_order_num FROM daily_counters WHERE date = ?').get('2026-07-16')
    const counterRow17 = db.prepare('SELECT last_order_num FROM daily_counters WHERE date = ?').get('2026-07-17')
    assert.ok(counterRow16, 'the daily counter must be bucketed under the SAME date as the order row')
    assert.equal(counterRow16.last_order_num, row.daily_number)
    assert.equal(counterRow17, undefined, 'no counter must leak onto the following day from a double clock read')
  } finally {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('daily_number_midnight: an order created just after Algiers midnight lands on the NEXT calendar day', () => {
  const { db, dir } = freshDb()
  try {
    seedBasicMenu(db)
    // 23:00:01Z = 00:00:01 Africa/Algiers on 17 July.
    const now = () => new Date('2026-07-16T23:00:01.000Z')
    const service = createOrderService({ db, now })
    const result = makeOrder(service)
    assert.equal(result.ok, true)
    assert.equal(result.orderDate, '2026-07-17')
  } finally {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('daily_number_midnight: sequential same-day creates get unique, gapless daily numbers; the (order_date, daily_number) unique constraint holds', () => {
  const { db, dir } = freshDb()
  try {
    seedBasicMenu(db)
    const now = () => new Date('2026-07-16T12:00:00Z')
    const service = createOrderService({ db, now })

    const numbers = []
    for (let i = 0; i < 5; i++) {
      const result = makeOrder(service)
      assert.equal(result.ok, true)
      numbers.push(result.dailyNumber)
    }
    assert.deepEqual(numbers, [1, 2, 3, 4, 5], 'rapid back-to-back same-day creates must not collide or skip')

    // The uniqueness guarantee must be enforced at the schema level too, independent
    // of the service's own bookkeeping.
    assert.throws(() => {
      db.prepare(
        `INSERT INTO orders (daily_number, order_date, order_type, status, subtotal, total)
         VALUES (1, '2026-07-16', 'local', 'preparing', 100, 100)`
      ).run()
    }, /duplicate daily order number|UNIQUE constraint/i)
  } finally {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  }
})
