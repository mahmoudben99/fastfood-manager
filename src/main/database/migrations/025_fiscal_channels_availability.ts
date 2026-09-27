import type Database from 'better-sqlite3'
import { appendJournal, setFiscalMeta } from '../../services/fiscal/journal'

/**
 * v4 fiscal compliance + sales channels + time-based availability.
 *
 * Fiscal (Algeria, LF 2026 art. 74 — records that cannot be altered, kept 6 years):
 *  - orders.fiscal_number: one global, gapless ticket number per order, taken from
 *    fiscal_counters inside the order's own transaction (daily_number stays for the kitchen).
 *    Existing orders are numbered 1..N in creation (id) order.
 *  - fiscal_journal: append-only, SHA-256 chained event list (see services/fiscal/journal.ts).
 *    The first entry ('journal_open') records the historical orders it inherited.
 *  - Triggers: journal rows can never be updated or deleted and must be contiguous; orders can
 *    never be deleted; a fiscal number never changes; payment rows keep their amounts; any order
 *    line removed by an edit is first copied to order_items_archive (append-only).
 * Channels: orders.channel ('local' | 'takeout' | 'delivery' | 'yassir' | custom platform id),
 *  menu_item_channel_prices, setting sales_channels (platform list).
 * Availability: availability_rules (+ setting availability_enforce 'warn' | 'block').
 */
export const migration025 = {
  version: 25,
  name: 'fiscal_channels_availability',
  up(db: Database.Database): void {
    const orderColumns = new Set((db.prepare('PRAGMA table_info(orders)').all() as { name: string }[]).map((c) => c.name))
    if (!orderColumns.has('fiscal_number')) db.exec('ALTER TABLE orders ADD COLUMN fiscal_number INTEGER')
    if (!orderColumns.has('channel')) db.exec('ALTER TABLE orders ADD COLUMN channel TEXT')

    db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_fiscal_number ON orders(fiscal_number) WHERE fiscal_number IS NOT NULL;

      CREATE TABLE IF NOT EXISTS fiscal_counters (
        name TEXT PRIMARY KEY,
        last_value INTEGER NOT NULL DEFAULT 0 CHECK(last_value >= 0)
      );
      CREATE TABLE IF NOT EXISTS fiscal_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS fiscal_journal (
        seq INTEGER PRIMARY KEY,
        created_at TEXT NOT NULL,
        event_type TEXT NOT NULL,
        order_id INTEGER,
        fiscal_number INTEGER,
        payload TEXT NOT NULL,
        prev_hash TEXT NOT NULL,
        hash TEXT NOT NULL UNIQUE
      );
      CREATE INDEX IF NOT EXISTS idx_fiscal_journal_order ON fiscal_journal(order_id, event_type);
      CREATE INDEX IF NOT EXISTS idx_fiscal_journal_created ON fiscal_journal(created_at);

      CREATE TABLE IF NOT EXISTS order_items_archive (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_item_id INTEGER NOT NULL,
        order_id INTEGER NOT NULL,
        row_json TEXT NOT NULL,
        removed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );
      CREATE INDEX IF NOT EXISTS idx_order_items_archive_order ON order_items_archive(order_id);

      CREATE TABLE IF NOT EXISTS menu_item_channel_prices (
        menu_item_id INTEGER NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
        channel TEXT NOT NULL,
        price REAL NOT NULL CHECK(price >= 0),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (menu_item_id, channel)
      );

      CREATE TABLE IF NOT EXISTS availability_rules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        target_kind TEXT NOT NULL CHECK(target_kind IN ('menu_item', 'category')),
        target_id INTEGER NOT NULL,
        label TEXT,
        weekdays INTEGER NOT NULL DEFAULT 127 CHECK(weekdays BETWEEN 0 AND 127),
        start_time TEXT,
        end_time TEXT,
        start_date TEXT,
        end_date TEXT,
        is_active INTEGER NOT NULL DEFAULT 1,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_availability_rules_target ON availability_rules(target_kind, target_id);
    `)

    // Number the orders taken before this version, oldest first (by id = creation order).
    const numbered = db.prepare('SELECT COALESCE(MAX(fiscal_number), 0) AS n FROM orders').get() as { n: number }
    let next = numbered.n
    const setNumber = db.prepare('UPDATE orders SET fiscal_number = ? WHERE id = ?')
    for (const row of db.prepare('SELECT id FROM orders WHERE fiscal_number IS NULL ORDER BY id').all() as { id: number }[]) {
      setNumber.run(++next, row.id)
    }
    db.exec("UPDATE orders SET channel = CASE WHEN order_type IN ('takeout', 'delivery') THEN order_type ELSE 'local' END WHERE channel IS NULL")
    db.prepare(
      "INSERT INTO fiscal_counters (name, last_value) VALUES ('ticket', ?) ON CONFLICT(name) DO UPDATE SET last_value = MAX(last_value, excluded.last_value)"
    ).run(next)

    db.exec(`
      CREATE TRIGGER IF NOT EXISTS trg_fiscal_journal_immutable BEFORE UPDATE ON fiscal_journal
      BEGIN SELECT RAISE(ABORT, 'FISCAL_JOURNAL_APPEND_ONLY: journal entries cannot be changed'); END;
      CREATE TRIGGER IF NOT EXISTS trg_fiscal_journal_no_delete BEFORE DELETE ON fiscal_journal
      BEGIN SELECT RAISE(ABORT, 'FISCAL_JOURNAL_APPEND_ONLY: journal entries cannot be deleted'); END;
      CREATE TRIGGER IF NOT EXISTS trg_fiscal_journal_contiguous BEFORE INSERT ON fiscal_journal
      WHEN NEW.seq <> (SELECT COALESCE(MAX(seq), 0) + 1 FROM fiscal_journal)
      BEGIN SELECT RAISE(ABORT, 'FISCAL_JOURNAL_APPEND_ONLY: journal entries must be contiguous'); END;

      CREATE TRIGGER IF NOT EXISTS trg_orders_no_delete BEFORE DELETE ON orders
      BEGIN SELECT RAISE(ABORT, 'FISCAL_RECORD_PROTECTED: orders are never deleted (cancel them instead)'); END;
      CREATE TRIGGER IF NOT EXISTS trg_orders_fiscal_number_fixed BEFORE UPDATE OF fiscal_number ON orders
      WHEN OLD.fiscal_number IS NOT NULL AND NEW.fiscal_number IS NOT OLD.fiscal_number
      BEGIN SELECT RAISE(ABORT, 'FISCAL_RECORD_PROTECTED: a fiscal number never changes'); END;

      CREATE TRIGGER IF NOT EXISTS trg_order_payments_fixed
      BEFORE UPDATE OF order_id, kind, method, amount, rounding, created_at ON order_payments
      BEGIN SELECT RAISE(ABORT, 'FISCAL_RECORD_PROTECTED: payments are corrected with a refund, never edited'); END;
      CREATE TRIGGER IF NOT EXISTS trg_order_payments_no_delete BEFORE DELETE ON order_payments
      BEGIN SELECT RAISE(ABORT, 'FISCAL_RECORD_PROTECTED: payments are never deleted'); END;

      CREATE TRIGGER IF NOT EXISTS trg_order_items_archive_immutable BEFORE UPDATE ON order_items_archive
      BEGIN SELECT RAISE(ABORT, 'FISCAL_RECORD_PROTECTED: archived lines cannot be changed'); END;
      CREATE TRIGGER IF NOT EXISTS trg_order_items_archive_no_delete BEFORE DELETE ON order_items_archive
      BEGIN SELECT RAISE(ABORT, 'FISCAL_RECORD_PROTECTED: archived lines cannot be deleted'); END;
      CREATE TRIGGER IF NOT EXISTS trg_order_items_keep_removed BEFORE DELETE ON order_items
      BEGIN
        INSERT INTO order_items_archive (order_item_id, order_id, row_json) VALUES (OLD.id, OLD.order_id, json_object(
          'menu_item_id', OLD.menu_item_id, 'item_name', OLD.item_name, 'quantity', OLD.quantity,
          'unit_price', OLD.unit_price, 'total_price', OLD.total_price, 'notes', OLD.notes, 'worker_id', OLD.worker_id,
          'line_kind', OLD.line_kind, 'parent_order_item_id', OLD.parent_order_item_id, 'combo_slot_id', OLD.combo_slot_id,
          'combo_upcharge', OLD.combo_upcharge, 'allocated_revenue', OLD.allocated_revenue));
      END;
    `)

    const defaults: [string, string][] = [
      ['availability_enforce', 'warn'],
      ['sales_channels', JSON.stringify([{ id: 'yassir', label: 'Yassir', enabled: true }])],
      ['software_name', 'Fast Food Manager']
    ]
    const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)')
    for (const [key, value] of defaults) insertSetting.run(key, value)

    // Open the journal once: what it inherited, so a later reader knows where coverage starts.
    const opened = db.prepare('SELECT 1 FROM fiscal_journal LIMIT 1').get()
    if (!opened) {
      const history = db.prepare(
        `SELECT COUNT(*) AS orders, COALESCE(MAX(id), 0) AS last_id, MIN(order_date) AS first_date, MAX(order_date) AS last_date,
                COALESCE(SUM(CASE WHEN status <> 'cancelled' THEN total ELSE 0 END), 0) AS net_total
         FROM orders`
      ).get() as { orders: number; last_id: number; first_date: string | null; last_date: string | null; net_total: number }
      const now = new Date()
      setFiscalMeta(db, 'journal_start_order_id', String(history.last_id))
      setFiscalMeta(db, 'journal_started_at', now.toISOString())
      setFiscalMeta(db, 'pre_journal_orders', String(history.orders))
      appendJournal(db, {
        type: 'journal_open',
        at: now,
        payload: {
          schema: 25,
          software: 'Fast Food Manager',
          pre_journal: {
            orders: history.orders,
            last_order_id: history.last_id,
            last_fiscal_number: next,
            first_date: history.first_date,
            last_date: history.last_date,
            net_total: Math.round(history.net_total)
          }
        }
      })
    }
  }
}
