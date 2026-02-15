import type Database from 'better-sqlite3'

export const migration008 = {
  version: 8,
  name: 'workers_and_printers',
  up: (db: Database.Database): void => {
    // Add printer_name to existing workers table if it doesn't exist
    const workerColumns = db.prepare("PRAGMA table_info(workers)").all() as any[]
    const hasPrinterName = workerColumns.some((col: any) => col.name === 'printer_name')

    if (!hasPrinterName) {
      db.exec(`ALTER TABLE workers ADD COLUMN printer_name TEXT`)
    }

    // Add kitchen printer name setting (separate from receipt printer)
    const kitchenPrinterExists = db
      .prepare('SELECT value FROM settings WHERE key = ?')
      .get('kitchen_printer_name') as { value: string } | undefined

    if (!kitchenPrinterExists) {
      // Copy from main printer_name if it exists
      const mainPrinter = db
        .prepare('SELECT value FROM settings WHERE key = ?')
        .get('printer_name') as { value: string } | undefined

      db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run(
        'kitchen_printer_name',
        mainPrinter?.value || ''
      )
    }

    // Add split_kitchen_tickets setting (enabled by default)
    const splitTicketsExists = db
      .prepare('SELECT value FROM settings WHERE key = ?')
      .get('split_kitchen_tickets') as { value: string } | undefined

    if (!splitTicketsExists) {
      db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('split_kitchen_tickets', 'true')
    }
  }
}
