import type Database from 'better-sqlite3'

/**
 * v4 catalog: modifier groups/options (Toast/Square style), combos (a menu item with slots),
 * and a manual "sold out" (86) flag.
 *
 * Order lines keep a SNAPSHOT of every chosen modifier in order_item_modifiers, so receipts,
 * reprints and reports never change when the catalog is edited later. Combo orders store a
 * parent line (line_kind = 'combo', the price the customer pays) plus one child line per chosen
 * item (line_kind = 'combo_child', unit_price 0, allocated_revenue = its share for reports).
 * Deductions caused by a modifier option carry order_item_modifier_id so an edit can reverse
 * exactly those. Every step is idempotent (re-running on a partially upgraded DB is harmless).
 */
export const migration021 = {
  version: 21,
  name: 'modifiers_combos_sold_out',
  up(db: Database.Database): void {
    const columns = (table: string): Set<string> =>
      new Set((db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name))
    const addColumn = (table: string, name: string, definition: string): void => {
      if (!columns(table).has(name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`)
    }

    db.exec(`
      CREATE TABLE IF NOT EXISTS modifier_groups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        name_ar TEXT,
        name_fr TEXT,
        min_select INTEGER NOT NULL DEFAULT 0,
        max_select INTEGER,
        is_required INTEGER NOT NULL DEFAULT 0,
        allow_quantity INTEGER NOT NULL DEFAULT 0,
        sort_order INTEGER NOT NULL DEFAULT 0,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS modifier_options (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        group_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        name_ar TEXT,
        name_fr TEXT,
        kind TEXT NOT NULL DEFAULT 'none' CHECK(kind IN ('none', 'extra', 'light', 'no')),
        price_delta REAL NOT NULL DEFAULT 0,
        is_default INTEGER NOT NULL DEFAULT 0,
        sort_order INTEGER NOT NULL DEFAULT 0,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (group_id) REFERENCES modifier_groups(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_modifier_options_group ON modifier_options(group_id);

      -- Same units/conversion as menu_item_ingredients (see services/stock-units.ts).
      CREATE TABLE IF NOT EXISTS modifier_option_ingredients (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        option_id INTEGER NOT NULL,
        stock_item_id INTEGER NOT NULL,
        quantity REAL NOT NULL,
        unit TEXT NOT NULL,
        FOREIGN KEY (option_id) REFERENCES modifier_options(id) ON DELETE CASCADE,
        FOREIGN KEY (stock_item_id) REFERENCES stock_items(id),
        UNIQUE(option_id, stock_item_id)
      );

      -- Item-level rows override category-level rows for the same group (sort order, or
      -- is_excluded = 1 to hide a category group from this one item).
      CREATE TABLE IF NOT EXISTS menu_item_modifier_groups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        menu_item_id INTEGER NOT NULL,
        group_id INTEGER NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        is_excluded INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (menu_item_id) REFERENCES menu_items(id) ON DELETE CASCADE,
        FOREIGN KEY (group_id) REFERENCES modifier_groups(id) ON DELETE CASCADE,
        UNIQUE(menu_item_id, group_id)
      );

      CREATE TABLE IF NOT EXISTS category_modifier_groups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category_id INTEGER NOT NULL,
        group_id INTEGER NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE,
        FOREIGN KEY (group_id) REFERENCES modifier_groups(id) ON DELETE CASCADE,
        UNIQUE(category_id, group_id)
      );

      CREATE TABLE IF NOT EXISTS combo_slots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        combo_item_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        name_ar TEXT,
        name_fr TEXT,
        min_select INTEGER NOT NULL DEFAULT 1,
        max_select INTEGER NOT NULL DEFAULT 1,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (combo_item_id) REFERENCES menu_items(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_combo_slots_item ON combo_slots(combo_item_id);

      -- A choice is one menu item OR a whole category (every active item in it).
      CREATE TABLE IF NOT EXISTS combo_slot_choices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        slot_id INTEGER NOT NULL,
        menu_item_id INTEGER,
        category_id INTEGER,
        upcharge REAL NOT NULL DEFAULT 0,
        is_default INTEGER NOT NULL DEFAULT 0,
        sort_order INTEGER NOT NULL DEFAULT 0,
        CHECK ((menu_item_id IS NULL) <> (category_id IS NULL)),
        FOREIGN KEY (slot_id) REFERENCES combo_slots(id) ON DELETE CASCADE,
        FOREIGN KEY (menu_item_id) REFERENCES menu_items(id) ON DELETE CASCADE,
        FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_combo_slot_choices_slot ON combo_slot_choices(slot_id);

      -- Sale-time snapshot of each chosen modifier (option/group ids are informational only).
      CREATE TABLE IF NOT EXISTS order_item_modifiers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_item_id INTEGER NOT NULL,
        option_id INTEGER,
        group_id INTEGER,
        group_name TEXT,
        name TEXT NOT NULL,
        name_ar TEXT,
        name_fr TEXT,
        kind TEXT NOT NULL DEFAULT 'none',
        price_delta REAL NOT NULL DEFAULT 0,
        quantity INTEGER NOT NULL DEFAULT 1,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (order_item_id) REFERENCES order_items(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_order_item_modifiers_item ON order_item_modifiers(order_item_id);
    `)

    addColumn('menu_items', 'is_combo', 'INTEGER NOT NULL DEFAULT 0')
    addColumn('menu_items', 'is_sold_out', 'INTEGER NOT NULL DEFAULT 0')

    // Combo children point at their parent line; no FK on purpose so a line removal can restore
    // each child's stock explicitly (a cascade would drop the deduction rows first).
    addColumn('order_items', 'parent_order_item_id', 'INTEGER')
    addColumn('order_items', 'line_kind', "TEXT NOT NULL DEFAULT 'item'")
    addColumn('order_items', 'combo_slot_id', 'INTEGER')
    addColumn('order_items', 'combo_upcharge', 'REAL NOT NULL DEFAULT 0')
    addColumn('order_items', 'allocated_revenue', 'REAL')
    db.exec('CREATE INDEX IF NOT EXISTS idx_order_items_parent ON order_items(parent_order_item_id)')

    // NULL = recipe deduction (historical rows); set = caused by that order_item_modifiers row.
    addColumn('order_item_deductions', 'order_item_modifier_id', 'INTEGER')
  }
}
