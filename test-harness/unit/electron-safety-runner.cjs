/* Runs SQLite-backed IPC checks under Electron's Node ABI in an isolated temporary userData dir. */
const assert = require('node:assert/strict')
const { createHash } = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')

const root = path.resolve(__dirname, '..', '..')
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'ffm-safety-'))
const handlers = new Map()
let dialogPath = null
let failRename = false

const electron = {
  app: {
    isPackaged: true,
    getPath: () => scratch,
    setLoginItemSettings: () => {}
  },
  ipcMain: { handle: (name, handler) => handlers.set(name, handler) },
  dialog: { showOpenDialog: async () => ({ canceled: !dialogPath, filePaths: dialogPath ? [dialogPath] : [] }) },
  BrowserWindow: class {},
  shell: { openPath: async () => '' }
}

const originalLoad = Module._load
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'electron') return electron
  if (request === 'fs') {
    return new Proxy(fs, {
      get(target, key) {
        if (key === 'renameSync') return (...args) => {
          if (failRename) throw new Error('forced replacement failure')
          return target.renameSync(...args)
        }
        return target[key]
      }
    })
  }
  return originalLoad.call(this, request, parent, isMain)
}
require.extensions['.ts'] = function compileTypeScript(mod, filename) {
  const source = fs.readFileSync(filename, 'utf8')
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
  }).outputText
  mod._compile(output, filename)
}

const load = (relative) => require(path.join(root, relative))
const hash = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex')

;(async () => {
  const { initDatabase, getDb, getDbPath } = load('src/main/database/connection.ts')
  initDatabase()
  const db = getDb()
  const { registerSettingsHandlers } = load('src/main/ipc/settings.ipc.ts')
  const { registerDataHandlers } = load('src/main/ipc/data.ipc.ts')
  const { registerBackupHandlers } = load('src/main/ipc/backup.ipc.ts')
  const { promotionsRepo } = load('src/main/database/repositories/promotions.repo.ts')
  const { computeAutoDiscount } = load('src/main/services/order-promotions.ts')
  const { recipeQuantityInStockUnits } = load('src/main/services/stock-units.ts')

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
  await handlers.get('settings:logout')()
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
  assert.throws(() => handlers.get('data:clearForImport')(), (error) => error?.code === 'FFM_DESTRUCTIVE_IMPORT_DISABLED')
  assert.throws(() => handlers.get('data:restoreVersion')(1), (error) => error?.code === 'FFM_DESTRUCTIVE_IMPORT_DISABLED')
  process.env.FFM_ALLOW_DESTRUCTIVE_IMPORT = '1'
  assert.deepEqual(handlers.get('data:clearForImport')(), { success: false, error: 'Destructive Excel replacement is disabled. No data was changed.' })
  delete process.env.FFM_ALLOW_DESTRUCTIVE_IMPORT

  // A corrupt or unrelated SQLite file is rejected before the live file changes.
  db.pragma('wal_checkpoint(TRUNCATE)')
  const livePath = getDbPath()
  const before = hash(livePath)
  const corrupt = path.join(scratch, 'corrupt.db')
  fs.writeFileSync(corrupt, 'not sqlite')
  dialogPath = corrupt
  const corruptResult = await handlers.get('backup:restore')()
  assert.equal(corruptResult.success, false)
  assert.equal(hash(livePath), before)

  const unrelated = path.join(scratch, 'unrelated.db')
  const BetterSqlite = require('better-sqlite3')
  const unrelatedDb = new BetterSqlite(unrelated)
  unrelatedDb.exec('CREATE TABLE unrelated (id INTEGER PRIMARY KEY)')
  unrelatedDb.close()
  dialogPath = unrelated
  const unrelatedResult = await handlers.get('backup:restore')()
  assert.equal(unrelatedResult.success, false)
  assert.equal(hash(livePath), before)

  // If replacement fails after the live DB is closed and removed, the verified rollback reopens service.
  const candidate = path.join(scratch, 'candidate.db')
  fs.copyFileSync(livePath, candidate)
  dialogPath = candidate
  failRename = true
  const rollbackResult = await handlers.get('backup:restore')()
  failRename = false
  assert.equal(rollbackResult.success, false)
  assert.equal(getDb().prepare("SELECT COUNT(*) AS count FROM orders").get().count, 1)
  console.log('electron safety IPC checks passed')
})().catch((error) => {
  console.error(error.stack || error)
  process.exitCode = 1
}).finally(() => {
  try { load('src/main/ipc/printer.ipc.ts').stopPrintJobProcessor() } catch { /* not loaded */ }
  try { load('src/main/database/connection.ts').closeDatabase() } catch { /* not open */ }
  try { fs.rmSync(scratch, { recursive: true, force: true }) } catch { /* best effort */ }
  process.exit(process.exitCode || 0)
})
