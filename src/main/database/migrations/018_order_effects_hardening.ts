import type Database from 'better-sqlite3'

/** Upgrade guard for development databases that may already have the first WP-F migration. */
export const migration018 = {
  version: 18,
  name: 'order_effects_hardening',
  up(db: Database.Database): void {
    try { db.exec('ALTER TABLE outbox_events ADD COLUMN claim_token TEXT') } catch { /* already present */ }
    try { db.exec('ALTER TABLE outbox_events ADD COLUMN claimed_at TEXT') } catch { /* already present */ }

    const itemForeignKey = (db.prepare('PRAGMA foreign_key_list(audit_events)').all() as {
      from: string
    }[]).some((row) => row.from === 'order_item_id')

    // Audit rows retain the historical numeric line id. A live FK would either prevent line
    // removal or mutate an immutable audit row via ON DELETE SET NULL.
    if (itemForeignKey) {
      db.exec(`
        DROP TRIGGER IF EXISTS trg_audit_events_immutable;
        DROP TRIGGER IF EXISTS trg_audit_events_no_delete;
        ALTER TABLE audit_events RENAME TO audit_events_with_item_fk;
        CREATE TABLE audit_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          event_type TEXT NOT NULL CHECK(event_type IN ('price_override', 'void')),
          order_id INTEGER NOT NULL,
          order_item_id INTEGER,
          original_value TEXT NOT NULL,
          new_value TEXT NOT NULL,
          operator TEXT NOT NULL,
          reason TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          FOREIGN KEY (order_id) REFERENCES orders(id)
        );
        INSERT INTO audit_events
          (id, event_type, order_id, order_item_id, original_value, new_value, operator, reason, created_at)
        SELECT id, event_type, order_id, order_item_id, original_value, new_value, operator, reason, created_at
        FROM audit_events_with_item_fk;
        DROP TABLE audit_events_with_item_fk;
      `)
    }

    db.exec(`
      CREATE TABLE IF NOT EXISTS outbox_consumer_receipts (
        event_id INTEGER NOT NULL,
        consumer TEXT NOT NULL,
        completed_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (event_id, consumer),
        FOREIGN KEY (event_id) REFERENCES outbox_events(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_audit_events_order ON audit_events(order_id, id);
      CREATE TRIGGER IF NOT EXISTS trg_audit_events_immutable
      BEFORE UPDATE ON audit_events
      BEGIN
        SELECT RAISE(ABORT, 'audit_events are immutable');
      END;
      CREATE TRIGGER IF NOT EXISTS trg_audit_events_no_delete
      BEFORE DELETE ON audit_events
      BEGIN
        SELECT RAISE(ABORT, 'audit_events are append-only');
      END;
      -- Fresh, not-yet-configured databases need a logical kitchen destination so an order
      -- transaction always leaves a durable print intent. Never enable it silently on an
      -- existing configured installation; the setup printer screen will persist its choice.
      INSERT INTO settings(key, value)
      SELECT 'auto_print_kitchen', 'true'
      WHERE NOT EXISTS (SELECT 1 FROM settings WHERE key = 'auto_print_kitchen')
        AND COALESCE((SELECT value FROM settings WHERE key = 'setup_complete'), 'false') = 'false';
    `)
  }
}
