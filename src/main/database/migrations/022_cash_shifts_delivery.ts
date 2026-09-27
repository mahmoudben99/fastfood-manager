import type Database from 'better-sqlite3'
import { BUILTIN_PAYMENT_METHODS } from '../../../shared/cash'

/**
 * v4 cash: payments, shifts / cash drawer, delivery, manager approvals and invoices.
 *
 * Existing orders are left untouched: `payment_status` stays NULL, which every reader treats as
 * "paid in cash" (the only way a pre-v4 order could have been settled). Money columns in the new
 * tables are whole dinars (INTEGER); orders keep their historical REAL columns.
 */
export const migration022 = {
  version: 22,
  name: 'cash_shifts_delivery',
  up(db: Database.Database): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS shifts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        register_id TEXT NOT NULL DEFAULT 'main',
        status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'closed')),
        cashier_name TEXT NOT NULL,
        cashier_worker_id INTEGER REFERENCES workers(id) ON DELETE SET NULL,
        opening_float INTEGER NOT NULL DEFAULT 0 CHECK(opening_float >= 0),
        opened_at TEXT NOT NULL,
        business_date TEXT NOT NULL,
        open_note TEXT,
        closed_at TEXT,
        closed_by TEXT,
        counted_cash INTEGER,
        denominations TEXT,
        expected_cash INTEGER,
        over_short INTEGER,
        close_note TEXT,
        z_report TEXT
      );
      -- Only one open shift per register.
      CREATE UNIQUE INDEX IF NOT EXISTS idx_shifts_one_open ON shifts(register_id) WHERE status = 'open';
      CREATE INDEX IF NOT EXISTS idx_shifts_opened ON shifts(opened_at);

      CREATE TABLE IF NOT EXISTS cash_movements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        shift_id INTEGER NOT NULL REFERENCES shifts(id),
        kind TEXT NOT NULL CHECK(kind IN ('pay_in', 'pay_out')),
        amount INTEGER NOT NULL CHECK(amount > 0),
        reason TEXT NOT NULL,
        operator TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_cash_movements_shift ON cash_movements(shift_id);

      CREATE TABLE IF NOT EXISTS delivery_zones (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        fee INTEGER NOT NULL DEFAULT 0 CHECK(fee >= 0),
        min_order INTEGER CHECK(min_order IS NULL OR min_order >= 0),
        estimated_minutes INTEGER CHECK(estimated_minutes IS NULL OR estimated_minutes >= 0),
        is_active INTEGER NOT NULL DEFAULT 1,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS customer_addresses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        label TEXT,
        address TEXT NOT NULL,
        zone_id INTEGER REFERENCES delivery_zones(id) ON DELETE SET NULL,
        notes TEXT,
        is_default INTEGER NOT NULL DEFAULT 0,
        last_used_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_customer_addresses_customer ON customer_addresses(customer_id);

      CREATE TABLE IF NOT EXISTS driver_settlements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        driver_id INTEGER NOT NULL REFERENCES workers(id),
        shift_id INTEGER REFERENCES shifts(id),
        business_date TEXT NOT NULL,
        order_count INTEGER NOT NULL DEFAULT 0,
        expected_cash INTEGER NOT NULL DEFAULT 0,
        collected_cash INTEGER NOT NULL DEFAULT 0,
        difference INTEGER NOT NULL DEFAULT 0,
        note TEXT,
        operator TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_driver_settlements_shift ON driver_settlements(shift_id);

      CREATE TABLE IF NOT EXISTS order_deliveries (
        order_id INTEGER PRIMARY KEY REFERENCES orders(id),
        address TEXT NOT NULL DEFAULT '',
        address_id INTEGER REFERENCES customer_addresses(id) ON DELETE SET NULL,
        zone_id INTEGER REFERENCES delivery_zones(id) ON DELETE SET NULL,
        zone_name TEXT,
        estimated_minutes INTEGER,
        driver_id INTEGER REFERENCES workers(id) ON DELETE SET NULL,
        notes TEXT,
        status TEXT NOT NULL DEFAULT 'pending'
          CHECK(status IN ('pending', 'preparing', 'out_for_delivery', 'delivered', 'failed')),
        failure_reason TEXT,
        created_at TEXT NOT NULL,
        preparing_at TEXT,
        out_for_delivery_at TEXT,
        delivered_at TEXT,
        failed_at TEXT,
        settlement_id INTEGER REFERENCES driver_settlements(id),
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_order_deliveries_driver ON order_deliveries(driver_id, status);

      CREATE TABLE IF NOT EXISTS order_payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL REFERENCES orders(id),
        kind TEXT NOT NULL CHECK(kind IN ('payment', 'refund')),
        method TEXT NOT NULL,
        amount INTEGER NOT NULL,
        rounding INTEGER NOT NULL DEFAULT 0,
        tendered INTEGER,
        change_given INTEGER NOT NULL DEFAULT 0,
        reference TEXT,
        shift_id INTEGER REFERENCES shifts(id),
        driver_id INTEGER REFERENCES workers(id) ON DELETE SET NULL,
        auto INTEGER NOT NULL DEFAULT 0,
        operator TEXT,
        reason TEXT,
        created_at TEXT NOT NULL,
        CHECK((kind = 'payment' AND amount >= 0) OR (kind = 'refund' AND amount <= 0))
      );
      CREATE INDEX IF NOT EXISTS idx_order_payments_order ON order_payments(order_id);
      CREATE INDEX IF NOT EXISTS idx_order_payments_shift ON order_payments(shift_id, method);

      -- Z report "cancellations" (scope 'order') and "voids" (scope 'line': a line removed or
      -- reduced on an edit), with who / why / when and the shift. Append-only.
      CREATE TABLE IF NOT EXISTS order_voids (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        scope TEXT NOT NULL CHECK(scope IN ('order', 'line')),
        order_id INTEGER NOT NULL REFERENCES orders(id),
        order_item_id INTEGER,
        menu_item_id INTEGER,
        item_name TEXT,
        quantity INTEGER NOT NULL DEFAULT 0,
        unit_price REAL NOT NULL DEFAULT 0,
        amount REAL NOT NULL DEFAULT 0,
        shift_id INTEGER REFERENCES shifts(id),
        operator TEXT,
        reason TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_order_voids_shift ON order_voids(shift_id, scope);

      -- Manager approvals for guarded actions (who asked, who approved, why, when). Append-only.
      CREATE TABLE IF NOT EXISTS approvals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        action TEXT NOT NULL,
        order_id INTEGER,
        shift_id INTEGER,
        requested_by TEXT,
        approved_by TEXT NOT NULL,
        reason TEXT NOT NULL,
        detail TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_approvals_shift ON approvals(shift_id);

      CREATE TABLE IF NOT EXISTS invoices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        invoice_number TEXT NOT NULL UNIQUE,
        year INTEGER NOT NULL,
        seq INTEGER NOT NULL,
        order_id INTEGER NOT NULL UNIQUE REFERENCES orders(id),
        customer TEXT NOT NULL,
        total REAL NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE(year, seq)
      );
    `)

    for (const table of ['order_voids', 'approvals']) {
      db.exec(`
        CREATE TRIGGER IF NOT EXISTS trg_${table}_immutable BEFORE UPDATE ON ${table}
        BEGIN SELECT RAISE(ABORT, '${table} are immutable'); END;
        CREATE TRIGGER IF NOT EXISTS trg_${table}_no_delete BEFORE DELETE ON ${table}
        BEGIN SELECT RAISE(ABORT, '${table} are append-only'); END;
      `)
    }

    const orderColumns = new Set(
      (db.prepare('PRAGMA table_info(orders)').all() as { name: string }[]).map((column) => column.name)
    )
    const addOrderColumn = (name: string, ddl: string): void => {
      if (!orderColumns.has(name)) db.exec(`ALTER TABLE orders ADD COLUMN ${ddl}`)
    }
    // total = subtotal − discount_amount + delivery_fee (delivery_fee is 0 for every older order).
    addOrderColumn('delivery_fee', 'delivery_fee REAL NOT NULL DEFAULT 0')
    addOrderColumn('shift_id', 'shift_id INTEGER REFERENCES shifts(id)')
    // NULL = pre-v4 order (cash, fully paid); else unpaid | partial | paid | void.
    addOrderColumn('payment_status', 'payment_status TEXT')
    // Cashier / operator who rang the order up (Z report per-cashier discounts).
    addOrderColumn('cashier_name', 'cashier_name TEXT')
    db.exec('CREATE INDEX IF NOT EXISTS idx_orders_shift ON orders(shift_id)')

    const methods = JSON.stringify(BUILTIN_PAYMENT_METHODS.map((id) => ({ id, enabled: true })))
    const defaults: [string, string][] = [
      ['payment_methods', methods],
      ['cash_rounding', '0'],
      ['require_open_shift', 'false'],
      ['shift_blind_close', 'true'],
      ['telegram_shift_report', 'true'],
      ['tablet_order_payment', 'unpaid'],
      ['approval_enabled', 'false'],
      ['approval_actions', 'cancel_order,void_line,discount,pay_out,refund'],
      ['approval_discount_percent', '10']
    ]
    const insert = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)')
    for (const [key, value] of defaults) insert.run(key, value)
  }
}
