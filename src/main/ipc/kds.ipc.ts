import { ipcMain, BrowserWindow } from 'electron'
import QRCode from 'qrcode'
import { getDb } from '../database/connection'
import { parseKdsStation, type KdsActionResult, type KdsLanInfo } from '../../shared/kds'
import { kdsEvents, notifyKdsSettingsChanged } from '../services/kds/kds-events'
import { buildBoardState, buildKdsSnapshot, readyOrderIds } from '../services/kds/kds-query'
import { parseKdsAction, runKdsAction } from '../services/kds/kds-actions'
import { healKdsTickets } from '../services/kds/kds-sync'
import {
  readDisplayChoice,
  readKdsSettings,
  saveDisplayChoice,
  saveKdsSettings,
  setKdsPin,
  type KdsSettingsPatch
} from '../services/kds/kds-settings'
import { getCurrentPort, getLocalIP, isTabletServerRunning } from '../tablet/server'
import { listDisplays, openScreenWindow, type ScreenKind } from '../kds-window'

function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload)
  }
}

/** Kitchen display IPC (preload namespace `kds`) + push events to every renderer window. */
export function registerKdsHandlers(getMainWindow: () => BrowserWindow | null): void {
  ipcMain.handle('kds:getTickets', (_event, station?: unknown) => buildKdsSnapshot(getDb(), parseKdsStation(station)))

  ipcMain.handle('kds:action', (_event, raw: unknown): KdsActionResult => {
    const action = parseKdsAction(raw)
    if (!action) return { ok: false, error: 'invalid_action' }
    const outcome = runKdsAction(getDb(), action)
    return outcome.ok ? { ok: true } : { ok: false, error: outcome.error }
  })

  ipcMain.handle('kds:getReadyOrders', () => readyOrderIds(getDb()))
  ipcMain.handle('kds:getBoard', () => buildBoardState(getDb()))
  ipcMain.handle('kds:getSettings', () => readKdsSettings(getDb()))

  ipcMain.handle('kds:saveSettings', (_event, patch: KdsSettingsPatch) => {
    const result = saveKdsSettings(getDb(), patch)
    if (!result.ok) return result
    notifyKdsSettingsChanged()
    return { ok: true, settings: readKdsSettings(getDb()) }
  })

  ipcMain.handle('kds:setPin', (_event, pin: unknown) => setKdsPin(getDb(), typeof pin === 'string' ? pin : ''))
  ipcMain.handle('kds:getDisplays', () => listDisplays())

  const open = (kind: ScreenKind, displayId: unknown): { ok: true; displayId: number } => {
    const requested = typeof displayId === 'number' && Number.isFinite(displayId) ? displayId : readDisplayChoice(getDb(), kind)
    const landed = openScreenWindow(kind, requested, getMainWindow())
    saveDisplayChoice(getDb(), kind, landed)
    return { ok: true, displayId: landed }
  }
  ipcMain.handle('kds:openWindow', (_event, displayId?: unknown) => open('kds', displayId))
  ipcMain.handle('kds:openBoardWindow', (_event, displayId?: unknown) => open('board', displayId))

  ipcMain.handle('kds:getLanInfo', async (): Promise<KdsLanInfo> => {
    if (!isTabletServerRunning()) return { running: false, kdsUrl: '', boardUrl: '', kdsQr: null, boardQr: null }
    const base = `http://${getLocalIP()}:${getCurrentPort()}`
    const kdsUrl = `${base}/kds`
    const boardUrl = `${base}/board`
    const [kdsQr, boardQr] = await Promise.all([
      QRCode.toDataURL(kdsUrl, { width: 200, margin: 1 }),
      QRCode.toDataURL(boardUrl, { width: 200, margin: 1 })
    ])
    return { running: true, kdsUrl, boardUrl, kdsQr, boardQr }
  })

  kdsEvents.on('changed', (event) => broadcast('kds:changed', event))
  kdsEvents.on('ready', (event) => broadcast('kds:readyChanged', event))

  // First start after the upgrade, then every minute: rebuild missing / stale tickets.
  const heal = (): void => {
    try {
      healKdsTickets(getDb())
    } catch (error) {
      console.error('[KDS] Ticket repair failed:', error)
    }
  }
  heal()
  setInterval(heal, 60_000).unref()
}
