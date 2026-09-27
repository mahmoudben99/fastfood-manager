import type Database from 'better-sqlite3'

/**
 * Snapshot each order line's menu-item name at sale time. Readers previously joined the
 * CURRENT menu_items name, so renaming or reusing a menu item rewrote old receipts, reprints
 * and top-seller reports. Readers use COALESCE(snapshot, current) so a row without a snapshot
 * (menu item missing at backfill time) still shows something.
 */
export const migration019 = {
  version: 19,
  name: 'order_item_name_snapshot',
  up(db: Database.Database): void {
    const columns = new Set(
      (db.prepare('PRAGMA table_info(order_items)').all() as { name: string }[]).map((c) => c.name)
    )
    if (!columns.has('item_name')) db.exec('ALTER TABLE order_items ADD COLUMN item_name TEXT')
    if (!columns.has('item_name_ar')) db.exec('ALTER TABLE order_items ADD COLUMN item_name_ar TEXT')
    if (!columns.has('item_name_fr')) db.exec('ALTER TABLE order_items ADD COLUMN item_name_fr TEXT')

    // Backfill from today's menu names — the best information available for existing rows.
    // Only rows that have no snapshot yet are touched, so re-running is harmless.
    db.exec(`
      UPDATE order_items SET
        item_name = (SELECT mi.name FROM menu_items mi WHERE mi.id = order_items.menu_item_id),
        item_name_ar = (SELECT mi.name_ar FROM menu_items mi WHERE mi.id = order_items.menu_item_id),
        item_name_fr = (SELECT mi.name_fr FROM menu_items mi WHERE mi.id = order_items.menu_item_id)
      WHERE item_name IS NULL
        AND EXISTS (SELECT 1 FROM menu_items mi WHERE mi.id = order_items.menu_item_id)
    `)
  }
}
