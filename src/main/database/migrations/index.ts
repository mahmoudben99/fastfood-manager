import type Database from 'better-sqlite3'
import { migration001 } from './001_initial'
import { migration002 } from './002_table_number'
import { migration003 } from './003_menu_emoji'
import { migration004 } from './004_menu_versions'
import { migration005 } from './005_restaurant_address'
import { migration006 } from './006_order_alert_time'
import { migration007 } from './007_receipt_appearance'
import { migration008 } from './008_workers_and_printers'
import { migration009 } from './009_printer_assignments'
import { migration010 } from './010_printer_config'
import { migration011 } from './011_promotions'
import { migration012 } from './012_receipt_editor'
import { migration013 } from './013_loyalty'
import { migration014 } from './014_customer_phone_identity'
import { migration015 } from './015_print_jobs'
import { migration016 } from './016_order_sources'
import { migration017 } from './017_order_effects'
import { migration018 } from './018_order_effects_hardening'

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
  migration008,
  migration009,
  migration010,
  migration011,
  migration012,
  migration013,
  migration014,
  migration015,
  migration016,
  migration017,
  migration018
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

  // Migration 015 deliberately preserved any historical duplicate display numbers and
  // installed an INSERT trigger. Create the stronger index whenever the data permits it,
  // but do not brick an otherwise recoverable installation that needs owner-reviewed repair.
  const historicalDailyDuplicates = db.prepare(
    `SELECT order_date, daily_number, COUNT(*) AS count
     FROM orders GROUP BY order_date, daily_number HAVING COUNT(*) > 1 LIMIT 1`
  ).get() as { order_date: string; daily_number: number; count: number } | undefined
  if (historicalDailyDuplicates) {
    console.error(
      `Cannot create idx_orders_daily_number_unique: ${historicalDailyDuplicates.count} orders share ` +
      `${historicalDailyDuplicates.order_date} #${historicalDailyDuplicates.daily_number}. ` +
      'The migration-015 trigger still blocks new duplicates; repair the historical rows and restart.'
    )
  } else {
    db.exec(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_daily_number_unique
       ON orders(order_date, daily_number)`
    )
  }
}
