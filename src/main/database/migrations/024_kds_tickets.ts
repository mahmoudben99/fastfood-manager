import type Database from 'better-sqlite3'

/**
 * Kitchen Display System tickets: one ticket per (order, station). station_id is a workers.id,
 * or 0 for the expo/unassigned lines (same split as the kitchen-ticket routing).
 *
 * kds_ticket_items snapshots the order lines a station must cook. A line removed by an order
 * edit stays as a REMOVED row (order_item_id is deliberately not a foreign key) so the cook sees
 * it struck through instead of silently vanishing.
 */
export const migration024 = {
  version: 24,
  name: 'kds_tickets',
  up(db: Database.Database): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS kds_tickets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        station_id INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'new'
          CHECK(status IN ('new', 'in_progress', 'ready', 'bumped', 'cancelled')),
        created_at TEXT NOT NULL,
        started_at TEXT,
        ready_at TEXT,
        bumped_at TEXT,
        cancelled_at TEXT,
        recalled_at TEXT,
        closed_by TEXT CHECK(closed_by IN ('kds', 'pos')),
        change_kind TEXT CHECK(change_kind IN ('updated', 'cancelled', 'restored')),
        changed_at TEXT,
        header_sig TEXT,
        updated_at TEXT NOT NULL,
        UNIQUE(order_id, station_id)
      );
      CREATE INDEX IF NOT EXISTS idx_kds_tickets_status ON kds_tickets(status, station_id, created_at);

      CREATE TABLE IF NOT EXISTS kds_ticket_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ticket_id INTEGER NOT NULL REFERENCES kds_tickets(id) ON DELETE CASCADE,
        order_item_id INTEGER NOT NULL,
        menu_item_id INTEGER,
        parent_order_item_id INTEGER,
        combo_name TEXT,
        name TEXT NOT NULL,
        name_ar TEXT,
        name_fr TEXT,
        quantity INTEGER NOT NULL,
        previous_quantity INTEGER,
        notes TEXT,
        modifiers TEXT,
        change_kind TEXT CHECK(change_kind IN ('added', 'removed', 'changed')),
        changed_at TEXT,
        done_at TEXT,
        created_at TEXT NOT NULL,
        UNIQUE(ticket_id, order_item_id)
      );
      CREATE INDEX IF NOT EXISTS idx_kds_ticket_items_ticket ON kds_ticket_items(ticket_id, id);
    `)
  }
}
