// Shared setup for the insights suite. Registers the same esbuild-backed TS loader as the
// order-effects tests (extensionless relative imports, TS syntax) and seeds synthetic data.
//
// Run with: ELECTRON_RUN_AS_NODE=1 node_modules/electron/dist/electron.exe --no-warnings
//   --test test-harness/unit/insights/*.test.mjs
// (better-sqlite3 is built for Electron's Node ABI, so plain `node --test` cannot load it.)

import { register, createRequire } from 'node:module'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

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

const Database = require('better-sqlite3')
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')

/** Imports a TS module under src/ (e.g. 'main/services/insights/forecast.ts'). */
export function src(relative) {
  return import(pathToFileURL(path.join(root, 'src', relative)).href)
}

const { runMigrations } = await src('main/database/migrations/index.ts')

/** Fresh migrated database in a temp dir. Call `done()` in finally. */
export function freshDb() {
  const dir = mkdtempSync(path.join(tmpdir(), 'ffm-insights-test-'))
  const db = new Database(path.join(dir, 'test.db'))
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  runMigrations(db)
  // Open every day by default (the initial schedule closes Friday).
  db.exec("UPDATE work_schedule SET status = 'full'")
  return { db, done: () => { db.close(); rmSync(dir, { recursive: true, force: true }) } }
}

export function addDays(date, days) {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** Categories 1 Burgers, 2 Sides, 3 Drinks + the given menu items [{id, name, price, category, active}]. */
export function seedMenu(db, items) {
  db.exec(`INSERT INTO categories (id, name) VALUES (1, 'Burgers'), (2, 'Sides'), (3, 'Drinks')`)
  const stmt = db.prepare('INSERT INTO menu_items (id, name, name_fr, price, category_id, is_active) VALUES (?, ?, ?, ?, ?, ?)')
  for (const item of items) stmt.run(item.id, item.name, item.name_fr ?? null, item.price, item.category ?? 1, item.active === false ? 0 : 1)
}

export function seedStock(db, items) {
  const stmt = db.prepare(
    `INSERT INTO stock_items (id, name, name_fr, unit_type, quantity, price_per_unit, alert_threshold, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  )
  for (const s of items) stmt.run(s.id, s.name, s.name_fr ?? null, s.unit, s.quantity ?? 0, s.price ?? 0, s.threshold ?? 0, s.active === false ? 0 : 1)
}

/** Recipe lines [menuItemId, stockItemId, quantity, unit] (inserted raw — no unit validation). */
export function seedRecipes(db, lines) {
  const stmt = db.prepare('INSERT INTO menu_item_ingredients (menu_item_id, stock_item_id, quantity, unit) VALUES (?, ?, ?, ?)')
  for (const line of lines) stmt.run(...line)
}

/** A purchase row; `at` is UTC 'YYYY-MM-DD HH:MM:SS' like datetime('now'). */
export function seedPurchase(db, { stockItemId, quantity = 10, price, at }) {
  db.prepare(
    'INSERT INTO stock_purchases (stock_item_id, quantity, price_per_unit, total_cost, purchased_at) VALUES (?, ?, ?, ?, ?)'
  ).run(stockItemId, quantity, price, quantity * price, at)
}

const dailyNumbers = new WeakMap()

/**
 * One order. `time` is LOCAL 'HH:MM' (stored as UTC ISO, one hour earlier, like order-service).
 * lines: [[menuItemId, quantity, unitPrice]]
 */
export function seedOrder(db, { date, time = '12:00', status = 'completed', lines, discount = 0, createdAt }) {
  const counters = dailyNumbers.get(db) ?? new Map()
  dailyNumbers.set(db, counters)
  const number = (counters.get(date) ?? 0) + 1
  counters.set(date, number)
  const subtotal = lines.reduce((sum, [, qty, price]) => sum + qty * price, 0)
  const [h, m] = time.split(':').map(Number)
  const created = createdAt ?? new Date(Date.parse(`${date}T00:00:00Z`) + ((h * 60 + m) - 60) * 60_000).toISOString()
  const orderId = Number(db.prepare(
    `INSERT INTO orders (daily_number, order_date, order_type, status, subtotal, discount_amount, total, created_at)
     VALUES (?, ?, 'local', ?, ?, ?, ?, ?)`
  ).run(number, date, status, subtotal, discount, subtotal - discount, created).lastInsertRowid)
  const item = db.prepare(
    'INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price, total_price) VALUES (?, ?, ?, ?, ?)'
  )
  for (const [menuItemId, qty, price] of lines) item.run(orderId, menuItemId, qty, price, qty * price)
  return orderId
}

/** Local wall time on `date` as a Date (Algiers = UTC+1). */
export function localInstant(date, time) {
  const [h, m] = time.split(':').map(Number)
  return new Date(Date.parse(`${date}T00:00:00Z`) + ((h * 60 + m) - 60) * 60_000)
}

export function setSettings(db, values) {
  const stmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
  for (const [key, value] of Object.entries(values)) stmt.run(key, String(value))
}

export function weekdayOf(date) {
  return new Date(`${date}T00:00:00Z`).getUTCDay()
}
