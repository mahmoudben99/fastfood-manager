// v3.2.1 regressions — explicit order-edit rejections and sale-time item-name snapshots.
//
// Covers:
//   - ordersRepo.updateItems throws a parseable ORDER_EDIT_REJECTED:<reason> for every refused
//     edit (past business day, completed, cancelled, missing) instead of returning the unchanged
//     row, and nothing is written.
//   - migration 019 snapshots order line names; renaming a menu item no longer rewrites old
//     orders or top-seller reports; the backfill is idempotent and never overwrites snapshots.
//
// Run with: ELECTRON_RUN_AS_NODE=1 node_modules/electron/dist/electron.exe --no-warnings
//   --test test-harness/unit/order-effects/order-edit-rejection-name-snapshot.test.mjs

import { register, createRequire } from 'node:module'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..', '..', '..')
const require = createRequire(import.meta.url)
const appRequire = createRequire(pathToFileURL(path.join(root, 'package.json')))
const esbuildEntry = pathToFileURL(require.resolve('esbuild')).href
const electronMock = pathToFileURL(path.join(here, '..', 'electron-safety-mock.mjs')).href
const betterSqlite = pathToFileURL(appRequire.resolve('better-sqlite3')).href
const loaderSrc = `
import { existsSync, statSync, readFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'
let esbuild, electronMock, betterSqlite
export async function initialize(data) {
  esbuild = await import(data.esbuildEntry)
  electronMock = data.electronMock
  betterSqlite = data.betterSqlite
}
export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'electron') return { url: electronMock, shortCircuit: true }
  if (specifier === 'better-sqlite3') return { url: betterSqlite, shortCircuit: true }
  if (specifier.startsWith('.') && context.parentURL) {
    try { return await nextResolve(specifier, context) }
    catch (err) {
      const base = path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier)
      for (const cand of [base + '.ts', path.join(base, 'index.ts')]) {
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
register('data:text/javascript,' + encodeURIComponent(loaderSrc), import.meta.url, {
  data: { esbuildEntry, electronMock, betterSqlite }
})

const scratch = mkdtempSync(path.join(tmpdir(), 'ffm-v321-orders-'))
globalThis.__ffmSafetyScratch = scratch
const load = (relative) => import(pathToFileURL(path.join(root, relative)).href)

const { initDatabase, getDb, closeDatabase } = await load('src/main/database/connection.ts')
const { ordersRepo } = await load('src/main/database/repositories/orders.repo.ts')
const { analyticsRepo } = await load('src/main/database/repositories/analytics.repo.ts')
const { migration019 } = await load('src/main/database/migrations/019_order_item_name_snapshot.ts')
const { createOrderService } = await load('src/main/services/order-service.ts')
const { parseOrderEditRejection, businessDateInAlgiers } = await load('src/shared/order-edit.ts')

initDatabase()
const db = getDb()
db.exec(`INSERT INTO categories (id, name) VALUES (1, 'Burgers')`)
db.exec(`INSERT INTO menu_items (id, name, name_ar, name_fr, price, category_id, is_active)
         VALUES (1, 'Classic Burger', 'برغر كلاسيك', 'Burger classique', 500, 1, 1),
                (2, 'Cola', 'كولا', 'Cola', 100, 1, 1)`)

test.after(() => {
  closeDatabase()
  rmSync(scratch, { recursive: true, force: true })
})

const today = () => businessDateInAlgiers(new Date())

function placeOrder(items = [{ menu_item_id: 1, quantity: 1 }]) {
  return ordersRepo.create({
    order_type: 'takeout',
    source: 'pos',
    source_request_id: randomUUID(),
    discount_amount: 0,
    items
  })
}

function lineInput(order) {
  return order.items.map((item) => ({
    order_item_id: item.id,
    menu_item_id: item.menu_item_id,
    quantity: item.quantity,
    unit_price: item.unit_price
  }))
}

function rejectionOf(fn) {
  try {
    fn()
  } catch (error) {
    // Simulate what the renderer receives through ipcRenderer.invoke.
    return parseOrderEditRejection(`Error invoking remote method 'orders:updateItems': ${error}`)
  }
  assert.fail('expected the edit to be rejected')
}

test('a same-day preparing order still accepts a line edit', () => {
  const order = placeOrder()
  const updated = ordersRepo.updateItems(order.id, [...lineInput(order), { menu_item_id: 2, quantity: 1 }])
  assert.equal(updated.items.length, 2)
  assert.equal(updated.total, 600)
})

test('an edit to an order from a previous business day throws past_day and writes nothing', () => {
  const order = placeOrder()
  db.prepare(`UPDATE orders SET order_date = '2000-01-01' WHERE id = ?`).run(order.id)
  const reason = rejectionOf(() =>
    ordersRepo.updateItems(order.id, [...lineInput(order), { menu_item_id: 2, quantity: 1 }])
  )
  assert.equal(reason, 'past_day')
  const after = ordersRepo.getById(order.id)
  assert.equal(after.items.length, 1)
  assert.equal(after.total, 500)
  assert.equal(after.status, 'preparing')
})

test('completed, cancelled and missing orders each reject with their own reason', () => {
  const completed = placeOrder()
  ordersRepo.updateStatus(completed.id, 'completed')
  assert.equal(rejectionOf(() => ordersRepo.updateItems(completed.id, lineInput(completed))), 'completed')

  const cancelled = placeOrder()
  ordersRepo.cancelOrder(cancelled.id)
  assert.equal(rejectionOf(() => ordersRepo.updateItems(cancelled.id, lineInput(cancelled))), 'cancelled')

  assert.equal(rejectionOf(() => ordersRepo.updateItems(999999, [{ menu_item_id: 1, quantity: 1 }])), 'not_found')
})

test('the order service reports the rejection reason with the frozen error code', () => {
  const order = placeOrder()
  db.prepare(`UPDATE orders SET order_date = '2000-01-01' WHERE id = ?`).run(order.id)
  const result = createOrderService({ db }).updateOrderLines({
    orderId: order.id,
    lines: [{ orderItemId: order.items[0].id, menuItemId: 1, quantity: 3 }]
  })
  assert.equal(result.ok, false)
  assert.equal(result.code, 'line_edit_not_allowed')
  assert.equal(result.reason, 'past_day')
})

test('order lines keep the name they were sold under after the menu item is renamed', () => {
  const order = placeOrder()
  assert.equal(order.items[0].item_name, 'Classic Burger')
  db.prepare(`UPDATE menu_items SET name = 'Chicken Wrap', name_ar = 'راب دجاج', name_fr = 'Wrap poulet' WHERE id = 1`).run()
  try {
    const reread = ordersRepo.getById(order.id)
    assert.equal(reread.items[0].menu_item_name, 'Classic Burger')
    assert.equal(reread.items[0].menu_item_name_ar, 'برغر كلاسيك')
    assert.equal(reread.items[0].menu_item_name_fr, 'Burger classique')

    // An edit keeps the retained line's snapshot and snapshots the new line's current name.
    const edited = ordersRepo.updateItems(order.id, [...lineInput(reread), { menu_item_id: 1, quantity: 1 }])
    assert.deepEqual(edited.items.map((item) => item.menu_item_name), ['Classic Burger', 'Chicken Wrap'])

    const top = analyticsRepo.getTopSellingItems(today(), today(), 10)
    const burger = top.find((row) => row.name === 'Chicken Wrap' || row.name === 'Classic Burger')
    assert.ok(burger, 'menu item 1 is still one grouped row')
    assert.equal(top.filter((row) => row.name === 'Chicken Wrap' || row.name === 'Classic Burger').length, 1)
    assert.equal(burger.name, 'Chicken Wrap', 'the report names the item as most recently sold')
  } finally {
    db.prepare(`UPDATE menu_items SET name = 'Classic Burger', name_ar = 'برغر كلاسيك', name_fr = 'Burger classique' WHERE id = 1`).run()
  }
})

test('top sellers show the sold name, not a later rename, for a past period', () => {
  const order = placeOrder([{ menu_item_id: 2, quantity: 4 }])
  db.prepare(`UPDATE orders SET order_date = '2001-02-03' WHERE id = ?`).run(order.id)
  db.prepare(`UPDATE menu_items SET name = 'Lemon Soda' WHERE id = 2`).run()
  try {
    const top = analyticsRepo.getTopSellingItems('2001-02-03', '2001-02-03', 10)
    assert.equal(top.length, 1)
    assert.equal(top[0].name, 'Cola')
    assert.equal(top[0].total_quantity, 4)
  } finally {
    db.prepare(`UPDATE menu_items SET name = 'Cola' WHERE id = 2`).run()
  }
})

test('migration 019 backfills legacy rows from current names, idempotently, without overwriting snapshots', () => {
  const legacy = placeOrder([{ menu_item_id: 2, quantity: 1 }])
  const kept = placeOrder([{ menu_item_id: 1, quantity: 1 }])
  db.prepare(`UPDATE order_items SET item_name = NULL, item_name_ar = NULL, item_name_fr = NULL WHERE order_id = ?`).run(legacy.id)
  db.prepare(`UPDATE order_items SET item_name = 'Old Burger Name' WHERE order_id = ?`).run(kept.id)

  migration019.up(db)
  migration019.up(db)

  const legacyRow = db.prepare('SELECT * FROM order_items WHERE order_id = ?').get(legacy.id)
  assert.equal(legacyRow.item_name, 'Cola')
  assert.equal(legacyRow.item_name_ar, 'كولا')
  assert.equal(legacyRow.item_name_fr, 'Cola')
  const keptRow = db.prepare('SELECT * FROM order_items WHERE order_id = ?').get(kept.id)
  assert.equal(keptRow.item_name, 'Old Burger Name')
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM _migrations WHERE version = 19').get().n, 1)
})

test('a line whose menu item could not be backfilled still falls back to the current name', () => {
  const order = placeOrder([{ menu_item_id: 2, quantity: 1 }])
  db.prepare(`UPDATE order_items SET item_name = NULL, item_name_ar = NULL, item_name_fr = NULL WHERE order_id = ?`).run(order.id)
  const reread = ordersRepo.getById(order.id)
  assert.equal(reread.items[0].menu_item_name, 'Cola')
  assert.equal(reread.items[0].menu_item_name_ar, 'كولا')
})
