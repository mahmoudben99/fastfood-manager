import type Database from 'better-sqlite3'

export const migration010 = {
  version: 10,
  name: 'printer_config',
  up: (db: Database.Database): void => {
    // Add auto_print, paper_width, receipt_font_size, kitchen_font_size columns to printer_assignments
    // This allows per-printer configuration instead of global settings
    try {
      db.exec(`ALTER TABLE printer_assignments ADD COLUMN auto_print INTEGER NOT NULL DEFAULT 0`)
    } catch { /* column may already exist */ }
    try {
      db.exec(`ALTER TABLE printer_assignments ADD COLUMN paper_width TEXT NOT NULL DEFAULT '80'`)
    } catch { /* column may already exist */ }
    try {
      db.exec(`ALTER TABLE printer_assignments ADD COLUMN receipt_font_size TEXT NOT NULL DEFAULT 'medium'`)
    } catch { /* column may already exist */ }
    try {
      db.exec(`ALTER TABLE printer_assignments ADD COLUMN kitchen_font_size TEXT NOT NULL DEFAULT 'large'`)
    } catch { /* column may already exist */ }

    // Migrate existing global settings into per-assignment columns
    const paperWidth = db.prepare("SELECT value FROM settings WHERE key = 'printer_width'").get() as { value: string } | undefined
    const receiptFont = db.prepare("SELECT value FROM settings WHERE key = 'receipt_font_size'").get() as { value: string } | undefined
    const kitchenFont = db.prepare("SELECT value FROM settings WHERE key = 'kitchen_font_size'").get() as { value: string } | undefined
    const autoReceipt = db.prepare("SELECT value FROM settings WHERE key = 'auto_print_receipt'").get() as { value: string } | undefined
    const autoKitchen = db.prepare("SELECT value FROM settings WHERE key = 'auto_print_kitchen'").get() as { value: string } | undefined

    // Update all existing assignments with global values
    if (paperWidth?.value) {
      db.prepare('UPDATE printer_assignments SET paper_width = ?').run(paperWidth.value)
    }
    if (receiptFont?.value) {
      db.prepare("UPDATE printer_assignments SET receipt_font_size = ? WHERE assignment_type = 'receipt' OR assignment_type = 'default'").run(receiptFont.value)
    }
    if (kitchenFont?.value) {
      db.prepare("UPDATE printer_assignments SET kitchen_font_size = ? WHERE assignment_type IN ('kitchen_all', 'worker', 'default')").run(kitchenFont.value)
    }
    if (autoReceipt?.value === 'true') {
      db.prepare("UPDATE printer_assignments SET auto_print = 1 WHERE assignment_type = 'receipt'").run()
    }
    if (autoKitchen?.value === 'true') {
      db.prepare("UPDATE printer_assignments SET auto_print = 1 WHERE assignment_type IN ('kitchen_all', 'worker')").run()
    }
  }
}
