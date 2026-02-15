import type Database from 'better-sqlite3'

export const migration009 = {
  version: 9,
  name: 'printer_assignments',
  up: (db: Database.Database): void => {
    // Create printer_assignments table to map printers to workers/purposes
    db.exec(`
      CREATE TABLE IF NOT EXISTS printer_assignments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        printer_name TEXT NOT NULL,
        assignment_type TEXT NOT NULL, -- 'worker', 'receipt', 'kitchen_all', 'default'
        worker_id INTEGER, -- NULL if assignment_type is not 'worker'
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
        FOREIGN KEY (worker_id) REFERENCES workers(id) ON DELETE CASCADE
      )
    `)

    // Get current printer settings and create default assignments
    const receiptPrinter = db
      .prepare('SELECT value FROM settings WHERE key = ?')
      .get('printer_name') as { value: string } | undefined

    const kitchenPrinter = db
      .prepare('SELECT value FROM settings WHERE key = ?')
      .get('kitchen_printer_name') as { value: string } | undefined

    // Always create a fallback 'default' assignment for safety
    // This ensures printing works even if no specific assignments exist
    if (receiptPrinter?.value) {
      // Default printer for both receipt and kitchen if no specific assignment
      db.prepare(
        'INSERT INTO printer_assignments (printer_name, assignment_type) VALUES (?, ?)'
      ).run(receiptPrinter.value, 'default')

      // Also create specific receipt assignment
      db.prepare(
        'INSERT INTO printer_assignments (printer_name, assignment_type) VALUES (?, ?)'
      ).run(receiptPrinter.value, 'receipt')
    }

    // Create kitchen-all assignment if specified
    if (kitchenPrinter?.value) {
      db.prepare(
        'INSERT INTO printer_assignments (printer_name, assignment_type) VALUES (?, ?)'
      ).run(kitchenPrinter.value, 'kitchen_all')
    }
  }
}
