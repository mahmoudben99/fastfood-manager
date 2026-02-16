import { app, BrowserWindow, shell, protocol, dialog, ipcMain } from 'electron'
import { join } from 'path'
import { writeFileSync, appendFileSync } from 'fs'
import { autoUpdater } from 'electron-updater'
import { initDatabase, closeDatabase } from './database/connection'
import { registerAllHandlers } from './ipc'
import { startBot, stopBot } from './telegram/bot'
import { settingsRepo } from './database/repositories/settings.repo'
import { startBackupSystem, stopBackupSystem } from './database/backup'
import { createSplashWindow, closeSplashWindow } from './splash'

// Enhanced logging function
function log(message: string, isError = false): void {
  const timestamp = new Date().toISOString()
  const logMessage = `[${timestamp}] ${isError ? 'ERROR: ' : ''}${message}\n`
  try {
    const logPath = join(app.getPath('userData'), 'app.log')
    appendFileSync(logPath, logMessage)
    if (isError) console.error(logMessage)
    else console.log(logMessage)
  } catch (e) {
    console.error('Failed to write log:', e)
  }
}

// Catch any uncaught errors and write to a log file
process.on('uncaughtException', (err) => {
  try {
    const logPath = join(app.getPath('userData'), 'crash.log')
    const crashLog = `${new Date().toISOString()}\nUNCEPTED EXCEPTION:\n${err.stack || err.message}\n\n`
    writeFileSync(logPath, crashLog)
    log(`CRASH: ${err.message}`, true)
    dialog.showErrorBox('Fast Food Manager Error', `The app crashed:\n\n${err.message}\n\nCheck crash.log for details.`)
  } catch (logErr) {
    console.error('Failed to write crash log:', logErr)
  }
  app.exit(1)
})

process.on('unhandledRejection', (reason) => {
  log(`Unhandled Promise Rejection: ${reason}`, true)
})

log('=== Fast Food Manager Starting ===')

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
  try {
    log('App ready - starting initialization')

    log('Registering image protocol')
    registerImageProtocol()

    log('Initializing database')
    initDatabase()

    log('Starting backup system')
    startBackupSystem()

    log('Registering IPC handlers')
    registerAllHandlers()

    // Show splash screen first
    log('Creating splash window')
    const splashWin = createSplashWindow()

    // IPC handler for splash close
    ipcMain.handle('splash:close', () => {
      closeSplashWindow()
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.show()
        mainWindow.maximize()
      }
    })

    // Create main window (but don't show it yet)
    log('Creating main window')
    createWindow()

    log('Setting up auto-updater')
    setupAutoUpdater()

    // Close splash and show main window after 5 seconds (fallback)
    setTimeout(() => {
      closeSplashWindow()
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.show()
        mainWindow.maximize()
      }
    }, 5500)

    // Enable auto-startup with Windows (default ON, can be changed in settings)
    log('Configuring auto-launch')
    const autoLaunchSetting = settingsRepo.get('auto_launch')
    const shouldAutoLaunch = autoLaunchSetting !== 'false' // Default to true if not set
    app.setLoginItemSettings({
      openAtLogin: shouldAutoLaunch,
      openAsHidden: false,
      name: 'Fast Food Manager'
    })
    log(`Auto-launch set to: ${shouldAutoLaunch}`)

    // Auto-start Telegram bot if configured
    const autoStart = settingsRepo.get('telegram_auto_start')
    const token = settingsRepo.get('telegram_bot_token')
    if (autoStart === 'true' && token) {
      log('Starting Telegram bot')
      startBot()
    }

    log('Initialization complete')
  } catch (err) {
    const error = err as Error
    log(`Fatal error during initialization: ${error.message}`, true)
    dialog.showErrorBox('Initialization Error', `Failed to start the app:\n\n${error.message}\n\nStack: ${error.stack}`)
    app.exit(1)
  }
}).catch((err) => {
  log(`App ready failed: ${err.message}`, true)
  app.exit(1)
})

app.on('window-all-closed', () => {
  log('App closing - cleaning up')
  stopBot()
  stopBackupSystem()
  closeDatabase()
  app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})
