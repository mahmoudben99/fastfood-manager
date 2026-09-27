import type Database from 'better-sqlite3'

/**
 * Categories become soft-deletable. A hard DELETE failed with a foreign-key error whenever a
 * (soft-deleted) menu item or an order line still referenced the category, and would have
 * orphaned historical reports. Existing rows stay active.
 */
export const migration020 = {
  version: 20,
  name: 'category_soft_delete',
  up(db: Database.Database): void {
    const columns = db.prepare('PRAGMA table_info(categories)').all() as { name: string }[]
    if (!columns.some((column) => column.name === 'is_active')) {
      db.exec('ALTER TABLE categories ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1')
    }
  }
}
