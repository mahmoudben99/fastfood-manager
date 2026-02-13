import type Database from 'better-sqlite3'

export const migration001 = {
  version: 1,
  name: 'initial_schema',
  up: (db: Database.Database): void => {
    // Settings table (key-value store)
    db.exec(`
      CREATE TABLE settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `)

    // Initialize default settings
    db.exec(`
      INSERT INTO settings (key, value) VALUES
        ('setup_complete', 'false'),
        ('language', 'en'),
        ('currency', 'USD'),
        ('currency_symbol', '$'),
        ('restaurant_name', ''),
        ('restaurant_phone', ''),
        ('restaurant_phone2', ''),
        ('logo_path', ''),
        ('admin_password_hash', ''),
        ('backup_paths', '[]'),
        ('printer_name', ''),
        ('printer_width', '80')
    `)

    // Work schedule
    db.exec(`
      CREATE TABLE work_schedule (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        day_of_week INTEGER NOT NULL UNIQUE,
        status TEXT NOT NULL DEFAULT 'closed',
        open_time TEXT,
        close_time TEXT,
        half_end TEXT
      )
    `)

    // Initialize 7 days (0=Sunday to 6=Saturday)
    for (let i = 0; i < 7; i++) {
      db.prepare(
        'INSERT INTO work_schedule (day_of_week, status, open_time, close_time) VALUES (?, ?, ?, ?)'
      ).run(i, i === 5 ? 'closed' : 'full', '08:00', '23:00')
    }

    // Food categories
    db.exec(`
      CREATE TABLE categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        name_ar TEXT,
        name_fr TEXT,
        sort_order INTEGER NOT NULL DEFAULT 0,
        icon TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `)

    // Menu items
    db.exec(`
      CREATE TABLE menu_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        name_ar TEXT,
        name_fr TEXT,
        price REAL NOT NULL,
        category_id INTEGER NOT NULL,
        image_path TEXT,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (category_id) REFERENCES categories(id)
      )
    `)

    // Stock items
    db.exec(`
      CREATE TABLE stock_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        name_ar TEXT,
        name_fr TEXT,
        unit_type TEXT NOT NULL,
        quantity REAL NOT NULL DEFAULT 0,
        price_per_unit REAL NOT NULL DEFAULT 0,
        alert_threshold REAL NOT NULL DEFAULT 0,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `)

    // Menu item ingredients (links menu items to stock items)
    db.exec(`
      CREATE TABLE menu_item_ingredients (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        menu_item_id INTEGER NOT NULL,
        stock_item_id INTEGER NOT NULL,
        quantity REAL NOT NULL,
        unit TEXT NOT NULL,
        FOREIGN KEY (menu_item_id) REFERENCES menu_items(id) ON DELETE CASCADE,
        FOREIGN KEY (stock_item_id) REFERENCES stock_items(id),
        UNIQUE(menu_item_id, stock_item_id)
      )
    `)

    // Stock adjustments log
    db.exec(`
      CREATE TABLE stock_adjustments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        stock_item_id INTEGER NOT NULL,
        adjustment_type TEXT NOT NULL,
        quantity_change REAL NOT NULL,
        previous_qty REAL NOT NULL,
        new_qty REAL NOT NULL,
        affects_cost INTEGER NOT NULL DEFAULT 0,
        reason TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (stock_item_id) REFERENCES stock_items(id)
      )
    `)

    // Stock purchases
    db.exec(`
      CREATE TABLE stock_purchases (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        stock_item_id INTEGER NOT NULL,
        quantity REAL NOT NULL,
        price_per_unit REAL NOT NULL,
        total_cost REAL NOT NULL,
        purchased_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (stock_item_id) REFERENCES stock_items(id)
      )
    `)

    // Workers
    db.exec(`
      CREATE TABLE workers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        role TEXT NOT NULL,
        pay_full_day REAL NOT NULL,
        pay_half_day REAL NOT NULL,
        phone TEXT,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `)

    // Worker-category assignments
    db.exec(`
      CREATE TABLE worker_categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        worker_id INTEGER NOT NULL,
        category_id INTEGER NOT NULL,
        FOREIGN KEY (worker_id) REFERENCES workers(id) ON DELETE CASCADE,
        FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE,
        UNIQUE(worker_id, category_id)
      )
    `)

    // Worker attendance
    db.exec(`
      CREATE TABLE worker_attendance (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        worker_id INTEGER NOT NULL,
        date TEXT NOT NULL,
        shift_type TEXT NOT NULL,
        pay_amount REAL NOT NULL,
        notes TEXT,
        FOREIGN KEY (worker_id) REFERENCES workers(id),
        UNIQUE(worker_id, date)
      )
    `)

    // Orders
    db.exec(`
      CREATE TABLE orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        daily_number INTEGER NOT NULL,
        order_date TEXT NOT NULL,
        order_type TEXT NOT NULL,
        customer_phone TEXT,
        customer_name TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        subtotal REAL NOT NULL,
        total REAL NOT NULL,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        completed_at TEXT
      )
    `)

    // Order items
    db.exec(`
      CREATE TABLE order_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL,
        menu_item_id INTEGER NOT NULL,
        quantity INTEGER NOT NULL DEFAULT 1,
        unit_price REAL NOT NULL,
        total_price REAL NOT NULL,
        notes TEXT,
        worker_id INTEGER,
        FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
        FOREIGN KEY (menu_item_id) REFERENCES menu_items(id),
        FOREIGN KEY (worker_id) REFERENCES workers(id)
      )
    `)

    // Order item deductions (audit trail)
    db.exec(`
      CREATE TABLE order_item_deductions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_item_id INTEGER NOT NULL,
        stock_item_id INTEGER NOT NULL,
        quantity_deducted REAL NOT NULL,
        cost_per_unit REAL NOT NULL DEFAULT 0,
        FOREIGN KEY (order_item_id) REFERENCES order_items(id) ON DELETE CASCADE,
        FOREIGN KEY (stock_item_id) REFERENCES stock_items(id)
      )
    `)

    // Daily order counters
    db.exec(`
      CREATE TABLE daily_counters (
        date TEXT PRIMARY KEY,
        last_order_num INTEGER NOT NULL DEFAULT 0
      )
    `)

    // Indexes
    db.exec(`
      CREATE INDEX idx_orders_date ON orders(order_date);
      CREATE INDEX idx_orders_status ON orders(status);
      CREATE INDEX idx_order_items_order ON order_items(order_id);
      CREATE INDEX idx_order_items_worker ON order_items(worker_id);
      CREATE INDEX idx_menu_items_category ON menu_items(category_id);
      CREATE INDEX idx_stock_adjustments_item ON stock_adjustments(stock_item_id);
      CREATE INDEX idx_worker_attendance_date ON worker_attendance(date);
      CREATE INDEX idx_worker_attendance_worker ON worker_attendance(worker_id);
    `)
  }
}
