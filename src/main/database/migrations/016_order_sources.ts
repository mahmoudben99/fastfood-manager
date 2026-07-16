import type Database from 'better-sqlite3'

export const migration016 = {
  version: 16,
  name: 'order_sources_and_remote_inbox',
  up(db: Database.Database): void {
    try {
      db.exec("ALTER TABLE orders ADD COLUMN source TEXT NOT NULL DEFAULT 'pos'")
    } catch {
      // Column may already exist on an interrupted development database.
    }
    try {
      db.exec('ALTER TABLE orders ADD COLUMN source_request_id TEXT')
    } catch {
      // Column may already exist on an interrupted development database.
    }

    db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_source_request
      ON orders(source, source_request_id)
      WHERE source_request_id IS NOT NULL;

      CREATE TABLE IF NOT EXISTS remote_order_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cloud_id TEXT NOT NULL UNIQUE,
        order_data TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'submitted'
          CHECK(status IN ('submitted', 'accepted', 'rejected', 'expired', 'failed')),
        local_order_id INTEGER,
        remote_created_at TEXT,
        expires_at TEXT NOT NULL,
        last_error TEXT,
        cloud_sync_pending INTEGER NOT NULL DEFAULT 1,
        received_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (local_order_id) REFERENCES orders(id)
      );

      CREATE INDEX IF NOT EXISTS idx_remote_order_requests_status
      ON remote_order_requests(status, received_at);
    `)
  }
}
