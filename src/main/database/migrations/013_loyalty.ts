import type Database from 'better-sqlite3'

export const migration013 = {
  version: 13,
  name: 'loyalty',
  up(db: Database.Database): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS customers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        phone TEXT NOT NULL UNIQUE,
        name TEXT,
        total_spent REAL NOT NULL DEFAULT 0,
        order_count INTEGER NOT NULL DEFAULT 0,
        last_order_date TEXT,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
      CREATE INDEX IF NOT EXISTS idx_customers_total_spent ON customers(total_spent DESC);
    `)

    try {
      db.exec(`ALTER TABLE orders ADD COLUMN customer_id INTEGER REFERENCES customers(id)`)
    } catch {
      // Column may already exist
    }
  }
}
