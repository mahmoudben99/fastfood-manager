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
import { getMachineId } from './activation/activation'
import { registerInstallation, checkTrialStatus } from './activation/cloud'
import { registerTabletHandlers } from './ipc/tablet.ipc'
import { startTabletServer } from './tablet/server'

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

  // Don't show immediately - wait for splash to close
  mainWindow.on('ready-to-show', () => {
    // Window is ready but don't show it yet
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

// ─── Trial watcher ────────────────────────────────────────────────────────────
// Checks Supabase for trial status on startup and every 15 minutes.
// If offline, starts a 5-minute countdown then locks the app.

let trialCheckInterval: ReturnType<typeof setInterval> | null = null
let offlineCountdownInterval: ReturnType<typeof setInterval> | null = null
let isInstallingUpdate = false
let offlineSecondsLeft = 0

function clearOfflineCountdown(): void {
  if (offlineCountdownInterval) {
    clearInterval(offlineCountdownInterval)
    offlineCountdownInterval = null
  }
  offlineSecondsLeft = 0
  mainWindow?.webContents.send('trial:offline-cleared')
}

async function checkTrialOnline(): Promise<void> {
  const activationType = settingsRepo.get('activation_type')
  if (activationType !== 'trial') return // full license or not set — skip

  try {
    const machineId = getMachineId()
    const result = await checkTrialStatus(machineId)

    // Clear any offline countdown since we got a response
    clearOfflineCountdown()

    if (result.status === 'active' && result.expiresAt) {
      // Update local cache with latest expiry
      settingsRepo.set('trial_expires_at', result.expiresAt)
      mainWindow?.webContents.send('trial:status-update', {
        status: 'active',
        expiresAt: result.expiresAt
      })
    } else if (result.status === 'expired' || result.status === 'paused') {
      mainWindow?.webContents.send('trial:locked', result.status)
    }
    // 'not_found' is treated as ok — might be a fresh install that hasn't synced yet
  } catch {
    // Network error — start or continue offline countdown
    if (!offlineCountdownInterval) {
      offlineSecondsLeft = 5 * 60 // 5 minutes
      log('Trial: offline, starting 5-minute countdown')
      mainWindow?.webContents.send('trial:offline-countdown', offlineSecondsLeft)

      offlineCountdownInterval = setInterval(() => {
        offlineSecondsLeft -= 1
        mainWindow?.webContents.send('trial:offline-countdown', offlineSecondsLeft)

        if (offlineSecondsLeft <= 0) {
          clearInterval(offlineCountdownInterval!)
          offlineCountdownInterval = null
          log('Trial: offline for 5 minutes — locking app')
          mainWindow?.webContents.send('trial:locked', 'offline')
        }
      }, 1000)
    }
    // If countdown already running, just let it continue
  }
}

function setupTrialWatcher(): void {
  // Initial check right after app loads (wait 3s for window to be ready)
  setTimeout(() => { checkTrialOnline().catch(() => {}) }, 3000)

  // Recheck every 2 minutes so admin pause/terminate takes effect quickly
  trialCheckInterval = setInterval(() => {
    checkTrialOnline().catch(() => {})
  }, 2 * 60 * 1000)
}

// ─── Auto-updater setup ───────────────────────────────────────────────────────
function setupAutoUpdater(): void {
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false // Must be false — setting to true causes a race condition
  // with the explicit quitAndInstall() call, resulting in two NSIS instances conflicting
  // and the app not relaunching after update (the update loop bug)

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
    // Set flag so window-all-closed doesn't call app.quit() and kill us before quitAndInstall runs.
    isInstallingUpdate = true
    // Destroy all windows to release file locks on app.asar before the NSIS installer runs.
    BrowserWindow.getAllWindows().forEach((win) => {
      if (!win.isDestroyed()) win.destroy()
    })
    // Manual cleanup (window-all-closed is skipped when isInstallingUpdate = true).
    if (trialCheckInterval) clearInterval(trialCheckInterval)
    if (offlineCountdownInterval) clearInterval(offlineCountdownInterval)
    stopBot()
    stopBackupSystem()
    closeDatabase()
    // Give child processes (GPU, renderer) 800ms to fully terminate, then install.
    setTimeout(() => {
      autoUpdater.quitAndInstall(true, true)
    }, 800)
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
    registerTabletHandlers(() => mainWindow)

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

    // Register this installation in the cloud and start trial watcher if needed
    const machineId = getMachineId()
    const restaurantName = settingsRepo.get('restaurant_name') || undefined
    const phone = settingsRepo.get('restaurant_phone') || undefined
    registerInstallation(machineId, restaurantName, phone, app.getVersion()).catch(() => {})

    const activationType = settingsRepo.get('activation_type')
    if (activationType === 'trial') {
      log('Trial mode detected — starting trial watcher')
      setupTrialWatcher()
    }

    // Auto-start tablet server if enabled and app is activated
    const tabletAutoStart = settingsRepo.get('tablet_server_auto_start')
    const isActivated = activationType === 'full' || activationType === 'trial'
    if (tabletAutoStart !== '0' && isActivated && mainWindow) {
      log('Auto-starting tablet server')
      startTabletServer(mainWindow).catch((e) => log(`Tablet server auto-start failed: ${e}`, true))
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
  // Skip if quitAndInstall is about to run — it handles process exit itself.
  if (isInstallingUpdate) return
  log('App closing - cleaning up')
  if (trialCheckInterval) clearInterval(trialCheckInterval)
  if (offlineCountdownInterval) clearInterval(offlineCountdownInterval)
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
