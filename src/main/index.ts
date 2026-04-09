import { app, BrowserWindow, shell, protocol, dialog, ipcMain, net } from 'electron'
import { join } from 'path'
import { writeFileSync, appendFileSync } from 'fs'
import { autoUpdater } from 'electron-updater'
import { initDatabase, closeDatabase } from './database/connection'
import { registerAllHandlers } from './ipc'
import { startBot, stopBot } from './telegram/bot'
import { settingsRepo } from './database/repositories/settings.repo'
import { startBackupSystem, stopBackupSystem } from './database/backup'
import { createSplashWindow, closeSplashWindow } from './splash'
import { getMachineId, validateActivation, verifyIntegrity } from './activation/activation'
import { registerInstallation, checkTrialStatus, checkCloudActivation } from './activation/cloud'
import { registerTabletHandlers } from './ipc/tablet.ipc'
import { startTabletServer } from './tablet/server'
import { startAnalyticsSync, stopAnalyticsSync } from './sync/analytics-sync'
import { ordersRepo } from './database/repositories/orders.repo'
import { syncAdminPassword } from './sync/owner-sync'
import { startCloudSync, stopCloudSync } from './sync/cloud-sync'
import { startRemoteOrderListener, stopRemoteOrderListener } from './sync/remote-order-listener'

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
    icon: join(__dirname, '../../resources/resources/icon.ico'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      devTools: !app.isPackaged
    }
  })

  // Block DevTools shortcuts in production
  if (app.isPackaged) {
    mainWindow.webContents.on('before-input-event', (event, input) => {
      if (input.key === 'F12') { event.preventDefault(); return }
      if (input.control && input.shift && (input.key === 'I' || input.key === 'i')) { event.preventDefault(); return }
      if (input.control && input.shift && (input.key === 'J' || input.key === 'j')) { event.preventDefault(); return }
      if (input.control && (input.key === 'U' || input.key === 'u')) { event.preventDefault(); return }
    })
  }

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
// Uses Electron's net.isOnline() for instant OS-level offline detection (no fetch timeout).
// Also checks Supabase every 30s for admin actions (pause/extend/terminate).
// Offline countdown: 10 seconds for testing — increase later for production.

const OFFLINE_LOCK_SECONDS = 2 * 60 // 2 minutes before locking when offline
const FAST_OFFLINE_CHECK_MS = 3000 // check net.isOnline() every 3 seconds
const CLOUD_CHECK_MS = 30 * 1000 // check Supabase every 30 seconds

let trialCheckInterval: ReturnType<typeof setInterval> | null = null
let fastOfflineInterval: ReturnType<typeof setInterval> | null = null
let offlineCountdownInterval: ReturnType<typeof setInterval> | null = null
let isInstallingUpdate = false
let offlineSecondsLeft = 0
let cumulativeOfflineSeconds = 0 // Total offline time this session (never resets)
const MAX_CUMULATIVE_OFFLINE = 5 * 60 // Lock after 5 min total offline time per session
let lastCloudSuccessTime = Date.now() // Track when we last verified with cloud
const CLOUD_STALE_SECONDS = 10 * 60 // If no cloud check for 10 min, lock

function clearOfflineCountdown(): void {
  if (offlineCountdownInterval) {
    clearInterval(offlineCountdownInterval)
    offlineCountdownInterval = null
  }
  if (offlineSecondsLeft > 0) {
    offlineSecondsLeft = 0
    mainWindow?.webContents.send('trial:offline-cleared')
  }
}

function startOfflineCountdown(): void {
  if (offlineCountdownInterval) return // already running
  offlineSecondsLeft = OFFLINE_LOCK_SECONDS
  log(`Trial: offline detected (net.isOnline=false), starting ${OFFLINE_LOCK_SECONDS}s countdown (cumulative: ${cumulativeOfflineSeconds}s)`)
  mainWindow?.webContents.send('trial:offline-countdown', offlineSecondsLeft)

  offlineCountdownInterval = setInterval(() => {
    // If we came back online mid-countdown, pause but don't reset cumulative
    if (net.isOnline()) {
      log('Trial: back online during countdown — pausing (cumulative offline preserved)')
      clearOfflineCountdown()
      return
    }
    offlineSecondsLeft -= 1
    cumulativeOfflineSeconds += 1
    mainWindow?.webContents.send('trial:offline-countdown', offlineSecondsLeft)

    // Lock if current countdown expired OR cumulative limit hit
    if (offlineSecondsLeft <= 0 || cumulativeOfflineSeconds >= MAX_CUMULATIVE_OFFLINE) {
      clearInterval(offlineCountdownInterval!)
      offlineCountdownInterval = null
      log(`Trial: offline lock triggered (countdown=${offlineSecondsLeft}, cumulative=${cumulativeOfflineSeconds}s)`)
      mainWindow?.webContents.send('trial:locked', 'offline')
    }
  }, 1000)
}

// Fast offline check using OS-level net.isOnline() — runs every 3 seconds
function checkOfflineInstant(): void {
  const activationType = settingsRepo.get('activation_type')
  if (activationType !== 'trial') return

  // Check if cloud verification is stale (no success for too long)
  const secondsSinceCloud = Math.floor((Date.now() - lastCloudSuccessTime) / 1000)
  if (secondsSinceCloud >= CLOUD_STALE_SECONDS) {
    log(`Trial: cloud verification stale (${secondsSinceCloud}s since last success) — locking`)
    mainWindow?.webContents.send('trial:locked', 'offline')
    return
  }

  if (!net.isOnline()) {
    startOfflineCountdown()
  } else if (offlineCountdownInterval) {
    // Back online — clear countdown
    log('Trial: online restored — clearing countdown')
    clearOfflineCountdown()
  }
}

// Cloud check — fetches Supabase for trial status (admin actions, expiry updates)
async function checkTrialCloud(): Promise<void> {
  const activationType = settingsRepo.get('activation_type')
  if (activationType !== 'trial') return

  // Skip cloud check if we're offline — the fast check handles that
  if (!net.isOnline()) return

  try {
    const machineId = getMachineId()
    const result = await checkTrialStatus(machineId)

    // Cloud check succeeded — reset cumulative offline counter and update timestamp
    clearOfflineCountdown()
    cumulativeOfflineSeconds = 0
    lastCloudSuccessTime = Date.now()

    if (result.status === 'active' && result.expiresAt) {
      settingsRepo.set('trial_expires_at', result.expiresAt)
      mainWindow?.webContents.send('trial:status-update', {
        status: 'active',
        expiresAt: result.expiresAt
      })
    } else if (result.status === 'expired' || result.status === 'paused') {
      // Before locking, check if admin granted a full license
      const cloudFull = await checkCloudActivation(machineId)
      if (cloudFull) {
        log('Trial expired but cloud activation found — upgrading to full license')
        settingsRepo.set('activation_type', 'full')
        settingsRepo.set('activation_status', 'activated')
        settingsRepo.set('activation_code', 'CLOUD-VERIFIED')
        clearOfflineCountdown()
        // Stop the trial watcher — no longer needed
        if (trialCheckInterval) { clearInterval(trialCheckInterval); trialCheckInterval = null }
        if (fastOfflineInterval) { clearInterval(fastOfflineInterval); fastOfflineInterval = null }
        mainWindow?.webContents.send('trial:status-update', { status: 'full' })
        // Reload the app to reflect the new state
        mainWindow?.webContents.reload()
        return
      }
      mainWindow?.webContents.send('trial:locked', result.status)
    }
  } catch {
    // Network error from fetch — the fast offline check handles countdown
  }
}

function setupTrialWatcher(): void {
  // Initial cloud check after 3s (window ready)
  setTimeout(() => { checkTrialCloud().catch(() => {}) }, 3000)

  // Fast offline detection every 3 seconds using net.isOnline()
  fastOfflineInterval = setInterval(checkOfflineInstant, FAST_OFFLINE_CHECK_MS)

  // Cloud check every 30 seconds for admin actions
  trialCheckInterval = setInterval(() => {
    checkTrialCloud().catch(() => {})
  }, CLOUD_CHECK_MS)
}

// ─── Auto-updater setup ───────────────────────────────────────────────────────
function setupAutoUpdater(): void {
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false // Must be false — setting to true causes a race condition
  autoUpdater.verifyUpdateCodeSignature = false // We don't code-sign, skip signature verification
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
    // Manual cleanup first — stop all background tasks
    if (trialCheckInterval) clearInterval(trialCheckInterval)
    if (fastOfflineInterval) clearInterval(fastOfflineInterval)
    if (offlineCountdownInterval) clearInterval(offlineCountdownInterval)
    stopBot()
    stopBackupSystem()
    closeDatabase()
    // Destroy all windows to release file locks on app.asar before the NSIS installer runs.
    BrowserWindow.getAllWindows().forEach((win) => {
      if (!win.isDestroyed()) win.destroy()
    })
    // Give child processes (GPU, renderer) time to fully terminate, then install.
    // 2 seconds is safer than 800ms — ensures all file handles are released.
    setTimeout(() => {
      autoUpdater.quitAndInstall(false, true)
      // If quitAndInstall doesn't exit the app within 3 seconds, force quit
      setTimeout(() => {
        app.exit(0)
      }, 3000)
    }, 2000)
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

app.whenReady().then(async () => {
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

    // Allow trial activation page to start the watcher mid-session (after factory reset)
    ipcMain.handle('trial:ensureWatcher', () => {
      const activationType = settingsRepo.get('activation_type')
      if (activationType === 'trial') {
        if (!trialCheckInterval) {
          log('Trial watcher started on demand (mid-session trial activation)')
          setupTrialWatcher()
        } else {
          // Watcher already running (from before reset) — trigger an immediate check
          log('Trial watcher already running — triggering immediate check')
          checkTrialCloud().catch(() => {})
        }
      }
    })

    // Renderer can trigger an immediate trial check (e.g. on browser offline/online events)
    ipcMain.handle('trial:checkNow', () => {
      const activationType = settingsRepo.get('activation_type')
      if (activationType === 'trial') {
        checkTrialCloud().catch(() => {})
      }
    })

    // Re-sync installation with latest restaurant name/version after setup completes
    ipcMain.handle('installation:sync', async () => {
      try {
        const machineId = getMachineId()
        const restaurantName = settingsRepo.get('restaurant_name') || undefined
        const phone = settingsRepo.get('restaurant_phone') || undefined
        await registerInstallation(machineId, restaurantName, phone, app.getVersion())
        log('Installation synced with cloud')
        return { ok: true }
      } catch (e) {
        log(`Installation sync failed: ${e}`, true)
        return { ok: false }
      }
    })

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

    // Verify full license on startup — re-validate serial code AND integrity checksum
    // Also check cloud activations table (admin-granted licenses don't have serial codes)
    if (activationType === 'full') {
      log('Full license detected — verifying integrity')
      const storedCode = settingsRepo.get('activation_code')

      // Cloud-verified licenses (admin-granted) skip serial/integrity check
      if (storedCode === 'CLOUD-VERIFIED') {
        log('Cloud-verified license — re-checking with Supabase')
        let stillValid = false
        try { stillValid = await checkCloudActivation(machineId) } catch { stillValid = true /* offline = trust local */ }
        if (!stillValid) {
          log('SECURITY: Cloud activation revoked — reverting to unactivated', true)
          settingsRepo.set('activation_type', '')
          settingsRepo.set('activation_status', '')
          settingsRepo.set('activation_code', '')
        }
      } else {
        // Serial-code activated — verify serial + integrity
        const { valid } = validateActivation(storedCode || '')
        const integrityOk = verifyIntegrity()
        if (!valid || !integrityOk) {
          // Local check failed — maybe admin granted license via cloud?
          log('Local verification failed, checking cloud activations...')
          let cloudActivated = false
          try { cloudActivated = await checkCloudActivation(machineId) } catch { /* offline */ }

          if (cloudActivated) {
            log('Cloud activation confirmed — admin-granted full license')
            settingsRepo.set('activation_status', 'activated')
            settingsRepo.set('activation_code', 'CLOUD-VERIFIED')
          } else {
            log(`SECURITY: License verification failed (serial=${valid}, integrity=${integrityOk}, cloud=false) — reverting`, true)
            settingsRepo.set('activation_type', '')
            settingsRepo.set('activation_status', '')
            settingsRepo.set('activation_code', '')
            settingsRepo.set('_integrity', '')
          }
        }
      }
    }

    // Verify activation_type wasn't tampered (only valid values allowed)
    const verifiedType = settingsRepo.get('activation_type')
    if (verifiedType && !['full', 'trial', ''].includes(verifiedType)) {
      log('SECURITY: Invalid activation_type detected — resetting', true)
      settingsRepo.set('activation_type', '')
      settingsRepo.set('activation_status', '')
      settingsRepo.set('_integrity', '')
    }

    // Auto-complete orders from previous days (in case client forgot)
    try {
      const completed = ordersRepo.autoCompletePreviousDays()
      if (completed > 0) log(`Auto-completed ${completed} orders from previous days`)
    } catch { /* ignore */ }

    // Start hidden analytics sync (daily stats to Supabase)
    startAnalyticsSync()

    // Start cloud sync for display settings and menu data
    startCloudSync()

    // Start Supabase Realtime listener for remote orders
    if (mainWindow) {
      startRemoteOrderListener(mainWindow)
    }

    // Sync admin password hash to cloud for owner dashboard authentication (fire-and-forget)
    syncAdminPassword().catch(() => {})

    // Auto-start tablet server if enabled and app is activated
    const tabletAutoStart = settingsRepo.get('tablet_server_auto_start')
    const isActivated = verifiedType === 'full' || verifiedType === 'trial'
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
  if (fastOfflineInterval) clearInterval(fastOfflineInterval)
  if (offlineCountdownInterval) clearInterval(offlineCountdownInterval)
  stopBot()
  stopBackupSystem()
  stopAnalyticsSync()
  stopCloudSync()
  stopRemoteOrderListener()
  closeDatabase()
  app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})
