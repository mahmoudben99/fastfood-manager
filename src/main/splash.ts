import { BrowserWindow, screen } from 'electron'
import { join } from 'path'

let splashWindow: BrowserWindow | null = null

export function createSplashWindow(): BrowserWindow {
  const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize

  // Create small centered window (900x600 for 3:2 ratio)
  splashWindow = new BrowserWindow({
    width: 900,
    height: 600,
    x: Math.floor((screenWidth - 900) / 2),
    y: Math.floor((screenHeight - 600) / 2),
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    movable: false,
    skipTaskbar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: join(__dirname, '../preload/index.js')
    }
  })

  // Load splash HTML
  if (process.env.NODE_ENV === 'development') {
    splashWindow.loadURL('http://localhost:5173/splash.html')
  } else {
    splashWindow.loadFile(join(__dirname, '../renderer/splash.html'))
  }

  return splashWindow
}

export function closeSplashWindow(): void {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.close()
    splashWindow = null
  }
}
