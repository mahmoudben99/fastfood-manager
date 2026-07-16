// WP-F acceptance tests — tablet orders must carry a caller-generated request UUID
// (frozen; see order-effects.contract.d.ts's CreateOrderInput).
//
// Covers brief item:
//   17. tablet_request_uuid
//
// Run with: ELECTRON_RUN_AS_NODE=1 node_modules/electron/dist/electron.exe --no-warnings
//   --test test-harness/unit/order-effects/tablet-source-request.test.mjs

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

test('tablet_request_uuid: a tablet order with a missing sourceRequestId is rejected', () => {
  const { db, dir } = freshDb()
  try {
    seedBasicMenu(db)
    const service = createOrderService({ db })

    const input = {
      source: 'tablet',
      orderType: 'local',
      lines: [{ menuItemId: 1, quantity: 1 }],
      applyAutoPromotions: false
    }
    delete input.sourceRequestId // simulate a caller that forgot to generate one

    const result = service.createOrder(input)
    assert.equal(result.ok, false)
    assert.equal(result.code, 'invalid_input')
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM orders').get().n, 0)
  } finally {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('tablet_request_uuid: a tablet order with an empty-string sourceRequestId is rejected', () => {
  const { db, dir } = freshDb()
  try {
    seedBasicMenu(db)
    const service = createOrderService({ db })

    const result = service.createOrder({
      source: 'tablet',
      sourceRequestId: '',
      orderType: 'local',
      lines: [{ menuItemId: 1, quantity: 1 }],
      applyAutoPromotions: false
    })
    assert.equal(result.ok, false)
    assert.equal(result.code, 'invalid_input')
  } finally {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('tablet_request_uuid: a tablet order WITH a valid sourceRequestId is accepted', () => {
  const { db, dir } = freshDb()
  try {
    seedBasicMenu(db)
    const service = createOrderService({ db })

    const result = service.createOrder({
      source: 'tablet',
      sourceRequestId: randomUUID(),
      orderType: 'local',
      lines: [{ menuItemId: 1, quantity: 1 }],
      applyAutoPromotions: false
    })
    assert.equal(result.ok, true)
  } finally {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  }
})
