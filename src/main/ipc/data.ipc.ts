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
}
