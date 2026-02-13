import { ipcMain, dialog } from 'electron'
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { getDbPath, closeDatabase, initDatabase } from '../database/connection'
import { settingsRepo } from '../database/repositories/settings.repo'

function getTodayBackupName(): string {
  const today = new Date().toISOString().split('T')[0]
  return `fastfood-backup-${today}.db`
}

export function performAutoBackup(): void {
  try {
    const dbPath = getDbPath()
    const backupName = getTodayBackupName()
    const pathsStr = settingsRepo.get('backup_paths') || '[]'
    const paths: string[] = JSON.parse(pathsStr)

    for (const backupDir of paths) {
      try {
        if (!existsSync(backupDir)) {
          mkdirSync(backupDir, { recursive: true })
        }
        const destPath = join(backupDir, backupName)
        copyFileSync(dbPath, destPath)
      } catch {
        // Silent fail for auto-backup
      }
    }
  } catch {
    // Silent fail
  }
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

    try {
      const backupPath = result.filePaths[0]
      const dbPath = getDbPath()

      closeDatabase()
      copyFileSync(backupPath, dbPath)
      initDatabase()

      return { success: true }
    } catch (err: any) {
      initDatabase()
      return { success: false, error: err.message }
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
}
