/**
 * WP-G — IPC surface for the POS remote-order inbox (RemoteOrderInbox.tsx).
 *
 * Registered from startRemoteOrderListener() (remote-order-listener.ts) so the
 * wiring stays inside WP-G file boundaries; the orchestrator may relocate the
 * registration call into ipc/index.ts at integration.
 *
 * All handlers validate their renderer-supplied inputs (system boundary).
 */
import { ipcMain } from 'electron'
import {
  getPendingRemoteOrders,
  acceptRemoteOrder,
  rejectRemoteOrder,
  getRemoteOrderingEnabled,
  setRemoteOrderingEnabled
} from '../sync/remote-order-listener'

let registered = false

export function registerRemoteInboxHandlers(): void {
  if (registered) return
  registered = true

  ipcMain.handle('remoteInbox:list', () => {
    return getPendingRemoteOrders()
  })

  ipcMain.handle('remoteInbox:accept', async (_event, id: unknown) => {
    if (typeof id !== 'string' || !id || id.length > 64) {
      return { outcome: 'failed', message: 'Invalid request id' }
    }
    return acceptRemoteOrder(id)
  })

  ipcMain.handle('remoteInbox:reject', async (_event, id: unknown, reason: unknown) => {
    if (typeof id !== 'string' || !id || id.length > 64) return { ok: false }
    const safeReason =
      typeof reason === 'string' && reason.trim() ? reason.trim().slice(0, 300) : undefined
    return rejectRemoteOrder(id, safeReason)
  })

  ipcMain.handle('remoteInbox:getEnabled', async () => {
    return getRemoteOrderingEnabled()
  })

  ipcMain.handle('remoteInbox:setEnabled', async (_event, enabled: unknown) => {
    return setRemoteOrderingEnabled(enabled === true)
  })
}
