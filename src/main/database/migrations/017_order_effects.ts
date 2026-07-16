import type Database from 'better-sqlite3'

/** Durable side effects and the append-only audit trail for order mutations. */
export const migration017 = {
  version: 17,
  name: 'order_effects_and_audit_events',
  up(db: Database.Database): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS outbox_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_type TEXT NOT NULL CHECK(event_type IN ('owner-sync', 'analytics-dirty', 'telegram', 'queue-broadcast')),
        payload TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'done', 'failed')),
        attempts INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        next_attempt_at TEXT,
        claim_token TEXT,
        claimed_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_outbox_events_pending
        ON outbox_events(status, next_attempt_at, created_at);

      CREATE TABLE IF NOT EXISTS audit_events (
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
    `)
  }
}
