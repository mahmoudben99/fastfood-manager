import type Database from 'better-sqlite3'

export const migration011 = {
  version: 11,
  name: 'promotions',
  up: (db: Database.Database): void => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS promotions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        name_ar TEXT,
        name_fr TEXT,
        type TEXT NOT NULL CHECK(type IN ('percentage', 'fixed')),
        discount_value REAL NOT NULL,
        applies_to TEXT NOT NULL DEFAULT 'all',
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS promotion_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        promotion_id INTEGER NOT NULL,
        menu_item_id INTEGER NOT NULL,
        FOREIGN KEY (promotion_id) REFERENCES promotions(id) ON DELETE CASCADE,
        FOREIGN KEY (menu_item_id) REFERENCES menu_items(id) ON DELETE CASCADE,
        UNIQUE(promotion_id, menu_item_id)
      );

      CREATE TABLE IF NOT EXISTS packs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        name_ar TEXT,
        name_fr TEXT,
        pack_price REAL NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        emoji TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS pack_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pack_id INTEGER NOT NULL,
        menu_item_id INTEGER NOT NULL,
        quantity INTEGER NOT NULL DEFAULT 1,
        FOREIGN KEY (pack_id) REFERENCES packs(id) ON DELETE CASCADE,
        FOREIGN KEY (menu_item_id) REFERENCES menu_items(id) ON DELETE CASCADE
      );
    `)

    // Add discount tracking to orders
    try {
      db.exec(`ALTER TABLE orders ADD COLUMN discount_amount REAL NOT NULL DEFAULT 0`)
    } catch { /* column may already exist */ }
    try {
      db.exec(`ALTER TABLE orders ADD COLUMN discount_details TEXT`)
    } catch { /* column may already exist */ }
  }
}
