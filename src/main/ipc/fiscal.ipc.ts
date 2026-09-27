import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { getDb } from '../database/connection'
import type {
  ArchiveExportResult, ArchiveYearSummary, AttestationLang, AttestationResult, JournalVerification, VendorInfo
} from '../../shared/fiscal'
import { verifyJournal } from '../services/fiscal/verify'
import { getFiscalStatus, getVendorInfo, saveVendorInfo } from '../services/fiscal/status'
import { buildYearArchive, writeYearArchive } from '../services/fiscal/archive'
import { buildAttestationHtml } from '../services/fiscal/attestation'
import { openHiddenDocument, writeTempDocument } from '../services/print-window'

/**
 * v4 fiscal compliance IPC (preload namespace `fiscal`): journal status + verification, yearly
 * archive export (folder picked by the user), vendor info and the attestation TEMPLATE as PDF.
 */

/** Paths this session produced — the only ones `fiscal:reveal` will show in Explorer. */
const produced = new Set<string>()

const settingsMap = (): Record<string, string> =>
  Object.fromEntries((getDb().prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[]).map((row) => [row.key, row.value]))

function lastVerification(): JournalVerification | null {
  return getFiscalStatus(getDb()).lastVerification
}

function attestationHtml(lang: AttestationLang): string {
  const db = getDb()
  const settings = settingsMap()
  const status = getFiscalStatus(db)
  const verification = lastVerification()
  return buildAttestationHtml({
    lang,
    vendor: getVendorInfo(db, app.getVersion()),
    restaurant: {
      name: settings.restaurant_name ?? '',
      legal_name: settings.legal_name ?? '',
      nif: settings.legal_nif ?? '',
      nis: settings.legal_nis ?? '',
      rc: settings.legal_rc ?? '',
      ai: settings.legal_ai ?? '',
      address: settings.restaurant_address ?? ''
    },
    journal: {
      events: status.journalEvents,
      lastFiscalNumber: status.lastFiscalNumber,
      headHash: status.headHash,
      verifiedOk: verification ? verification.ok : null,
      verifiedAt: verification?.verifiedAt ?? null
    },
    generatedAt: new Date()
  })
}

const stamp = (date: Date): string => {
  const local = new Date(date.getTime() + 60 * 60_000).toISOString() // Algiers (UTC+1)
  return `${local.slice(0, 10).replace(/-/g, '')}-${local.slice(11, 16).replace(':', '')}`
}

export function registerFiscalHandlers(): void {
  ipcMain.handle('fiscal:getStatus', () => getFiscalStatus(getDb()))
  ipcMain.handle('fiscal:verify', () => verifyJournal(getDb()))
  ipcMain.handle('fiscal:getVendorInfo', () => getVendorInfo(getDb(), app.getVersion()))
  ipcMain.handle('fiscal:saveVendorInfo', (_, patch: Partial<VendorInfo>) => saveVendorInfo(getDb(), patch, app.getVersion()))
  ipcMain.handle('fiscal:attestationHtml', (_, lang: AttestationLang) => attestationHtml(lang === 'ar' ? 'ar' : 'fr'))

  ipcMain.handle('fiscal:exportArchive', async (event, years?: number[]): Promise<ArchiveExportResult> => {
    const db = getDb()
    const available = getFiscalStatus(db).years
    const chosen = Array.isArray(years) && years.length ? years.filter((year) => available.includes(Number(year))) : available
    if (chosen.length === 0) return { ok: false, error: 'NO_DATA' }
    const parent = BrowserWindow.fromWebContents(event.sender)
    const options: Electron.OpenDialogOptions = { properties: ['openDirectory', 'createDirectory'], title: 'Archive' }
    const picked = parent ? await dialog.showOpenDialog(parent, options) : await dialog.showOpenDialog(options)
    if (picked.canceled || !picked.filePaths[0]) return { ok: false, canceled: true }
    try {
      const now = new Date()
      const verification = verifyJournal(db, now)
      const summaries: ArchiveYearSummary[] = []
      for (const year of chosen.sort((a, b) => a - b)) {
        const archive = buildYearArchive(db, year, { software: 'Fast Food Manager', version: app.getVersion(), exportedAt: now, verification })
        const folder = writeYearArchive(picked.filePaths[0], year, archive.files, stamp(now))
        produced.add(folder)
        summaries.push({ ...archive.summary, folder })
      }
      produced.add(picked.filePaths[0])
      return { ok: true, folder: picked.filePaths[0], years: summaries }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  })

  ipcMain.handle('fiscal:saveAttestationPdf', async (event, lang: AttestationLang): Promise<AttestationResult> => {
    const safeLang: AttestationLang = lang === 'ar' ? 'ar' : 'fr'
    const parent = BrowserWindow.fromWebContents(event.sender)
    const options: Electron.SaveDialogOptions = {
      defaultPath: join(app.getPath('documents'), `attestation-conformite-MODELE-${safeLang}.pdf`),
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    }
    const target = parent ? await dialog.showSaveDialog(parent, options) : await dialog.showSaveDialog(options)
    if (target.canceled || !target.filePath) return { ok: false, canceled: true }
    let file: string | null = null
    let win: BrowserWindow | null = null
    try {
      file = writeTempDocument(attestationHtml(safeLang), 'attestation')
      win = await openHiddenDocument(file)
      const pdf = await win.webContents.printToPDF({ printBackground: true, preferCSSPageSize: true, pageSize: 'A4' })
      writeFileSync(target.filePath, pdf)
      produced.add(target.filePath)
      return { ok: true, path: target.filePath }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    } finally {
      if (win && !win.isDestroyed()) win.destroy()
      if (file) rmSync(file, { force: true })
    }
  })

  /** Shows a file / folder this session exported in Explorer (never an arbitrary path). */
  ipcMain.handle('fiscal:reveal', (_, path: string) => {
    if (typeof path !== 'string' || !produced.has(path)) return false
    shell.showItemInFolder(path)
    return true
  })
}
