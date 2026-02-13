import { app, BrowserWindow, shell, protocol, dialog, ipcMain } from 'electron'
import { join } from 'path'
import { writeFileSync } from 'fs'
import { autoUpdater } from 'electron-updater'
import { initDatabase, closeDatabase } from './database/connection'
import { registerAllHandlers } from './ipc'
import { startBot, stopBot } from './telegram/bot'
import { settingsRepo } from './database/repositories/settings.repo'

// Catch any uncaught errors and write to a log file
process.on('uncaughtException', (err) => {
  const logPath = join(app.getPath('userData'), 'crash.log')
  writeFileSync(logPath, `${new Date().toISOString()}\n${err.stack || err.message}\n`)
  dialog.showErrorBox('Fast Food Manager Error', err.message)
  app.exit(1)
})

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    autoHideMenuBar: true,
    title: 'Fast Food Manager',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
    mainWindow?.maximize()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// Register custom protocol for serving local images
function registerImageProtocol(): void {
  protocol.registerFileProtocol('app-image', (request, callback) => {
    const filePath = request.url.replace('app-image://', '')
    const decodedPath = decodeURIComponent(filePath)
    callback({ path: decodedPath })
  })
}

// Auto-updater setup
function setupAutoUpdater(): void {
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-available', (info) => {
    const notes = typeof info.releaseNotes === 'string' ? info.releaseNotes : ''
    const forced = notes.includes('[FORCE]') || info.releaseName?.includes('[FORCE]')

    if (forced) {
      // Forced: silently download, will auto-install on next app restart
      autoUpdater.downloadUpdate()
    } else {
      // Normal: notify renderer to show the update toast
      mainWindow?.webContents.send('updater:update-available', info.version)
    }
  })

  autoUpdater.on('download-progress', (progress) => {
    mainWindow?.webContents.send('updater:download-progress', Math.round(progress.percent))
  })

  autoUpdater.on('update-downloaded', () => {
    mainWindow?.webContents.send('updater:update-downloaded')
  })

  autoUpdater.on('update-not-available', () => {
    mainWindow?.webContents.send('updater:up-to-date')
  })

  autoUpdater.on('error', (err) => {
    mainWindow?.webContents.send('updater:error', err?.message || 'Update error')
  })

  ipcMain.handle('updater:download', () => {
    autoUpdater.downloadUpdate()
  })

  ipcMain.handle('updater:install', () => {
    autoUpdater.quitAndInstall(true, true)
  })

  ipcMain.handle('updater:check', async () => {
    try {
      const result = await autoUpdater.checkForUpdates()
      if (!result?.updateInfo) return { hasUpdate: false }
      const current = app.getVersion()
      const latest = result.updateInfo.version
      return { hasUpdate: latest !== current }
    } catch {
      return { hasUpdate: false }
    }
  })

  // Check for updates silently after 5 seconds
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(() => {
      // Silently fail — app-update.yml missing in dev or no internet
    })
  }, 5000)
}

app.whenReady().then(() => {
  registerImageProtocol()
  initDatabase()
  registerAllHandlers()
  createWindow()
  setupAutoUpdater()

  // Auto-start Telegram bot if configured
  const autoStart = settingsRepo.get('telegram_auto_start')
  const token = settingsRepo.get('telegram_bot_token')
  if (autoStart === 'true' && token) {
    startBot()
  }
})

app.on('window-all-closed', () => {
  stopBot()
  closeDatabase()
  app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})
