// Shared setup for the v4 catalog suites (catalog-*.test.mjs): esbuild loader for the
// extensionless TS imports + the Electron mock, so the REAL repositories (ordersRepo,
// analyticsRepo, menuRepo) run against a temporary userData database.
//
// HOW TO RUN (better-sqlite3 is built for Electron's ABI):
//   ELECTRON_RUN_AS_NODE=1 node_modules/electron/dist/electron.exe --no-warnings --test \
//     test-harness/unit/order-effects/catalog-*.test.mjs
import { register, createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..', '..', '..')
const require = createRequire(import.meta.url)
const esbuildEntry = pathToFileURL(require.resolve('esbuild')).href
const electronMock = pathToFileURL(path.join(here, '..', 'electron-safety-mock.mjs')).href
const loaderSrc = `
import { existsSync, statSync, readFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'
let esbuild, electronMock
export async function initialize(data) { esbuild = await import(data.esbuildEntry); electronMock = data.electronMock }
export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'electron') return { url: electronMock, shortCircuit: true }
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
register('data:text/javascript,' + encodeURIComponent(loaderSrc), import.meta.url, { data: { esbuildEntry, electronMock } })

export const load = (relative) => import(pathToFileURL(path.join(root, relative)).href)
export const rootDir = root

const connection = await load('src/main/database/connection.ts')
export const { createOrderService } = await load('src/main/services/order-service.ts')
export const { createModifiersService } = await load('src/main/services/modifiers.ts')
export const { createCombosService, createSoldOutService } = await load('src/main/services/combos.ts')
export const { ordersRepo } = await load('src/main/database/repositories/orders.repo.ts')
export const { analyticsRepo } = await load('src/main/database/repositories/analytics.repo.ts')
export const { menuRepo } = await load('src/main/database/repositories/menu.repo.ts')
export const printDocuments = await load('src/main/services/print-documents.ts')
export const { buildFromTemplate } = await load('src/main/services/receipt-template.ts')

let scratch = null

/** Closes the previous database and opens a fresh, fully migrated one in a new userData dir. */
export function freshDb() {
  cleanup()
  scratch = mkdtempSync(path.join(tmpdir(), 'ffm-catalog-'))
  globalThis.__ffmSafetyScratch = scratch
  connection.initDatabase()
  return connection.getDb()
}

export function cleanup() {
  try { connection.closeDatabase() } catch { /* not open */ }
  if (scratch) {
    try { rmSync(scratch, { recursive: true, force: true }) } catch { /* best effort on Windows */ }
    scratch = null
  }
}

/**
 * Burgers (Grill), Drinks (Bar), Sides (Fryer), Menus. Burgers get three option groups via the
 * category: Sauce (required, max 1, Ketchup default, Algerian +20 w/ 10 ml sauce), Extras
 * (quantity allowed, max 3, Cheese EXTRA +50 w/ 1 cheese), Remove (Onions, kind "no").
 */
export function seedCatalog(db) {
  db.exec(`INSERT INTO categories (id, name, sort_order) VALUES (1, 'Burgers', 1), (2, 'Drinks', 2), (3, 'Sides', 3), (4, 'Menus', 4)`)
  db.exec(`INSERT INTO stock_items (id, name, unit_type, quantity, price_per_unit) VALUES
    (1, 'Beef', 'kg', 100, 1200), (2, 'Cheese', 'unit', 100, 20), (3, 'Onion', 'kg', 10, 100),
    (4, 'Potato', 'kg', 50, 80), (5, 'Cola can', 'unit', 100, 40), (6, 'Sauce', 'liter', 10, 300), (7, 'Orange', 'unit', 100, 30)`)
  db.exec(`INSERT INTO menu_items (id, name, name_ar, price, category_id) VALUES
    (1, 'Burger', 'برغر', 500, 1), (2, 'Cola', NULL, 100, 2), (3, 'Fries', NULL, 150, 3),
    (4, 'Large Fries', NULL, 200, 3), (5, 'Orange Juice', NULL, 150, 2), (10, 'Menu Maxi', NULL, 800, 4)`)
  db.exec(`INSERT INTO menu_item_ingredients (menu_item_id, stock_item_id, quantity, unit) VALUES
    (1, 1, 150, 'g'), (1, 3, 20, 'g'), (2, 5, 1, 'unit'), (3, 4, 200, 'g'), (4, 4, 300, 'g'), (5, 7, 2, 'unit')`)
  db.exec(`INSERT INTO workers (id, name, role, pay_full_day, pay_half_day) VALUES
    (1, 'Grill', 'cook', 1, 1), (2, 'Bar', 'cook', 1, 1), (3, 'Fryer', 'cook', 1, 1)`)
  db.exec(`INSERT INTO worker_categories (worker_id, category_id) VALUES (1, 1), (2, 2), (3, 3)`)

  const mods = createModifiersService(db)
  const sauce = mods.createGroup({ name: 'Sauce', is_required: true, max_select: 1, sort_order: 1 })
  const ketchup = mods.createOption(sauce.id, { name: 'Ketchup', is_default: true, sort_order: 1 })
  const algerian = mods.createOption(sauce.id, {
    name: 'Algerian', price_delta: 20, sort_order: 2, ingredients: [{ stock_item_id: 6, quantity: 10, unit: 'ml' }]
  })
  const extras = mods.createGroup({ name: 'Extras', allow_quantity: true, max_select: 3, sort_order: 2 })
  const cheese = mods.createOption(extras.id, {
    name: 'Cheese', kind: 'extra', price_delta: 50, ingredients: [{ stock_item_id: 2, quantity: 1, unit: 'unit' }]
  })
  const remove = mods.createGroup({ name: 'Remove', sort_order: 3 })
  const onions = mods.createOption(remove.id, { name: 'Onions', kind: 'no' })
  mods.setCategoryAssignments(1, [
    { group_id: sauce.id, sort_order: 1 }, { group_id: extras.id, sort_order: 2 }, { group_id: remove.id, sort_order: 3 }
  ])
  return { sauce, ketchup, algerian, extras, cheese, remove, onions }
}

/** One printer per station, split tickets, automatic kitchen printing, no "All Items" printer. */
export function seedStationPrinters(db) {
  const insert = db.prepare(
    `INSERT INTO printer_assignments (printer_name, assignment_type, worker_id, is_active, auto_print) VALUES (?, 'worker', ?, 1, 1)`
  )
  insert.run('GRILL', 1)
  insert.run('BAR', 2)
  insert.run('FRYER', 3)
  db.exec(`INSERT OR REPLACE INTO settings (key, value) VALUES
    ('split_kitchen_tickets', 'true'), ('auto_print_receipt', 'false'), ('auto_print_kitchen', 'true')`)
}

export const stock = (db, id) => db.prepare('SELECT quantity FROM stock_items WHERE id = ?').get(id).quantity
export const near = (actual, expected, message) => {
  if (Math.abs(actual - expected) > 1e-9) throw new Error(`${message ?? 'value'}: expected ${expected}, got ${actual}`)
}

let requestCounter = 0
export const requestId = () => `catalog-test-${process.pid}-${++requestCounter}`
