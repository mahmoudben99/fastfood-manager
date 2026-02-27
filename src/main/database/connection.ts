import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, unlinkSync } from 'fs'
import { runMigrations } from './migrations'

let db: Database.Database | null = null

export function getDbPath(): string {
  const userDataPath = app.getPath('userData')
  const dbDir = join(userDataPath, 'data')
  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true })
  }
  return join(dbDir, 'fastfood-manager.db')
}

export function getImagesPath(): string {
  const userDataPath = app.getPath('userData')
  const imagesDir = join(userDataPath, 'images')
  if (!existsSync(imagesDir)) {
    mkdirSync(imagesDir, { recursive: true })
  }
  return imagesDir
}

export function getMenuImagesPath(): string {
  const imagesDir = getImagesPath()
  const menuDir = join(imagesDir, 'menu')
  if (!existsSync(menuDir)) {
    mkdirSync(menuDir, { recursive: true })
  }
  return menuDir
}

export function getLogoPath(): string {
  const imagesDir = getImagesPath()
  const logoDir = join(imagesDir, 'logo')
  if (!existsSync(logoDir)) {
    mkdirSync(logoDir, { recursive: true })
  }
  return logoDir
}

export function initDatabase(): void {
  const dbPath = getDbPath()
  db = new Database(dbPath)

  // Enable WAL mode for better performance
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.pragma('busy_timeout = 5000')

  runMigrations(db)
}

export function getDb(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.')
  }
  return db
}

export function closeDatabase(): void {
  if (db) {
    db.close()
    db = null
  }
}

/** Factory reset: close DB, delete file + WAL, reinitialize fresh. */
export function resetAllData(): void {
  const dbPath = getDbPath()
  closeDatabase()
  // Delete main file and WAL journal files
  for (const suffix of ['', '-wal', '-shm']) {
    const f = dbPath + suffix
    if (existsSync(f)) unlinkSync(f)
  }
  initDatabase()
}
