import type Database from 'better-sqlite3'
import { migration001 } from './001_initial'
import { migration002 } from './002_table_number'
import { migration003 } from './003_menu_emoji'
import { migration004 } from './004_menu_versions'
import { migration005 } from './005_restaurant_address'
import { migration006 } from './006_order_alert_time'
import { migration007 } from './007_receipt_appearance'
import { migration008 } from './008_workers_and_printers'

interface Migration {
  version: number
  name: string
  up: (db: Database.Database) => void
}

const migrations: Migration[] = [
  migration001,
  migration002,
  migration003,
  migration004,
  migration005,
  migration006,
  migration007,
  migration008
]

export function runMigrations(db: Database.Database): void {
  // Create migrations tracking table
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

  const applied = db
    .prepare('SELECT version FROM _migrations')
    .all()
    .map((row: any) => row.version)

  for (const migration of migrations) {
    if (!applied.includes(migration.version)) {
      console.log(`Running migration ${migration.version}: ${migration.name}`)
      db.transaction(() => {
        migration.up(db)
        db.prepare('INSERT INTO _migrations (version, name) VALUES (?, ?)').run(
          migration.version,
          migration.name
        )
      })()
      console.log(`Migration ${migration.version} applied successfully`)
    }
  }
}
