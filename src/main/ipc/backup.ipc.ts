import { ipcMain, dialog } from 'electron'
import Database from 'better-sqlite3'
import { copyFileSync, existsSync, mkdirSync, readdirSync, renameSync, statSync, unlinkSync } from 'fs'
import { dirname, join } from 'path'
import { getDb, getDbPath, closeDatabase, initDatabase } from '../database/connection'
import { settingsRepo } from '../database/repositories/settings.repo'
import { localDate } from '../database/repositories/orders.repo'
import {
  isPrintJobProcessorBusy,
  startPrintJobProcessor,
  stopPrintJobProcessor
} from './printer.ipc'

let scheduledBackupInterval: ReturnType<typeof setInterval> | null = null
let lastScheduledBackupDate: string | null = null

function getTodayBackupName(): string {
  // Local calendar day, like every other date in the app.
  return `fastfood-backup-${localDate()}.db`
}

/**
 * Flush the write-ahead log into the main database file.
 *
 * The database runs in WAL mode (connection.ts: `journal_mode = WAL`), so freshly committed
 * rows live in `fastfood.db-wal` until a checkpoint. Copying only `fastfood.db` therefore
 * produced a backup that was missing the most recent orders — exactly the ones a restaurant
 * would most want back. TRUNCATE checkpoints everything and empties the WAL, so the single
 * copied file is complete and self-contained.
 */
function checkpointWal(): { ok: boolean; error?: string } {
  try {
    const rows = getDb().pragma('wal_checkpoint(TRUNCATE)') as Array<{
      busy?: number
      log?: number
      checkpointed?: number
    }>
    const result = rows[0] || {}
    const busy = Number(result.busy || 0)
    const log = Number(result.log || 0)
    const checkpointed = Number(result.checkpointed || 0)
    if (busy !== 0 || checkpointed < log) {
      return { ok: false, error: `WAL checkpoint incomplete (${checkpointed}/${log}, busy=${busy})` }
    }
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

const REQUIRED_BACKUP_TABLES = [
  '_migrations', 'settings', 'orders', 'order_items', 'menu_items', 'stock_items'
]

/** Validate a copied candidate without ever opening or modifying the live database. */
function validateBackupFile(path: string): { ok: boolean; error?: string } {
  let candidate: Database.Database | null = null
  try {
    if (!existsSync(path) || statSync(path).size < 4096) {
      return { ok: false, error: 'The selected file is empty or too small to be a database backup.' }
    }
    candidate = new Database(path, { readonly: true, fileMustExist: true })
    const checks = candidate.pragma('quick_check') as Array<Record<string, unknown>>
    const bad = checks.find((row) => String(Object.values(row)[0]).toLowerCase() !== 'ok')
    if (bad) return { ok: false, error: `SQLite integrity check failed: ${Object.values(bad)[0]}` }

    const rows = candidate
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all() as { name: string }[]
    const names = new Set(rows.map((row) => row.name))
    const missing = REQUIRED_BACKUP_TABLES.filter((name) => !names.has(name))
    if (missing.length > 0) {
      return { ok: false, error: `Not a Fast Food Manager backup (missing: ${missing.join(', ')})` }
    }
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  } finally {
    try { candidate?.close() } catch { /* already closed */ }
  }
}

function removeDatabaseFiles(path: string): void {
  for (const suffix of ['', '-wal', '-shm']) {
    const file = path + suffix
    if (existsSync(file)) unlinkSync(file)
  }
}

let lastAutoBackupAt = 0
/**
 * Minimum gap between automatic whole-database copies.
 *
 * performAutoBackup() is invoked after EVERY order (orders.ipc, tablet/server, the remote-order
 * listener). Each invocation checkpoints the WAL and copies the entire .db file to every
 * configured destination — and because the file is named per-DAY, each copy simply overwrites the
 * previous one. On a 300-order day with a USB destination that is 300 full-database copies to
 * produce one file. Throttling costs at most this many seconds of protection while the separate
 * 1-minute in-app backup loop (database/backup.ts) still runs.
 */
const AUTO_BACKUP_MIN_INTERVAL_MS = 60 * 1000

/** Outcome of an auto-backup attempt, so callers can decide whether the day is really covered. */
export interface AutoBackupResult {
  /** true only when at least one configured destination received a complete copy. */
  ok: boolean
  succeeded: number
  failed: number
  /** true when the throttle (or an absent destination list) meant nothing was attempted. */
  skipped: boolean
}

/** @param force bypass the throttle (used before destructive operations and scheduled backups). */
export function performAutoBackup(force = false): AutoBackupResult {
  const result: AutoBackupResult = { ok: false, succeeded: 0, failed: 0, skipped: false }
  try {
    const dbPath = getDbPath()
    const backupName = getTodayBackupName()
    const pathsStr = settingsRepo.get('backup_paths') || '[]'
    const paths: string[] = JSON.parse(pathsStr)
    if (paths.length === 0) { result.skipped = true; return result }

    if (!force && Date.now() - lastAutoBackupAt < AUTO_BACKUP_MIN_INTERVAL_MS) {
      result.skipped = true
      return result
    }
    lastAutoBackupAt = Date.now()

    // Fold the WAL into the .db file first. Never label a lagging main-file copy successful.
    const checkpoint = checkpointWal()
    if (!checkpoint.ok) {
      result.failed = paths.length
      console.error('[Backup] Refusing incomplete copy:', checkpoint.error)
      return result
    }

    for (const backupDir of paths) {
      try {
        if (!existsSync(backupDir)) {
          mkdirSync(backupDir, { recursive: true })
        }
        const destPath = join(backupDir, backupName)
        copyFileSync(dbPath, destPath)
        result.succeeded++
      } catch (err) {
        // One destination failing (unplugged USB drive) must not hide the failure from the
        // scheduler, which used to mark the day complete regardless.
        result.failed++
        console.error(`[Backup] Destination failed: ${backupDir}`, err)
      }
    }
    result.ok = result.succeeded > 0
    return result
  } catch {
    // Silent fail
  }
  return result
}

export function registerBackupHandlers(): void {
  ipcMain.handle('backup:getPaths', () => {
    const paths = settingsRepo.get('backup_paths')
    return paths ? JSON.parse(paths) : []
  })

  ipcMain.handle('backup:addPath', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory']
    })
    if (result.canceled || !result.filePaths[0]) return null

    const newPath = result.filePaths[0]
    const pathsStr = settingsRepo.get('backup_paths') || '[]'
    const paths: string[] = JSON.parse(pathsStr)

    if (!paths.includes(newPath)) {
      paths.push(newPath)
      settingsRepo.set('backup_paths', JSON.stringify(paths))
    }

    return paths
  })

  ipcMain.handle('backup:removePath', (_, pathToRemove: string) => {
    const pathsStr = settingsRepo.get('backup_paths') || '[]'
    const paths: string[] = JSON.parse(pathsStr)
    const filtered = paths.filter((p) => p !== pathToRemove)
    settingsRepo.set('backup_paths', JSON.stringify(filtered))
    return filtered
  })

  ipcMain.handle('backup:createNow', () => {
    const dbPath = getDbPath()
    const backupName = getTodayBackupName()
    const pathsStr = settingsRepo.get('backup_paths') || '[]'
    const paths: string[] = JSON.parse(pathsStr)

    const results: { path: string; success: boolean; error?: string }[] = []

    // A busy checkpoint means the main .db does not contain every committed order. Do not copy
    // it and claim success; let the owner retry after the reader/transaction completes.
    const checkpoint = checkpointWal()
    if (!checkpoint.ok) {
      return paths.map((path) => ({
        path,
        success: false,
        error: checkpoint.error || 'Could not create a complete database snapshot'
      }))
    }

    for (const backupDir of paths) {
      try {
        if (!existsSync(backupDir)) {
          mkdirSync(backupDir, { recursive: true })
        }
        const destPath = join(backupDir, backupName)
        copyFileSync(dbPath, destPath)
        results.push({ path: backupDir, success: true })
      } catch (err: any) {
        results.push({ path: backupDir, success: false, error: err.message })
      }
    }

    return results
  })

  ipcMain.handle('backup:restore', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Database Backup', extensions: ['db'] }]
    })

    if (result.canceled || !result.filePaths[0]) return { success: false, error: 'Cancelled' }
    if (isPrintJobProcessorBusy()) {
      return {
        success: false,
        error: 'A receipt or kitchen ticket is printing. Wait for it to finish before restoring.'
      }
    }

    let tempPath: string | null = null
    let rollbackPath: string | null = null
    try {
      // Preserve current activation settings before restore
      const activationSettings = {
        activation_type: settingsRepo.get('activation_type') || '',
        activation_status: settingsRepo.get('activation_status') || '',
        activation_code: settingsRepo.get('activation_code') || '',
        machine_id: settingsRepo.get('machine_id') || '',
        trial_expires_at: settingsRepo.get('trial_expires_at') || '',
        trial_status: settingsRepo.get('trial_status') || '',
        _integrity: settingsRepo.get('_integrity') || ''
      }

      const backupPath = result.filePaths[0]
      const dbPath = getDbPath()
      const dir = dirname(dbPath)
      const stamp = new Date().toISOString().replace(/[:.]/g, '-')
      tempPath = join(dir, `restore-candidate-${stamp}.db`)
      rollbackPath = join(dir, `pre-restore-backup-${stamp}.db`)

      // Copy potentially unreliable USB/network input locally, then validate that immutable copy.
      copyFileSync(backupPath, tempPath)
      const candidate = validateBackupFile(tempPath)
      if (!candidate.ok) throw new Error(candidate.error || 'Invalid backup file')

      // better-sqlite3's backup API snapshots a live WAL database consistently without relying
      // on a checkpoint. This rollback copy is created before the live file is touched.
      await getDb().backup(rollbackPath)
      const rollback = validateBackupFile(rollbackPath)
      if (!rollback.ok) throw new Error(`Could not verify the safety backup: ${rollback.error}`)

      stopPrintJobProcessor()
      closeDatabase()
      try {
        removeDatabaseFiles(dbPath)
        renameSync(tempPath, dbPath)
        tempPath = null
        initDatabase()

        // Always overwrite these values, including empty ones, so a backup cannot inject an
        // activation into a currently unactivated machine.
        settingsRepo.setMultiple(activationSettings)
      } catch (restoreError) {
        // Put the verified pre-restore snapshot back and reopen it before reporting failure.
        try { closeDatabase() } catch { /* not open */ }
        removeDatabaseFiles(dbPath)
        copyFileSync(rollbackPath, dbPath)
        initDatabase()
        throw restoreError
      }

      return { success: true }
    } catch (err: any) {
      try { getDb() } catch {
        try { initDatabase() } catch { /* rollback error is returned below */ }
      }
      return { success: false, error: err.message }
    } finally {
      if (tempPath && existsSync(tempPath)) {
        try { unlinkSync(tempPath) } catch { /* best effort */ }
      }
      startPrintJobProcessor()
    }
  })

  ipcMain.handle('backup:listAvailable', () => {
    const pathsStr = settingsRepo.get('backup_paths') || '[]'
    const paths: string[] = JSON.parse(pathsStr)
    const backups: { name: string; path: string; date: string; size: number }[] = []

    for (const dir of paths) {
      try {
        if (!existsSync(dir)) continue
        const files = readdirSync(dir).filter((f) => f.startsWith('fastfood-backup-') && f.endsWith('.db'))
        for (const file of files) {
          const filePath = join(dir, file)
          const stat = statSync(filePath)
          backups.push({
            name: file,
            path: filePath,
            date: stat.mtime.toISOString(),
            size: stat.size
          })
        }
      } catch {
        // skip inaccessible dirs
      }
    }

    return backups.sort((a, b) => b.date.localeCompare(a.date))
  })

  // Scheduled backup settings
  ipcMain.handle('backup:getSchedule', () => {
    const enabledSetting = settingsRepo.get('backup_schedule_enabled')
    return {
      // Default to enabled if never explicitly set
      enabled: enabledSetting !== 'false',
      time: settingsRepo.get('backup_schedule_time') || '23:00'
    }
  })

  ipcMain.handle('backup:setSchedule', (_, config: { enabled: boolean; time: string }) => {
    settingsRepo.setMultiple({
      backup_schedule_enabled: config.enabled ? 'true' : 'false',
      backup_schedule_time: config.time
    })
    setupScheduledBackup()
    return true
  })

  // Start scheduled backup checker on registration
  setupScheduledBackup()
}

export function setupScheduledBackup(): void {
  if (scheduledBackupInterval) {
    clearInterval(scheduledBackupInterval)
    scheduledBackupInterval = null
  }

  const enabledSetting = settingsRepo.get('backup_schedule_enabled')
  // Default to enabled if never explicitly set
  if (enabledSetting === 'false') return

  // Check every minute if it's time for the scheduled backup
  scheduledBackupInterval = setInterval(() => {
    try {
      const schedSetting = settingsRepo.get('backup_schedule_enabled')
      if (schedSetting === 'false') return

      const schedTime = settingsRepo.get('backup_schedule_time') || '23:00'
      const now = new Date()
      const today = localDate(now) // local calendar day, like every other date in the app

      // Due if we've reached the scheduled minute today and haven't backed up yet today.
      // The old check required an EXACT `HH:MM` match, so a PC asleep (or an event loop busy)
      // at 23:00 skipped that day entirely and never caught up.
      const [schedH, schedM] = schedTime.split(':').map(Number)
      const dueAt = new Date(now)
      dueAt.setHours(schedH || 0, schedM || 0, 0, 0)
      const isDue = now >= dueAt && lastScheduledBackupDate !== today

      if (isDue) {
        // force: the daily backup must not be swallowed by the per-order throttle.
        const res = performAutoBackup(true)
        // Latch only on real success. The old code latched BEFORE copying, so an unplugged USB
        // drive at 23:00 marked the day complete and it was never retried.
        if (res.ok) {
          lastScheduledBackupDate = today
        } else if (!res.skipped) {
          console.error('[Backup] Scheduled backup failed on every destination — will retry next minute')
        }
      }
    } catch {
      // Silent fail
    }
  }, 60000) // Check every minute
}
