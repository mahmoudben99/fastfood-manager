// Shared setup for the KDS tests: registers the esbuild TS loader (same as the order-effects
// suite) and builds a migrated, seeded throwaway database.
//
// Run with: ELECTRON_RUN_AS_NODE=1 node_modules/electron/dist/electron.exe --no-warnings
//   --test test-harness/unit/kds/*.test.mjs

import { register, createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
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

const src = (rel) => new URL('../../../src/' + rel, import.meta.url).href
export const load = (rel) => import(src(rel))

const { runMigrations } = await load('main/database/migrations/index.ts')
export { runMigrations }

export function freshDb() {
  const dir = mkdtempSync(path.join(tmpdir(), 'ffm-kds-test-'))
  const db = new Database(path.join(dir, 'test.db'))
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  runMigrations(db)
  return {
    db,
    cleanup() {
      try { db.close() } catch { /* already closed */ }
      rmSync(dir, { recursive: true, force: true })
    }
  }
}

/** Grill (worker 1) cooks burgers, Drinks (worker 2) pours sodas, desserts have no station. */
export function seedKitchen(db) {
  db.exec(`INSERT INTO categories (id, name) VALUES (1, 'Burgers'), (2, 'Drinks'), (3, 'Desserts')`)
  db.exec(`INSERT INTO menu_items (id, name, name_ar, name_fr, price, category_id, is_active) VALUES
    (1, 'Classic Burger', 'برغر', 'Burger classique', 500, 1, 1),
    (2, 'Soda', 'مشروب', 'Soda', 100, 2, 1),
    (3, 'Ice Cream', 'مثلجات', 'Glace', 150, 3, 1),
    (4, 'Fries', 'بطاطا', 'Frites', 150, 1, 1)`)
  db.exec(`INSERT INTO workers (id, name, role, pay_full_day, pay_half_day) VALUES
    (1, 'Grill', 'cook', 1, 1), (2, 'Drinks', 'cook', 1, 1)`)
  db.exec(`INSERT INTO worker_categories (worker_id, category_id) VALUES (1, 1), (2, 2)`)
}

export const ticketsOf = (db, orderId) =>
  db.prepare('SELECT * FROM kds_tickets WHERE order_id = ? ORDER BY station_id').all(orderId)
export const itemsOf = (db, ticketId) =>
  db.prepare('SELECT * FROM kds_ticket_items WHERE ticket_id = ? ORDER BY order_item_id').all(ticketId)
export const ticketAt = (db, orderId, station) =>
  db.prepare('SELECT * FROM kds_tickets WHERE order_id = ? AND station_id = ?').get(orderId, station)

/** Resolves after the KDS event flush (setImmediate) has run. */
export const flushEvents = () => new Promise((resolve) => setImmediate(() => setImmediate(resolve)))
