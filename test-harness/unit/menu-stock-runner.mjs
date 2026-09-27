/* Runs SQLite-backed menu/stock/category checks under Electron's Node ABI in a temporary userData dir. */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire, register } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..', '..')
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'ffm-menu-'))
globalThis.__ffmSafetyScratch = scratch

const require = createRequire(import.meta.url)
const appRequire = createRequire(pathToFileURL(path.join(root, 'package.json')))
const esbuildEntry = pathToFileURL(require.resolve('esbuild')).href
const electronMock = pathToFileURL(path.join(here, 'electron-safety-mock.mjs')).href
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
      for (const candidate of [base + '.ts', path.join(base, 'index.ts')]) {
        if (existsSync(candidate) && statSync(candidate).isFile()) return nextResolve(pathToFileURL(candidate).href, context)
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

const load = (relative) => import(pathToFileURL(path.join(root, relative)).href)

try {
  // --- Migration 020 on an existing (pre-020) database keeps every category active.
  const BetterSqlite = appRequire('better-sqlite3')
  const legacyPath = path.join(scratch, 'legacy.db')
  const legacy = new BetterSqlite(legacyPath)
  legacy.pragma('foreign_keys = ON')
  legacy.exec("CREATE TABLE _migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL DEFAULT (datetime('now')))")
  const migrationFiles = fs.readdirSync(path.join(root, 'src/main/database/migrations'))
    .filter((file) => /^\d{3}_.*\.ts$/.test(file) && Number(file.slice(0, 3)) < 20)
    .sort()
  for (const file of migrationFiles) {
    const module = await load(`src/main/database/migrations/${file}`)
    const migration = Object.values(module).find((value) => value && typeof value.up === 'function')
    migration.up(legacy)
    legacy.prepare('INSERT INTO _migrations (version, name) VALUES (?, ?)').run(migration.version, migration.name)
  }
  legacy.prepare("INSERT INTO categories (name, sort_order) VALUES ('Legacy', 0)").run()
  const { runMigrations } = await load('src/main/database/migrations/index.ts')
  runMigrations(legacy)
  assert.equal(legacy.prepare("SELECT is_active FROM categories WHERE name = 'Legacy'").get().is_active, 1)
  assert.equal(legacy.prepare('SELECT COUNT(*) AS n FROM _migrations WHERE version = 20').get().n, 1)
  runMigrations(legacy) // idempotent re-run
  legacy.close()

  const { initDatabase, getDb } = await load('src/main/database/connection.ts')
  initDatabase()
  const db = getDb()
  const { categoriesRepo } = await load('src/main/database/repositories/categories.repo.ts')
  const { menuRepo } = await load('src/main/database/repositories/menu.repo.ts')
  const { stockRepo } = await load('src/main/database/repositories/stock.repo.ts')

  // --- Categories: create / rename / clear translations / reorder / soft delete.
  const burgers = categoriesRepo.create({ name: ' Burgers ', name_ar: 'برغر', name_fr: 'Burgers', icon: '🍔' })
  const drinks = categoriesRepo.create({ name: 'Drinks' })
  assert.equal(burgers.name, 'Burgers')
  assert.equal(categoriesRepo.update(burgers.id, { name_fr: null }).name_fr, null)
  assert.equal(categoriesRepo.update(burgers.id, { name: 'Burgerz' }).name_ar, 'برغر', 'undefined keeps the old value')
  assert.throws(() => categoriesRepo.create({ name: '  ' }), /name is required/)
  categoriesRepo.reorder([drinks.id, burgers.id])
  assert.deepEqual(categoriesRepo.getAll().map((c) => c.id), [drinks.id, burgers.id])

  // --- Stock + recipes.
  const beef = stockRepo.create({ name: 'Beef', unit_type: 'kg', quantity: 10, price_per_unit: 1200, alert_threshold: 1 })
  const cheese = stockRepo.create({ name: 'Fromage', name_ar: 'جبن', unit_type: 'unit', quantity: 50, price_per_unit: 20 })
  const classic = menuRepo.create({
    name: 'Classic', name_ar: 'كلاسيك', name_fr: 'Classique', emoji: '🍔', price: 500, category_id: burgers.id,
    ingredients: [{ stock_item_id: beef.id, quantity: 150, unit: 'g' }, { stock_item_id: cheese.id, quantity: 1, unit: 'unit' }]
  })
  assert.throws(
    () => menuRepo.create({ name: 'Bad', price: 1, category_id: burgers.id, ingredients: [{ stock_item_id: cheese.id, quantity: 1, unit: 'g' }] }),
    /incompatible with Fromage/
  )

  // Bug 5: null clears, undefined keeps.
  let updated = menuRepo.update(classic.id, { name_ar: null, emoji: null })
  assert.equal(updated.name_ar, null)
  assert.equal(updated.emoji, null)
  assert.equal(updated.name_fr, 'Classique')
  assert.equal(stockRepo.update(cheese.id, { name_ar: null }).name_ar, null)

  // Bug 3: an incompatible stock unit change is refused and names the menu item.
  assert.throws(() => stockRepo.update(cheese.id, { unit_type: 'kg' }), /Cannot change the unit of "Fromage".*"Classic"/)
  assert.throws(() => stockRepo.update(beef.id, { unit_type: 'liter' }), /Cannot change the unit of "Beef"/)
  assert.equal(stockRepo.getById(cheese.id).unit_type, 'unit')
  assert.deepEqual(stockRepo.getRecipeUsage(cheese.id).map((u) => u.menu_item_name), ['Classic'])
  const spare = stockRepo.create({ name: 'Spare', unit_type: 'kg', price_per_unit: 1 })
  assert.equal(stockRepo.update(spare.id, { unit_type: 'unit' }).unit_type, 'unit', 'unused stock may change unit')
  assert.throws(() => stockRepo.delete(cheese.id), /still used in the recipe of "Classic"/)

  // Bug 3: a price-only edit is not blocked by a legacy broken recipe (unit changed behind it).
  db.prepare("UPDATE stock_items SET unit_type = 'kg' WHERE id = ?").run(cheese.id)
  const sameRecipe = menuRepo.getById(classic.id).ingredients.map(({ stock_item_id, quantity, unit }) => ({ stock_item_id, quantity, unit }))
  assert.equal(menuRepo.update(classic.id, { price: 550 }).price, 550)
  assert.equal(menuRepo.update(classic.id, { price: 560, ingredients: sameRecipe }).price, 560)
  assert.throws(
    () => menuRepo.update(classic.id, { ingredients: [...sameRecipe.slice(0, 1), { stock_item_id: cheese.id, quantity: 2, unit: 'unit' }] }),
    /incompatible with Fromage/
  )
  db.prepare("UPDATE stock_items SET unit_type = 'unit' WHERE id = ?").run(cheese.id)

  // Editing a stock item whose quantity went negative after sales no longer fails.
  db.prepare('UPDATE stock_items SET quantity = -3 WHERE id = ?').run(beef.id)
  assert.equal(stockRepo.update(beef.id, { price_per_unit: 1300 }).price_per_unit, 1300)
  assert.throws(() => stockRepo.fix(beef.id, -1, 'x'), /at least 0/)
  assert.equal(stockRepo.fix(beef.id, 0, 'counted').quantity, 0)

  // Bug 4: a category holding active items cannot be deleted; with only deleted items it can
  // (the old hard DELETE failed on the foreign key here).
  assert.throws(() => categoriesRepo.delete(burgers.id), /still has 1 active menu item/)
  assert.equal(menuRepo.delete(classic.id), true)
  assert.equal(categoriesRepo.delete(burgers.id), true)
  assert.ok(!categoriesRepo.getAll().some((c) => c.id === burgers.id))
  assert.equal(categoriesRepo.getById(burgers.id).is_active, 0)
  assert.throws(
    () => menuRepo.create({ name: 'Orphan', price: 1, category_id: burgers.id }),
    /category no longer exists/
  )

  // Bug 6: deleted items are listed and can be restored; the category comes back with them.
  assert.deepEqual(menuRepo.getDeleted().map((i) => i.id), [classic.id])
  const restored = menuRepo.restore(classic.id)
  assert.equal(restored.item.is_active, 1)
  assert.equal(restored.categoryRestored, true)
  assert.ok(categoriesRepo.getAll().some((c) => c.id === burgers.id))
  assert.deepEqual(menuRepo.getDeleted(), [])

  // Soft-deleted menu items do not lock a stock unit.
  menuRepo.delete(classic.id)
  assert.deepEqual(stockRepo.getRecipeUsage(cheese.id), [])
  assert.equal(stockRepo.update(cheese.id, { unit_type: 'kg' }).unit_type, 'kg')

  const fk = db.pragma('foreign_key_check')
  assert.deepEqual(fk, [])
  console.log('menu/stock/category checks passed')
} catch (error) {
  console.error(error.stack || error)
  process.exitCode = 1
} finally {
  try { (await load('src/main/database/connection.ts')).closeDatabase() } catch { /* not open */ }
  try { fs.rmSync(scratch, { recursive: true, force: true }) } catch { /* best effort */ }
  process.exit(process.exitCode || 0)
}
