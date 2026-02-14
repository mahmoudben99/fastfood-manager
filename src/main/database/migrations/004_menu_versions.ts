import type Database from 'better-sqlite3'

export const migration004 = {
  version: 4,
  name: 'menu_versions',
  up: (db: Database.Database): void => {
    db.exec(`
      CREATE TABLE menu_versions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        label TEXT NOT NULL,
        data TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `)
  }
}
