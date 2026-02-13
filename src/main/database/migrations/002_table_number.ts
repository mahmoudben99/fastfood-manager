import type Database from 'better-sqlite3'

export const migration002 = {
  version: 2,
  name: 'add_table_number',
  up: (db: Database.Database): void => {
    db.exec(`ALTER TABLE orders ADD COLUMN table_number TEXT`)
  }
}
