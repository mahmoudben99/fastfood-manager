import { app, BrowserWindow, shell, protocol, dialog, ipcMain, net, powerMonitor } from 'electron'
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
import { registerInstallation, checkCloudActivation } from './activation/cloud'
import { checkLicense } from './activation/license-service'
import { resolveWatcherOutcome } from './activation/license-outcome'
import type { LicenseReason } from './activation/license-client'
import { registerTabletHandlers } from './ipc/tablet.ipc'
import { startTabletServer, stopTabletServer } from './tablet/server'
import { startAnalyticsSync, stopAnalyticsSync } from './sync/analytics-sync'
import { ordersRepo, localDate } from './database/repositories/orders.repo'
import { syncAdminPassword } from './sync/owner-sync'
import { startCloudSync, stopCloudSync } from './sync/cloud-sync'
import { startRemoteOrderListener, stopRemoteOrderListener } from './sync/remote-order-listener'
import { stopPrintJobProcessor } from './ipc/printer.ipc'

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
// While online but stale, allow this long for a cloud re-check to succeed before locking.
let staleGraceDeadline = 0
const STALE_GRACE_MS = 60 * 1000
// setupTrialWatcher() runs from app start AND the `trial:ensureWatcher` IPC; without this the
// powerMonitor 'resume' handler would be registered twice.
let resumeListenerAttached = false

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
    // Staleness alone isn't proof of evasion: a laptop that slept for an hour wakes up "stale"
    // with perfectly good internet, and locking instantly is a support call. If we're online,
    // force a cloud check and give it a bounded grace window before locking.
    if (net.isOnline()) {
      if (staleGraceDeadline === 0) {
        staleGraceDeadline = Date.now() + STALE_GRACE_MS
        log(`Trial: cloud verification stale (${secondsSinceCloud}s) but online — re-checking before locking`)
        checkTrialCloud().catch(() => {})
        return
      }
      if (Date.now() < staleGraceDeadline) {
        checkTrialCloud().catch(() => {})
        return
      }
    }
    log(`Trial: cloud verification stale (${secondsSinceCloud}s since last success) — locking`)
    mainWindow?.webContents.send('trial:locked', 'offline')
    return
  }
  staleGraceDeadline = 0

  if (!net.isOnline()) {
    startOfflineCountdown()
  } else if (offlineCountdownInterval) {
    // Back online — clear countdown
    log('Trial: online restored — clearing countdown')
    clearOfflineCountdown()
  }
}

/**
 * Cloud check — fetches Supabase for trial status (admin actions, expiry updates).
 *
 * Coalesced: checkOfflineInstant fires every 3s and can ask for a re-check, so without this a
 * single hung 60s request would pile up ~20 concurrent checks against the same endpoint.
 */
let cloudCheckPromise: Promise<void> | null = null
function checkTrialCloud(): Promise<void> {
  if (cloudCheckPromise) return cloudCheckPromise
  cloudCheckPromise = doCheckTrialCloud().finally(() => {
    cloudCheckPromise = null
  })
  return cloudCheckPromise
}

async function doCheckTrialCloud(): Promise<void> {
  const activationType = settingsRepo.get('activation_type')
  // B2: run the entitlement check for EVERY activated install — trial AND paid — so revocation and
  // the 7-day grace boundary apply uniformly. (Previously only 'trial' was watched; full licenses
  // checked once at startup and then ran forever.)
  if (activationType !== 'trial' && activationType !== 'full') return

  // The license CLIENT is the single source of truth. It owns the tri-state (offline ≠ revocation)
  // and the 7-day signed-entitlement grace (monotonic-bounded), so we deliberately do NOT gate on
  // net.isOnline() here: online it returns a definitive answer; offline it returns licensed-grace or
  // a grace-exhausted lock. That replaces the old Supabase-era 2-minute offline countdown, which —
  // once a paid plan was mis-tagged as trial — locked paying customers ~7 days early.
  let decision
  try {
    decision = await checkLicense()
  } catch {
    return // the client does not throw; if it somehow does, no-op and retry next cycle
  }

  const outcome = resolveWatcherOutcome(decision, {
    hasCachedEntitlement: !!settingsRepo.get('license_cached_entitlement'),
    persistedLock: (settingsRepo.get('license_lock') || null) as LicenseReason | null
  })

  if (outcome.kind === 'defer') return // offline & never licensed — don't lock on a maybe

  if (outcome.kind === 'lock') {
    // Definitive revocation/expiry (M8: no second independent call can suppress it), or grace
    // exhausted. Persist the lock so it survives restart/offline.
    settingsRepo.set('license_lock', outcome.reason)
    log(`License lock: ${outcome.reason}`)
    mainWindow?.webContents.send('trial:locked', 'expired')
    return
  }

  // Licensed / migration → keep the POS unlocked and refresh local state.
  settingsRepo.set('license_lock', '')
  clearOfflineCountdown()
  cumulativeOfflineSeconds = 0
  lastCloudSuccessTime = Date.now()
  staleGraceDeadline = 0

  if (outcome.activationType) {
    const previousType = settingsRepo.get('activation_type')
    settingsRepo.set('activation_status', 'activated')
    settingsRepo.set('activation_type', outcome.activationType) // B1: paid → 'full', trial → 'trial'
    if (previousType === 'trial' && outcome.activationType === 'full') {
      log('Trial upgraded to a paid plan — promoting to full license')
      if (outcome.expiresAt) settingsRepo.set('trial_expires_at', outcome.expiresAt)
      mainWindow?.webContents.send('trial:status-update', { status: 'full' })
      mainWindow?.webContents.reload()
      return
    }
  }
  if (outcome.expiresAt) settingsRepo.set('trial_expires_at', outcome.expiresAt)
  mainWindow?.webContents.send('trial:status-update', { status: 'active', expiresAt: outcome.expiresAt })
}

function setupTrialWatcher(): void {
  // Initial check after 3s (window ready)
  setTimeout(() => { checkTrialCloud().catch(() => {}) }, 3000)

  // Sleeping is not "using the app offline". Re-check on resume so a wake doesn't strand the UI.
  // Registered once: setupTrialWatcher() also runs from the `trial:ensureWatcher` IPC.
  if (!resumeListenerAttached) {
    resumeListenerAttached = true
    powerMonitor.on('resume', () => {
      log('License: system resumed — re-checking entitlement')
      checkTrialCloud().catch(() => {})
    })
  }

  // Periodic entitlement check (admin actions, revocation, grace boundary). The client owns offline
  // grace, so the old 3-second net.isOnline() countdown loop is retired.
  if (!trialCheckInterval) {
    trialCheckInterval = setInterval(() => {
      checkTrialCloud().catch(() => {})
    }, CLOUD_CHECK_MS)
  }
}

// ─── Auto-updater setup ───────────────────────────────────────────────────────
function setupAutoUpdater(): void {
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false // Must be false — setting to true causes a race condition
  // verifyUpdateCodeSignature only exists on NsisUpdater, not the base AppUpdater type.
  ;(autoUpdater as unknown as { verifyUpdateCodeSignature: boolean }).verifyUpdateCodeSignature = false // We don't code-sign, skip signature verification
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
    // Stop everything that can write to the DB BEFORE closing it. Otherwise the remote-order
    // poll / tablet server could receive an order during the 2s teardown grace window, call
    // ordersRepo.create() on the closed connection, throw, and permanently mark the customer's
    // pending order 'failed' in Supabase — a silently-lost order with no local trace.
    stopAnalyticsSync()
    stopCloudSync()
    stopRemoteOrderListener()
    stopTabletServer()
    stopPrintJobProcessor()
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
      if (activationType === 'trial' || activationType === 'full') {
        if (!trialCheckInterval) {
          log('License watcher started on demand (mid-session activation)')
          setupTrialWatcher()
        } else {
          // Watcher already running (from before reset) — trigger an immediate check
          log('License watcher already running — triggering immediate check')
          checkTrialCloud().catch(() => {})
        }
      }
    })

    // Renderer can trigger an immediate license check (e.g. on browser offline/online events)
    ipcMain.handle('trial:checkNow', () => {
      const activationType = settingsRepo.get('activation_type')
      if (activationType === 'trial' || activationType === 'full') {
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
    // B2: watch BOTH trial and paid installs so the periodic entitlement /check applies revocation
    // and the 7-day grace boundary uniformly — a paid license no longer just checks once at startup.
    if (activationType === 'trial' || activationType === 'full') {
      log(`${activationType} activation detected — starting license watcher`)
      setupTrialWatcher()
    }
    // If a previous session persisted a definitive lock, surface it immediately; the watcher's first
    // check() re-evaluates (a re-licensed machine clears it, a still-revoked one stays locked).
    if (settingsRepo.get('license_lock')) {
      mainWindow?.webContents.send('trial:locked', 'expired')
    }

    // Local tamper check for full licenses (serial + integrity). The CLOUD authority is now the
    // periodic license watcher above; this only guards against LOCAL settings tampering offline.
    if (activationType === 'full') {
      log('Full license detected — verifying integrity')
      const storedCode = settingsRepo.get('activation_code')

      // Cloud-verified licenses (admin-granted) skip serial/integrity check.
      // Only a DEFINITIVE "no activation row" revokes the license. checkCloudActivation throws
      // NETWORK_ERROR when it cannot get a trustworthy answer, so an offline launch (or a
      // Supabase hiccup) leaves the paying restaurant activated and re-checks next launch.
      if (storedCode === 'CLOUD-VERIFIED') {
        log('Cloud-verified license — re-checking with Supabase')
        let revoked = false
        try {
          revoked = !(await checkCloudActivation(machineId))
        } catch {
          log('Cloud activation check inconclusive (offline) — keeping local license')
        }
        if (revoked) {
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
          let conclusive = true
          try {
            cloudActivated = await checkCloudActivation(machineId)
          } catch {
            conclusive = false
          }

          if (cloudActivated) {
            log('Cloud activation confirmed — admin-granted full license')
            settingsRepo.set('activation_status', 'activated')
            settingsRepo.set('activation_code', 'CLOUD-VERIFIED')
          } else if (!conclusive) {
            // Offline: we cannot tell a tampered install from a legitimate one whose cloud rescue
            // we simply couldn't reach. Wiping here locks out anyone whose serial check trips for a
            // benign reason (restored backup, clock skew) while their internet happens to be down.
            // Defer — the check re-runs on every launch, and the trial watcher still locks trials.
            log('License verification failed but cloud check was inconclusive — deferring to next launch', true)
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
      if (completed > 0) {
        log(`Auto-completed ${completed} orders from previous days`)
        // Also clean up old preparing orders in Supabase
        const { getClient: getSupabase } = await import('./activation/cloud')
        const supabase = getSupabase()
        // owner_orders.order_date holds the restaurant-LOCAL day (see orders.repo localDate()).
        // Using the UTC day here skipped local-yesterday's orders whenever the app was started
        // between 00:00 and 00:59 local, leaving them stuck as 'preparing' on the owner dashboard.
        const today = localDate()
        // Fire-and-forget. The query builder is a PromiseLike (no .catch), so pass an onRejected
        // handler to .then() — otherwise a transient failure becomes an unhandled rejection.
        supabase.from('owner_orders').update({ status: 'completed' }).eq('machine_id', machineId).eq('status', 'preparing').lt('order_date', today).then(() => {}, () => {})
      }
    } catch { /* ignore */ }

    // Start hidden analytics sync (daily stats to Supabase)
    startAnalyticsSync()

    // Start cloud sync for display settings and menu data
    log('Starting cloud sync')
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
  stopTabletServer()
  stopPrintJobProcessor()
  closeDatabase()
  app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})
