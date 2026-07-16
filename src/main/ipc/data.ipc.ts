import { ipcMain } from 'electron'
import Database from 'better-sqlite3'
import { unlinkSync } from 'fs'
import { dirname, join } from 'path'
import { getDb, getDbPath } from '../database/connection'
import {
  setupImportNameKey,
  validateSetupImportPayload,
  type SetupImportPayload,
  type SetupImportResult
} from '../../shared/excel-import'

/** Create a verified whole-database safety snapshot before the atomic first-run import. */
async function snapshotBeforeImport(): Promise<string | null> {
  let dest: string | null = null
  try {
    const db = getDb()
    const dbPath = getDbPath()
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    dest = join(dirname(dbPath), `pre-import-backup-${stamp}.db`)
    await db.backup(dest)
    let candidate: Database.Database | null = null
    try {
      candidate = new Database(dest, { readonly: true, fileMustExist: true })
      const checks = candidate.pragma('quick_check') as Array<Record<string, unknown>>
      const healthy = checks.length > 0 && checks.every((row) => Object.values(row)[0] === 'ok')
      if (!healthy) throw new Error('SQLite quick_check rejected the safety snapshot')
    } finally {
      candidate?.close()
    }
    console.info(`[Setup Import] Verified safety snapshot saved to ${dest}`)
    return dest
  } catch (err) {
    console.error('[Setup Import] Could not create a verified safety snapshot:', err)
    if (dest) {
      try {
        unlinkSync(dest)
      } catch {
        // Best effort only; the import remains cancelled.
      }
    }
    return null
  }
}

function setupImportBlocker(): string | null {
  const db = getDb()
  const setupComplete = db.prepare("SELECT value FROM settings WHERE key = 'setup_complete'").get() as
    | { value: string }
    | undefined
  if (setupComplete?.value === 'true') {
    return 'Excel setup import is available only during initial setup. Use the menu and stock editors for an operating restaurant.'
  }

  const counts = db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM orders) AS orders,
         (SELECT COUNT(*) FROM order_items) AS order_items,
         (SELECT COUNT(*) FROM order_item_deductions) AS deductions,
         (SELECT COUNT(*) FROM worker_attendance) AS attendance,
         (SELECT COUNT(*) FROM stock_adjustments) AS adjustments,
         (SELECT COUNT(*) FROM stock_purchases) AS purchases,
         (SELECT COUNT(*) FROM customers) AS customers,
         (SELECT COUNT(*) FROM promotions) AS promotions,
         (SELECT COUNT(*) FROM packs) AS packs,
         (SELECT COUNT(*) FROM printer_assignments WHERE worker_id IS NOT NULL) AS worker_printers`
    )
    .get() as Record<string, number>

  if (Object.values(counts).some((count) => count > 0)) {
    return 'Excel setup import was refused because this database already contains business history or operating configuration. No data was changed.'
  }
  return null
}

function importSetupData(payload: SetupImportPayload): Omit<SetupImportResult, 'success' | 'snapshot'> {
  const db = getDb()
  const transaction = db.transaction(() => {
    const blocker = setupImportBlocker()
    if (blocker) throw new Error(blocker)

    // This endpoint is deliberately first-run-only. With no business history, hard replacement
    // avoids leaving inactive rows with dangling category references.
    db.exec(`
      DELETE FROM menu_item_ingredients;
      DELETE FROM worker_categories;
      DELETE FROM stock_adjustments;
      DELETE FROM stock_purchases;
      DELETE FROM menu_items;
      DELETE FROM stock_items;
      DELETE FROM workers;
      DELETE FROM categories;
    `)

    const insertCategory = db.prepare(
      `INSERT INTO categories (name, name_ar, name_fr, icon, sort_order)
       VALUES (?, ?, ?, ?, ?)`
    )
    const categoryIds = new Map<string, number>()
    payload.categories.forEach((category, index) => {
      const result = insertCategory.run(
        category.name,
        category.name_ar ?? null,
        category.name_fr ?? null,
        category.icon ?? null,
        index
      )
      categoryIds.set(setupImportNameKey(category.name), Number(result.lastInsertRowid))
    })

    const insertStock = db.prepare(
      `INSERT INTO stock_items
         (name, name_ar, name_fr, unit_type, quantity, price_per_unit, alert_threshold, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1)`
    )
    const stockIds = new Map<string, number>()
    for (const stock of payload.stockItems) {
      const result = insertStock.run(
        stock.name,
        stock.name_ar ?? null,
        stock.name_fr ?? null,
        stock.unit_type,
        stock.quantity,
        stock.price_per_unit,
        stock.alert_threshold
      )
      stockIds.set(setupImportNameKey(stock.name), Number(result.lastInsertRowid))
    }

    const insertMenuItem = db.prepare(
      `INSERT INTO menu_items
         (name, name_ar, name_fr, price, category_id, emoji, is_active)
       VALUES (?, ?, ?, ?, ?, ?, 1)`
    )
    const menuItemIds = new Map<string, number>()
    for (const item of payload.menuItems) {
      const categoryId = categoryIds.get(setupImportNameKey(item.category_name))
      if (!categoryId) throw new Error(`Category "${item.category_name}" disappeared during import`)
      const result = insertMenuItem.run(
        item.name,
        item.name_ar ?? null,
        item.name_fr ?? null,
        item.price,
        categoryId,
        item.emoji ?? null
      )
      menuItemIds.set(setupImportNameKey(item.name), Number(result.lastInsertRowid))
    }

    const insertWorker = db.prepare(
      `INSERT INTO workers (name, role, pay_full_day, pay_half_day, phone, is_active)
       VALUES (?, ?, ?, ?, ?, 1)`
    )
    const insertWorkerCategory = db.prepare(
      'INSERT INTO worker_categories (worker_id, category_id) VALUES (?, ?)'
    )
    for (const worker of payload.workers) {
      const result = insertWorker.run(
        worker.name,
        worker.role,
        worker.pay_full_day,
        worker.pay_half_day,
        worker.phone ?? null
      )
      const workerId = Number(result.lastInsertRowid)
      for (const categoryName of worker.category_names) {
        const categoryId = categoryIds.get(setupImportNameKey(categoryName))
        if (!categoryId) throw new Error(`Worker category "${categoryName}" disappeared during import`)
        insertWorkerCategory.run(workerId, categoryId)
      }
    }

    const insertIngredient = db.prepare(
      `INSERT INTO menu_item_ingredients (menu_item_id, stock_item_id, quantity, unit)
       VALUES (?, ?, ?, ?)`
    )
    for (const ingredient of payload.ingredients) {
      const menuItemId = menuItemIds.get(setupImportNameKey(ingredient.menu_item_name))
      const stockItemId = stockIds.get(setupImportNameKey(ingredient.stock_item_name))
      if (!menuItemId || !stockItemId) throw new Error('An ingredient reference disappeared during import')
      insertIngredient.run(menuItemId, stockItemId, ingredient.quantity, ingredient.unit)
    }

    const foreignKeyErrors = db.pragma('foreign_key_check') as unknown[]
    if (foreignKeyErrors.length > 0) {
      throw new Error('The imported workbook would create invalid database relationships')
    }

    const counts = {
      categories: payload.categories.length,
      menuItems: payload.menuItems.length,
      stockItems: payload.stockItems.length,
      workers: payload.workers.length,
      ingredients: payload.ingredients.length
    }
    return {
      counts,
      total: Object.values(counts).reduce((sum, count) => sum + count, 0)
    }
  })

  return transaction()
}

export function registerDataHandlers(): void {
  // Fail-closed compatibility endpoint for renderer bundles from before atomic setup import.
  ipcMain.handle('data:clearForImport', () => {
    return {
      success: false,
      error: 'Destructive Excel replacement is disabled. No data was changed.'
    }
  })

  ipcMain.handle('data:importSetup', async (_, untrustedPayload: unknown): Promise<SetupImportResult> => {
    const payload = validateSetupImportPayload(untrustedPayload)
    const blocker = setupImportBlocker()
    if (blocker) throw new Error(blocker)

    const snapshot = await snapshotBeforeImport()
    if (!snapshot) {
      throw new Error('A verified safety snapshot could not be created. Import was cancelled before changing any data.')
    }

    try {
      const imported = importSetupData(payload)
      return { success: true, snapshot, ...imported }
    } catch (error) {
      // The SQLite transaction already restored the original rows.
      try {
        unlinkSync(snapshot)
      } catch {
        // The file is harmless if Windows briefly keeps it open.
      }
      throw error
    }
  })

  // Snapshot current data as a named version
  ipcMain.handle('data:saveVersion', (_, label: string) => {
    if (typeof label !== 'string' || !label.trim() || label.trim().length > 200) {
      throw new Error('Recovery point label must contain 1 to 200 characters')
    }
    const db = getDb()

    const categories = db
      .prepare("SELECT name, name_ar, name_fr, icon, sort_order FROM categories ORDER BY sort_order")
      .all()

    const menuItems = db
      .prepare(
        `SELECT m.name, m.name_ar, m.name_fr, m.price, m.emoji, m.image_path,
                c.name as category_name
         FROM menu_items m
         LEFT JOIN categories c ON m.category_id = c.id
         WHERE m.is_active = 1
         ORDER BY m.id`
      )
      .all()

    const stockItems = db
      .prepare(
        `SELECT name, name_ar, name_fr, unit_type, quantity, price_per_unit, alert_threshold
         FROM stock_items WHERE is_active = 1 ORDER BY id`
      )
      .all()

    const workers = db
      .prepare(
        `SELECT name, role, pay_full_day, pay_half_day, phone
         FROM workers WHERE is_active = 1 ORDER BY id`
      )
      .all()

    const ingredients = db
      .prepare(
        `SELECT m.name as menu_item_name, s.name as stock_item_name,
                mi.quantity, mi.unit
         FROM menu_item_ingredients mi
         JOIN menu_items m ON mi.menu_item_id = m.id
         JOIN stock_items s ON mi.stock_item_id = s.id
         WHERE m.is_active = 1`
      )
      .all()

    // Also snapshot worker_categories
    const workerCategories = db
      .prepare(
        `SELECT w.name as worker_name, c.name as category_name
         FROM worker_categories wc
         JOIN workers w ON wc.worker_id = w.id
         JOIN categories c ON wc.category_id = c.id
         WHERE w.is_active = 1`
      )
      .all()

    const data = JSON.stringify({
      categories,
      menuItems,
      stockItems,
      workers,
      ingredients,
      workerCategories
    })

    db.prepare('INSERT INTO menu_versions (label, data) VALUES (?, ?)').run(label.trim(), data)

    return { success: true }
  })

  // List all saved versions
  ipcMain.handle('data:listVersions', () => {
    const db = getDb()
    const versions = db
      .prepare('SELECT id, label, created_at, length(data) as data_size FROM menu_versions ORDER BY created_at DESC')
      .all()

    // Parse each version's data to get counts
    return versions.map((v: any) => {
      try {
        const raw = db.prepare('SELECT data FROM menu_versions WHERE id = ?').get(v.id) as any
        const parsed = JSON.parse(raw.data)
        return {
          id: v.id,
          label: v.label,
          created_at: v.created_at,
          counts: {
            categories: parsed.categories?.length || 0,
            menuItems: parsed.menuItems?.length || 0,
            stockItems: parsed.stockItems?.length || 0,
            workers: parsed.workers?.length || 0
          }
        }
      } catch {
        return { id: v.id, label: v.label, created_at: v.created_at, counts: null }
      }
    })
  })

  // Restore from a saved version
  ipcMain.handle('data:restoreVersion', (_, versionId: number) => {
    if (!Number.isInteger(versionId) || versionId <= 0) throw new Error('Invalid recovery point')
    const db = getDb()

    const row = db.prepare('SELECT data FROM menu_versions WHERE id = ?').get(versionId) as any
    if (!row) throw new Error('Version not found')

    const snapshot = JSON.parse(row.data)

    // Clear the current menu configuration inside the version-restore transaction.
    // try/finally guarantees FK enforcement is restored even if restore throws midway.
    db.pragma('foreign_keys = OFF')
    try {
    const clearAndRestore = db.transaction(() => {
      db.exec('DELETE FROM menu_item_ingredients')
      db.exec('DELETE FROM worker_categories')
      db.exec('DELETE FROM stock_adjustments')
      db.exec('DELETE FROM stock_purchases')
      db.exec("UPDATE menu_items SET is_active = 0, updated_at = datetime('now')")
      db.exec("UPDATE stock_items SET is_active = 0, updated_at = datetime('now')")
      db.exec("UPDATE workers SET is_active = 0, updated_at = datetime('now')")
      db.exec('DELETE FROM categories')

      // Restore categories
      const insertCat = db.prepare(
        'INSERT INTO categories (name, name_ar, name_fr, icon, sort_order) VALUES (?, ?, ?, ?, ?)'
      )
      for (const c of snapshot.categories || []) {
        insertCat.run(c.name, c.name_ar || null, c.name_fr || null, c.icon || null, c.sort_order ?? 0)
      }

      // Restore stock items
      const insertStock = db.prepare(
        `INSERT INTO stock_items (name, name_ar, name_fr, unit_type, quantity, price_per_unit, alert_threshold, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1)`
      )
      for (const s of snapshot.stockItems || []) {
        insertStock.run(
          s.name, s.name_ar || null, s.name_fr || null,
          s.unit_type || 'kg', s.quantity || 0, s.price_per_unit || 0, s.alert_threshold || 0
        )
      }

      // Build lookup maps for categories and stock items
      const allCats = db.prepare('SELECT id, name FROM categories').all() as any[]
      const catMap = new Map(allCats.map((c: any) => [c.name.toLowerCase(), c.id]))

      const allStock = db.prepare("SELECT id, name FROM stock_items WHERE is_active = 1").all() as any[]
      const stockMap = new Map(allStock.map((s: any) => [s.name.toLowerCase(), s.id]))

      // Restore menu items
      const insertMenu = db.prepare(
        `INSERT INTO menu_items (name, name_ar, name_fr, price, category_id, emoji, image_path, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1)`
      )
      for (const m of snapshot.menuItems || []) {
        const catId = catMap.get((m.category_name || '').toLowerCase())
        if (catId) {
          insertMenu.run(
            m.name, m.name_ar || null, m.name_fr || null,
            m.price || 0, catId, m.emoji || null, m.image_path || null
          )
        }
      }

      // Build menu item lookup
      const allMenuItems = db.prepare("SELECT id, name FROM menu_items WHERE is_active = 1").all() as any[]
      const menuMap = new Map(allMenuItems.map((m: any) => [m.name.toLowerCase(), m.id]))

      // Restore ingredients
      const insertIng = db.prepare(
        'INSERT OR IGNORE INTO menu_item_ingredients (menu_item_id, stock_item_id, quantity, unit) VALUES (?, ?, ?, ?)'
      )
      for (const ing of snapshot.ingredients || []) {
        const menuId = menuMap.get((ing.menu_item_name || '').toLowerCase())
        const stockId = stockMap.get((ing.stock_item_name || '').toLowerCase())
        if (menuId && stockId) {
          insertIng.run(menuId, stockId, ing.quantity || 0, ing.unit || 'kg')
        }
      }

      // Restore workers
      const insertWorker = db.prepare(
        `INSERT INTO workers (name, role, pay_full_day, pay_half_day, phone, is_active)
         VALUES (?, ?, ?, ?, ?, 1)`
      )
      for (const w of snapshot.workers || []) {
        insertWorker.run(w.name, w.role || 'cook', w.pay_full_day || 0, w.pay_half_day || 0, w.phone || null)
      }

      // Restore worker categories
      if (snapshot.workerCategories?.length) {
        const allWorkers = db.prepare("SELECT id, name FROM workers WHERE is_active = 1").all() as any[]
        const workerMap = new Map(allWorkers.map((w: any) => [w.name.toLowerCase(), w.id]))

        const insertWC = db.prepare(
          'INSERT OR IGNORE INTO worker_categories (worker_id, category_id) VALUES (?, ?)'
        )
        for (const wc of snapshot.workerCategories) {
          const workerId = workerMap.get((wc.worker_name || '').toLowerCase())
          const catId = catMap.get((wc.category_name || '').toLowerCase())
          if (workerId && catId) {
            insertWC.run(workerId, catId)
          }
        }
      }
    })

    clearAndRestore()
    } finally {
      db.pragma('foreign_keys = ON')
    }

    return { success: true }
  })

  // Delete a saved version
  ipcMain.handle('data:deleteVersion', (_, versionId: number) => {
    if (!Number.isInteger(versionId) || versionId <= 0) throw new Error('Invalid recovery point')
    const db = getDb()
    db.prepare('DELETE FROM menu_versions WHERE id = ?').run(versionId)
    return { success: true }
  })
}
