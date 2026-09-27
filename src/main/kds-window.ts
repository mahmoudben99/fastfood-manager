import { app, BrowserWindow, screen, type Display } from 'electron'
import { join } from 'path'
import type { KdsDisplayInfo } from '../shared/kds'

/**
 * Second-screen windows for the in-app kitchen display (#/kds) and the customer order board
 * (#/board). One window per kind; opening it again moves it to the chosen display. On a
 * secondary display the window goes full screen (F11 / Esc toggle); on the main display it
 * opens maximised so the cashier is never locked out of the POS.
 */
export type ScreenKind = 'kds' | 'board'

const windows: Record<ScreenKind, BrowserWindow | null> = { kds: null, board: null }

export function listDisplays(): KdsDisplayInfo[] {
  const primaryId = screen.getPrimaryDisplay().id
  return screen.getAllDisplays().map((display, index) => ({
    id: display.id,
    label: display.label || `Display ${index + 1}`,
    primary: display.id === primaryId,
    width: display.size.width,
    height: display.size.height
  }))
}

function pickDisplay(displayId: number | null): Display {
  const displays = screen.getAllDisplays()
  const primary = screen.getPrimaryDisplay()
  return displays.find((display) => display.id === displayId) ??
    displays.find((display) => display.id !== primary.id) ??
    primary
}

function place(win: BrowserWindow, display: Display): void {
  const secondary = display.id !== screen.getPrimaryDisplay().id
  if (win.isFullScreen()) win.setFullScreen(false)
  const area = display.workArea
  win.setBounds({ x: area.x, y: area.y, width: area.width, height: area.height })
  if (secondary) win.setFullScreen(true)
  else win.maximize()
}

/** Opens (or moves) the kitchen / board window. Returns the display it landed on. */
export function openScreenWindow(kind: ScreenKind, displayId: number | null, mainWindow: BrowserWindow | null): number {
  const display = pickDisplay(displayId)
  const existing = windows[kind]
  if (existing && !existing.isDestroyed()) {
    place(existing, display)
    existing.show()
    existing.focus()
    return display.id
  }

  const win = new BrowserWindow({
    x: display.workArea.x,
    y: display.workArea.y,
    width: Math.min(1280, display.workArea.width),
    height: Math.min(800, display.workArea.height),
    show: false,
    backgroundColor: '#0b0f17',
    autoHideMenuBar: true,
    title: kind === 'kds' ? 'Kitchen Display' : 'Order Board',
    icon: join(__dirname, '../../resources/resources/icon.ico'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      devTools: !app.isPackaged
    }
  })
  windows[kind] = win
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return
    if (input.key === 'F11') {
      event.preventDefault()
      win.setFullScreen(!win.isFullScreen())
    } else if (input.key === 'Escape' && win.isFullScreen()) {
      win.setFullScreen(false)
    } else if (app.isPackaged && (input.key === 'F12' || (input.control && input.shift && /^[ij]$/i.test(input.key)))) {
      event.preventDefault()
    }
  })
  win.once('ready-to-show', () => {
    place(win, display)
    win.show()
  })
  // The POS window owns the app lifetime: a leftover kitchen window must not keep it running.
  const closeWithMain = (): void => {
    if (!win.isDestroyed()) win.close()
  }
  mainWindow?.once('closed', closeWithMain)
  win.on('closed', () => {
    if (windows[kind] === win) windows[kind] = null
    mainWindow?.removeListener('closed', closeWithMain)
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#/${kind}`)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'), { hash: `/${kind}` })
  }
  return display.id
}
