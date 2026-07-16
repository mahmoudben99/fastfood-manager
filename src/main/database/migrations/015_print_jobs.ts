import type Database from 'better-sqlite3'

export const migration015 = {
  version: 15,
  name: 'durable_print_jobs',
  up(db: Database.Database): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS print_jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL,
        event_type TEXT NOT NULL DEFAULT 'new'
          CHECK(event_type IN ('new', 'updated', 'cancelled', 'restored')),
        event_sequence INTEGER NOT NULL DEFAULT 1,
        document_type TEXT NOT NULL
          CHECK(document_type IN ('receipt', 'kitchen')),
        scope TEXT NOT NULL DEFAULT 'all'
          CHECK(scope IN ('all', 'worker', 'unassigned')),
        worker_id INTEGER,
        status TEXT NOT NULL DEFAULT 'pending'
          CHECK(status IN ('pending', 'printing', 'succeeded', 'attention', 'cancelled')),
        attempts INTEGER NOT NULL DEFAULT 0,
        next_attempt_at TEXT,
        last_error TEXT,
        last_attempt_at TEXT,
        completed_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
        FOREIGN KEY (worker_id) REFERENCES workers(id)
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_print_jobs_unique_effect
      ON print_jobs(
        order_id, event_type, event_sequence, document_type, scope, IFNULL(worker_id, -1)
      );

      CREATE INDEX IF NOT EXISTS idx_print_jobs_pending
      ON print_jobs(status, next_attempt_at, created_at);

      -- Existing duplicate daily numbers, if any, remain untouched for auditability. This
      -- trigger prevents any new duplicate even on databases that cannot yet accept a unique
      -- index because historical duplicates need an owner-reviewed repair.
      CREATE TRIGGER IF NOT EXISTS trg_orders_unique_daily_number
      BEFORE INSERT ON orders
      WHEN EXISTS (
        SELECT 1 FROM orders
        WHERE order_date = NEW.order_date AND daily_number = NEW.daily_number
      )
      BEGIN
        SELECT RAISE(ABORT, 'duplicate daily order number');
      END;
    `)

    // A crash while Electron was printing leaves an indeterminate physical outcome. Never
    // auto-retry it on startup; require staff attention to avoid duplicate kitchen tickets.
    db.prepare(
      `UPDATE print_jobs
       SET status = 'attention',
           last_error = COALESCE(last_error, 'Application closed while printing; verify before retrying'),
           updated_at = datetime('now')
       WHERE status = 'printing'`
    ).run()
  }
}
