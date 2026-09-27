// Shared setup for the v4 cash suites (payments, shifts, delivery, approvals, migration 022).
// Same esbuild loader as create-order.test.mjs: better-sqlite3 is built for Electron's ABI, so run
//   ELECTRON_RUN_AS_NODE=1 node_modules/electron/dist/electron.exe --no-warnings --test test-harness/unit/order-effects/*.test.mjs
import { register, createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
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
register('data:text/javascript,' + encodeURIComponent(loaderSrc), import.meta.url, { data: { esbuildEntry } })

const src = '../../../src/main'
export const { runMigrations } = await import(`${src}/database/migrations/index.ts`)
export const { createOrderService } = await import(`${src}/services/order-service.ts`)
export const payments = await import(`${src}/services/payments.ts`)
export const shifts = await import(`${src}/services/shifts.ts`)
export const delivery = await import(`${src}/services/delivery.ts`)
export const settlement = await import(`${src}/services/driver-settlement.ts`)
export const approvals = await import(`${src}/services/approvals.ts`)
export const paymentMethods = await import(`${src}/services/payment-methods.ts`)

/** 2026-09-27 11:00 in Algiers. */
export const NOW = new Date('2026-09-27T10:00:00Z')
export const fixedNow = () => NOW

export function freshDb() {
  const dir = mkdtempSync(path.join(tmpdir(), 'ffm-cash-test-'))
  const db = new Database(path.join(dir, 'test.db'))
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  runMigrations(db)
  return { db, cleanup: () => { db.close(); rmSync(dir, { recursive: true, force: true }) } }
}

/** Burger 500 + Fries 300 (Food), Soda 150 (Drinks); no recipes. */
export function seedMenu(db) {
  db.exec(`INSERT INTO categories (id, name, name_fr, name_ar) VALUES (1, 'Food', 'Plats', 'أطباق'), (2, 'Drinks', 'Boissons', 'مشروبات')`)
  db.exec(`INSERT INTO menu_items (id, name, name_fr, name_ar, price, category_id, is_active) VALUES
    (1, 'Burger', 'Burger', 'برغر', 500, 1, 1), (2, 'Fries', 'Frites', 'بطاطس', 300, 1, 1), (3, 'Soda', 'Soda', 'مشروب', 150, 2, 1)`)
}

export function setSetting(db, key, value) {
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value)
}

export function seedDriver(db, id = 7, name = 'Yacine') {
  db.prepare(`INSERT INTO workers (id, name, role, pay_full_day, pay_half_day, is_active) VALUES (?, ?, 'driver', 0, 0, 1)`).run(id, name)
  return id
}

/** Create an order through the real service; throws with the service message when refused. */
export function order(service, input = {}) {
  const result = service.createOrder({
    source: 'pos',
    sourceRequestId: randomUUID(),
    orderType: 'takeout',
    lines: [{ menuItemId: 1, quantity: 2 }],
    applyAutoPromotions: false,
    ...input
  })
  if (!result.ok) {
    const error = new Error(result.message)
    error.code = result.code
    throw error
  }
  return result
}

export function tryOrder(service, input = {}) {
  return service.createOrder({
    source: 'pos', sourceRequestId: randomUUID(), orderType: 'takeout',
    lines: [{ menuItemId: 1, quantity: 2 }], applyAutoPromotions: false, ...input
  })
}

export function rows(db, sql, ...args) {
  return db.prepare(sql).all(...args)
}
