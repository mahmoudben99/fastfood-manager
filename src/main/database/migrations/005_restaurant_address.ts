import type Database from 'better-sqlite3'

export const migration005 = {
  version: 5,
  name: 'restaurant_address',
  up: (db: Database.Database): void => {
    // Add restaurant_address setting if it doesn't exist
    const existing = db
      .prepare('SELECT value FROM settings WHERE key = ?')
      .get('restaurant_address') as { value: string } | undefined

    if (!existing) {
      db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('restaurant_address', '')
    }
  }
}
