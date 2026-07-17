/* Runs SQLite-backed IPC checks under Electron's Node ABI in an isolated temporary userData dir. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire, register } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { getHandler, setDialogPath } from './electron-safety-mock.mjs'
import { setFailRename } from './electron-safety-fs.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..', '..')
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'ffm-safety-'))
globalThis.__ffmSafetyScratch = scratch

const require = createRequire(import.meta.url)
const appRequire = createRequire(pathToFileURL(path.join(root, 'package.json')))
const esbuildEntry = pathToFileURL(require.resolve('esbuild')).href
const electronMock = pathToFileURL(path.join(here, 'electron-safety-mock.mjs')).href
const fsMock = pathToFileURL(path.join(here, 'electron-safety-fs.mjs')).href
const betterSqlite = pathToFileURL(appRequire.resolve('better-sqlite3')).href
const loaderSrc = `
import { existsSync, statSync, readFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'
let esbuild
let electronMock
let fsMock
let betterSqlite
export async function initialize(data) {
  esbuild = await import(data.esbuildEntry)
  electronMock = data.electronMock
  fsMock = data.fsMock
  betterSqlite = data.betterSqlite
}
export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'electron') return { url: electronMock, shortCircuit: true }
  if (specifier === 'better-sqlite3') return { url: betterSqlite, shortCircuit: true }
  if (specifier === 'fs' && context.parentURL.endsWith('/src/main/ipc/backup.ipc.ts')) {
    return { url: fsMock, shortCircuit: true }
  }
  if (specifier.startsWith('.') && context.parentURL) {
    try { return await nextResolve(specifier, context) }
    catch (err) {
      const parentDir = path.dirname(fileURLToPath(context.parentURL))
      const base = path.resolve(parentDir, specifier)
      const candidates = [base + '.ts', path.join(base, 'index.ts')]
      for (const candidate of candidates) {
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
  data: { esbuildEntry, electronMock, fsMock, betterSqlite }
})

const load = (relative) => import(pathToFileURL(path.join(root, relative)).href)
const hash = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex')

try {
  const { initDatabase, getDb, getDbPath } = await load('src/main/database/connection.ts')
  initDatabase()
  const db = getDb()
  const { registerSettingsHandlers } = await load('src/main/ipc/settings.ipc.ts')
  const { registerDataHandlers } = await load('src/main/ipc/data.ipc.ts')
  const { registerBackupHandlers } = await load('src/main/ipc/backup.ipc.ts')
  const { promotionsRepo } = await load('src/main/database/repositories/promotions.repo.ts')
  const { computeAutoDiscount } = await load('src/main/services/order-promotions.ts')
  const { recipeQuantityInStockUnits } = await load('src/main/services/stock-units.ts')

  registerSettingsHandlers()
  registerDataHandlers()
  registerBackupHandlers()

  // Logout is an entitlement transition: operational tables and setup completion survive.
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('setup_complete', 'true')").run()
  db.prepare("INSERT INTO categories (name, sort_order) VALUES ('Burgers', 1)").run()
  db.prepare("INSERT INTO stock_items (name, unit_type, quantity, price_per_unit, alert_threshold) VALUES ('Beef', 'kg', 9, 10, 1)").run()
  const categoryId = db.prepare("SELECT id FROM categories WHERE name = 'Burgers'").get().id
  db.prepare("INSERT INTO menu_items (name, price, category_id) VALUES ('Classic', 500, ?)").run(categoryId)
  db.prepare("INSERT INTO workers (name, role, pay_full_day, pay_half_day) VALUES ('Cook', 'cook', 1, 1)").run()
  db.prepare("INSERT INTO orders (daily_number, order_date, order_type, subtotal, total, discount_amount, status, created_at) VALUES (1, '2026-07-10', 'local', 500, 500, 0, 'completed', datetime('now'))").run()
  await getHandler('settings:logout')()
  for (const table of ['orders', 'menu_items', 'stock_items', 'workers']) {
    assert.equal(db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count, 1, `${table} was altered by logout`)
  }
  assert.equal(db.prepare("SELECT value FROM settings WHERE key = 'setup_complete'").get().value, 'true')

  // Stock unit conversion stays bounded and rejects incompatible/non-positive input.
  assert.equal(recipeQuantityInStockUnits(150, 'g', 'kg'), 0.15)
  assert.equal(recipeQuantityInStockUnits(250, 'ml', 'L'), 0.25)
  assert.throws(() => recipeQuantityInStockUnits(1, 'g', 'liter'), /incompatible/)
  assert.throws(() => recipeQuantityInStockUnits(0, 'g', 'kg'), /greater than zero/)

  // An oversized legacy promotion on one line must not consume the untouched line's value.
  assert.throws(() => promotionsRepo.createPromotion({ name: 'bad', type: 'percentage', discount_value: 101, applies_to: 'all' }), /0 and 100/)
  db.prepare("INSERT INTO menu_items (name, price, category_id) VALUES ('Fries', 300, ?)").run(categoryId)
  const menuId = db.prepare("SELECT id FROM menu_items WHERE name = 'Classic'").get().id
  const untouchedMenuId = db.prepare("SELECT id FROM menu_items WHERE name = 'Fries'").get().id
  const legacyPromoId = Number(db.prepare("INSERT INTO promotions (name, type, discount_value, applies_to, is_active) VALUES ('legacy', 'percentage', 200, 'specific', 1)").run().lastInsertRowid)
  db.prepare('INSERT INTO promotion_items (promotion_id, menu_item_id) VALUES (?, ?)').run(legacyPromoId, menuId)
  const discount = computeAutoDiscount([
    { menu_item_id: menuId, quantity: 1 },
    { menu_item_id: untouchedMenuId, quantity: 1 }
  ])
  assert.equal(discount.amount, 500)
  assert.equal(500 + 300 - discount.amount, 300, 'oversized promotion leaked into the untouched line')

  // Old renderer calls are refused in the main process, even when the UI is bypassed.
  assert.throws(() => getHandler('data:clearForImport')(), (error) => error?.code === 'FFM_DESTRUCTIVE_IMPORT_DISABLED')
  assert.throws(() => getHandler('data:restoreVersion')(1), (error) => error?.code === 'FFM_DESTRUCTIVE_IMPORT_DISABLED')
  process.env.FFM_ALLOW_DESTRUCTIVE_IMPORT = '1'
  assert.deepEqual(getHandler('data:clearForImport')(), { success: false, error: 'Destructive Excel replacement is disabled. No data was changed.' })
  delete process.env.FFM_ALLOW_DESTRUCTIVE_IMPORT

  // A corrupt or unrelated SQLite file is rejected before the live file changes.
  db.pragma('wal_checkpoint(TRUNCATE)')
  const livePath = getDbPath()
  const before = hash(livePath)
  const corrupt = path.join(scratch, 'corrupt.db')
  fs.writeFileSync(corrupt, 'not sqlite')
  setDialogPath(corrupt)
  const corruptResult = await getHandler('backup:restore')()
  assert.equal(corruptResult.success, false)
  assert.equal(hash(livePath), before)

  const unrelated = path.join(scratch, 'unrelated.db')
  const BetterSqlite = appRequire('better-sqlite3')
  const unrelatedDb = new BetterSqlite(unrelated)
  unrelatedDb.exec('CREATE TABLE unrelated (id INTEGER PRIMARY KEY)')
  unrelatedDb.close()
  setDialogPath(unrelated)
  const unrelatedResult = await getHandler('backup:restore')()
  assert.equal(unrelatedResult.success, false)
  assert.equal(hash(livePath), before)

  // If replacement fails after the live DB is closed and removed, the verified rollback reopens service.
  const candidate = path.join(scratch, 'candidate.db')
  fs.copyFileSync(livePath, candidate)
  setDialogPath(candidate)
  setFailRename(true)
  const rollbackResult = await getHandler('backup:restore')()
  setFailRename(false)
  assert.equal(rollbackResult.success, false)
  assert.equal(getDb().prepare("SELECT COUNT(*) AS count FROM orders").get().count, 1)
  console.log('electron safety IPC checks passed')
} catch (error) {
  console.error(error.stack || error)
  process.exitCode = 1
} finally {
  try { (await load('src/main/ipc/printer.ipc.ts')).stopPrintJobProcessor() } catch { /* not loaded */ }
  try { (await load('src/main/database/connection.ts')).closeDatabase() } catch { /* not open */ }
  try { fs.rmSync(scratch, { recursive: true, force: true }) } catch { /* best effort */ }
  process.exit(process.exitCode || 0)
}
