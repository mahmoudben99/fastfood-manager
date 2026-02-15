import { copyFileSync, existsSync, mkdirSync, readdirSync, unlinkSync, statSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import { getDb, getDbPath } from './connection'

let backupInterval: NodeJS.Timeout | null = null
let lastBackupDate: string | null = null

export function getBackupDir(): string {
  const userDataPath = app.getPath('userData')
  const backupDir = join(userDataPath, 'backups')
  if (!existsSync(backupDir)) {
    mkdirSync(backupDir, { recursive: true })
  }
  return backupDir
}

export function getTodayBackupPath(): string {
  const today = new Date().toISOString().split('T')[0] // YYYY-MM-DD
  const backupDir = getBackupDir()
  return join(backupDir, `fastfood-manager-backup-${today}.db`)
}

export function createBackup(): void {
  try {
    const db = getDb()
    const dbPath = getDbPath()
    const backupPath = getTodayBackupPath()

    // Checkpoint WAL to ensure all data is in the main database file
    db.pragma('wal_checkpoint(FULL)')

    // Copy database file to backup
    copyFileSync(dbPath, backupPath)

    // Also backup WAL file if it exists (for extra safety)
    const walPath = `${dbPath}-wal`
    const walBackupPath = `${backupPath}-wal`
    if (existsSync(walPath)) {
      copyFileSync(walPath, walBackupPath)
    }

    console.log(`[Backup] Created backup: ${backupPath}`)
  } catch (error) {
    console.error('[Backup] Failed to create backup:', error)
  }
}

export function cleanOldBackups(daysToKeep = 7): void {
  try {
    const backupDir = getBackupDir()
    const files = readdirSync(backupDir)
    const now = Date.now()
    const maxAge = daysToKeep * 24 * 60 * 60 * 1000 // days in milliseconds

    files.forEach((file) => {
      if (file.startsWith('fastfood-manager-backup-') && file.endsWith('.db')) {
        const filePath = join(backupDir, file)
        const stats = statSync(filePath)
        const age = now - stats.mtimeMs

        if (age > maxAge) {
          unlinkSync(filePath)
          // Also delete WAL file if exists
          const walPath = `${filePath}-wal`
          if (existsSync(walPath)) {
            unlinkSync(walPath)
          }
          console.log(`[Backup] Deleted old backup: ${file}`)
        }
      }
    })
  } catch (error) {
    console.error('[Backup] Failed to clean old backups:', error)
  }
}

export function checkAndBackup(): void {
  const today = new Date().toISOString().split('T')[0]

  // Always create/update today's backup (continuous live backup)
  // This overwrites the backup file every minute with latest data
  createBackup()

  // If it's a new day, clean old backups
  if (lastBackupDate !== today) {
    cleanOldBackups(7)
    lastBackupDate = today
  }
}

export function startBackupSystem(): void {
  console.log('[Backup] Starting live backup system')

  // Create initial backup
  checkAndBackup()

  // Check every minute to create/update daily backup
  // This ensures minimal data loss if PC crashes
  backupInterval = setInterval(() => {
    checkAndBackup()
  }, 60 * 1000) // 1 minute

  console.log('[Backup] Live backup system started (updates every 1 minute)')
}

export function stopBackupSystem(): void {
  if (backupInterval) {
    clearInterval(backupInterval)
    backupInterval = null
    console.log('[Backup] Backup system stopped')
  }

  // Create final backup on shutdown
  createBackup()
}

// Trigger backup on important database operations
export function triggerBackupAfterChange(): void {
  // Debounce: backup after 30 seconds of last change
  // This prevents excessive backups on rapid operations
  if (backupInterval) {
    clearTimeout(backupInterval)
  }

  setTimeout(() => {
    checkAndBackup()
  }, 30000) // 30 seconds
}
