import { app, BrowserWindow } from 'electron'
import { mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'

/** Result of every printer:* print call. `error` is human-readable and names the printer. */
export interface PrintResult {
  success: boolean
  error?: string
  printerName?: string
}

const PRINT_TIMEOUT_MS = 10_000
const STALE_PRINT_FILE_MS = 60 * 60_000

function printDir(): string {
  const dir = join(app.getPath('temp'), 'ffm-print')
  mkdirSync(dir, { recursive: true })
  return dir
}

const message = (error: unknown): string => (error instanceof Error ? error.message : String(error))

/** Turns Electron's print failure into a sentence that names the printer. */
export function describePrintFailure(printerName: string, reason: string): string {
  if (/invalid device ?name|not found|no such printer|unknown printer/i.test(reason)) {
    return `Printer "${printerName}" not found — check it is installed and switched on, or re-select it in Settings`
  }
  return `Printer "${printerName}": ${reason || 'Print failed'}`
}

/** Removes print documents left behind by a crash (normally each one is deleted after printing). */
export function cleanupStalePrintFiles(): void {
  try {
    const dir = printDir()
    for (const name of readdirSync(dir)) {
      const file = join(dir, name)
      if (Date.now() - statSync(file).mtimeMs > STALE_PRINT_FILE_MS) rmSync(file, { force: true })
    }
  } catch (error) {
    console.warn('[Printer] Could not clean old print documents:', error)
  }
}

/** Writes `html` to a unique temp file (caller deletes it). */
export function writeTempDocument(html: string, prefix = 'print'): string {
  const file = join(printDir(), `${prefix}-${Date.now()}-${randomUUID()}.html`)
  writeFileSync(file, html, 'utf8')
  return file
}

/**
 * Loads a local file in a hidden window; resolves once it finished loading (rejects on a load
 * failure). A load that fails is retried once in a fresh window: Chromium occasionally fails the
 * first navigation of a window created right after another one was destroyed. Caller destroys it.
 */
export async function openHiddenDocument(file: string): Promise<BrowserWindow> {
  let lastError: unknown = null
  for (let attempt = 0; attempt < 2; attempt++) {
    const win = new BrowserWindow({
      show: false,
      width: 300,
      height: 600,
      webPreferences: { nodeIntegration: false, contextIsolation: true }
    })
    try {
      await win.loadFile(file)
      return win
    } catch (error) {
      lastError = error
      if (!win.isDestroyed()) win.destroy()
    }
  }
  throw lastError
}

/**
 * Prints one HTML document silently on `printerName`.
 *
 * The document is written to a temp file and loaded with loadFile(). It used to be URL-encoded
 * into a data: URL; a large logo pushed that past Chromium's 2 MB URL limit (ERR_INVALID_URL,
 * never caught), the page never loaded, and every receipt ended in "Print timeout". Every exit
 * path settles exactly once and every window call is guarded — after the timeout the window may
 * already be gone, and an exception here reaches the uncaught-exception handler, which quits the POS.
 */
export function printHtml(html: string, printerName: string): Promise<PrintResult> {
  return new Promise((resolve) => {
    let settled = false
    let file: string | null = null
    let win: BrowserWindow | null = null
    let timer: NodeJS.Timeout | null = null

    const closeWindow = (target: BrowserWindow | null): void => {
      try {
        if (target && !target.isDestroyed()) target.destroy()
      } catch (error) {
        console.warn('[Printer] Could not close print window:', error)
      }
    }
    const finish = (result: PrintResult): void => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      closeWindow(win)
      if (file) {
        try { rmSync(file, { force: true }) } catch (error) { console.warn('[Printer] Could not delete print document:', error) }
      }
      resolve({ ...result, printerName })
    }

    try {
      file = writeTempDocument(html)
    } catch (error) {
      finish({ success: false, error: `Printer "${printerName}": could not prepare the document (${message(error)})` })
      return
    }

    timer = setTimeout(() => {
      finish({ success: false, error: `Printer "${printerName}": Print timeout — check the paper, then retry` })
    }, PRINT_TIMEOUT_MS)

    openHiddenDocument(file)
      .then((opened) => {
        if (settled) {
          closeWindow(opened)
          return
        }
        win = opened
        try {
          opened.webContents.print(
            { silent: true, deviceName: printerName, printBackground: true, margins: { marginType: 'none' } },
            (success, failureReason) => {
              finish(success ? { success: true } : { success: false, error: describePrintFailure(printerName, failureReason) })
            }
          )
        } catch (error) {
          finish({ success: false, error: describePrintFailure(printerName, message(error)) })
        }
      })
      .catch((error) => {
        finish({ success: false, error: `Printer "${printerName}": could not load the document (${message(error)})` })
      })
  })
}
