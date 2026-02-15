import type Database from 'better-sqlite3'

export const migration006 = {
  version: 6,
  name: 'order_alert_time',
  up: (db: Database.Database): void => {
    // Add order_alert_minutes setting (default 20 minutes)
    const existing = db
      .prepare('SELECT value FROM settings WHERE key = ?')
      .get('order_alert_minutes') as { value: string } | undefined

    if (!existing) {
      db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('order_alert_minutes', '20')
    }
  }
}
