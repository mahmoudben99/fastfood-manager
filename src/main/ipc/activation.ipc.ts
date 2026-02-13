import { ipcMain } from 'electron'
import { getMachineId, isActivated, activate } from '../activation/activation'

export function registerActivationHandlers(): void {
  ipcMain.handle('activation:getMachineId', () => {
    return getMachineId()
  })

  ipcMain.handle('activation:isActivated', () => {
    return isActivated()
  })

  ipcMain.handle('activation:activate', (_, serialCode: string) => {
    return activate(serialCode)
  })
}
