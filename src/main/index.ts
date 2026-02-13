import { app, BrowserWindow, shell, protocol, dialog } from 'electron'
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
    dialog
      .showMessageBox(mainWindow!, {
        type: 'info',
        title: 'Update Available',
        message: `Version ${info.version} is available. Download now?`,
        buttons: ['Yes', 'Later']
      })
      .then((result) => {
        if (result.response === 0) {
          autoUpdater.downloadUpdate()
        }
      })
  })

  autoUpdater.on('update-downloaded', () => {
    dialog
      .showMessageBox(mainWindow!, {
        type: 'info',
        title: 'Update Ready',
        message: 'Update downloaded. The app will restart to install it.',
        buttons: ['Restart Now', 'Later']
      })
      .then((result) => {
        if (result.response === 0) {
          autoUpdater.quitAndInstall()
        }
      })
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
