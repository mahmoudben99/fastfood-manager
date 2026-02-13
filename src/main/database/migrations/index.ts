import type Database from 'better-sqlite3'
import { migration001 } from './001_initial'
import { migration002 } from './002_table_number'

interface Migration {
  version: number
  name: string
  up: (db: Database.Database) => void
}

const migrations: Migration[] = [migration001, migration002]

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
