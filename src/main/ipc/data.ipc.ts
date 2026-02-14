import { ipcMain } from 'electron'
import { getDb } from '../database/connection'

export function registerDataHandlers(): void {
  // Clears all non-order data for fresh Excel import
  // Soft-deletes menu_items, stock_items, workers (preserves order history)
  // Hard-deletes categories, ingredients, worker_categories
  ipcMain.handle('data:clearForImport', () => {
    const db = getDb()

    // Temporarily disable foreign keys to allow category deletion
    db.pragma('foreign_keys = OFF')

    const transaction = db.transaction(() => {
      // Clear link tables
      db.exec('DELETE FROM menu_item_ingredients')
      db.exec('DELETE FROM worker_categories')

      // Clear stock audit data
      db.exec('DELETE FROM stock_adjustments')
      db.exec('DELETE FROM stock_purchases')

      // Soft-delete main entities (preserves order history references)
      db.exec("UPDATE menu_items SET is_active = 0, updated_at = datetime('now')")
      db.exec("UPDATE stock_items SET is_active = 0, updated_at = datetime('now')")
      db.exec("UPDATE workers SET is_active = 0, updated_at = datetime('now')")

      // Hard-delete categories (FK disabled)
      db.exec('DELETE FROM categories')
    })

    transaction()

    // Re-enable foreign keys
    db.pragma('foreign_keys = ON')

    return { success: true }
  })

  // Snapshot current data as a named version
  ipcMain.handle('data:saveVersion', (_, label: string) => {
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

    db.prepare('INSERT INTO menu_versions (label, data) VALUES (?, ?)').run(label, data)

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
    const db = getDb()

    const row = db.prepare('SELECT data FROM menu_versions WHERE id = ?').get(versionId) as any
    if (!row) throw new Error('Version not found')

    const snapshot = JSON.parse(row.data)

    // Clear current data (same as clearForImport)
    db.pragma('foreign_keys = OFF')
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
    db.pragma('foreign_keys = ON')

    return { success: true }
  })

  // Delete a saved version
  ipcMain.handle('data:deleteVersion', (_, versionId: number) => {
    const db = getDb()
    db.prepare('DELETE FROM menu_versions WHERE id = ?').run(versionId)
    return { success: true }
  })
}
