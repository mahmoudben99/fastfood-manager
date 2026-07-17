const handlers = new Map()
let dialogPath = null

export const app = {
  isPackaged: true,
  getPath: () => globalThis.__ffmSafetyScratch,
  setLoginItemSettings: () => {}
}

export const ipcMain = { handle: (name, handler) => handlers.set(name, handler) }
export const dialog = { showOpenDialog: async () => ({ canceled: !dialogPath, filePaths: dialogPath ? [dialogPath] : [] }) }
export class BrowserWindow {
  static getAllWindows() { return [] }
}
export const shell = { openPath: async () => '' }
export const safeStorage = {
  isEncryptionAvailable: () => false,
  encryptString: (value) => Buffer.from(value),
  decryptString: (value) => Buffer.from(value).toString()
}
export const net = { request: () => ({ on: () => {}, end: () => {} }) }

export function getHandler(name) { return handlers.get(name) }
export function setDialogPath(value) { dialogPath = value }
