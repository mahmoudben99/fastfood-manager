import { contextBridge, ipcRenderer } from 'electron'

const api = {
  activation: {
    getMachineId: () => ipcRenderer.invoke('activation:getMachineId'),
    isActivated: () => ipcRenderer.invoke('activation:isActivated'),
    activate: (serialCode: string) => ipcRenderer.invoke('activation:activate', serialCode),
    validateUnlockCode: (code: string) => ipcRenderer.invoke('activation:validateUnlockCode', code),
    resetPassword: (unlockCode: string, newPassword: string) =>
      ipcRenderer.invoke('activation:resetPassword', unlockCode, newPassword)
  },
  settings: {
    get: (key: string) => ipcRenderer.invoke('settings:get', key),
    set: (key: string, value: string) => ipcRenderer.invoke('settings:set', key, value),
    getAll: () => ipcRenderer.invoke('settings:getAll'),
    setMultiple: (settings: Record<string, string>) =>
      ipcRenderer.invoke('settings:setMultiple', settings),
    getSchedule: () => ipcRenderer.invoke('settings:getSchedule'),
    setSchedule: (schedule: any[]) => ipcRenderer.invoke('settings:setSchedule', schedule),
    hashPassword: (password: string) => ipcRenderer.invoke('settings:hashPassword', password),
    verifyPassword: (password: string) => ipcRenderer.invoke('settings:verifyPassword', password),
    uploadLogo: () => ipcRenderer.invoke('settings:uploadLogo'),
    selectFolder: () => ipcRenderer.invoke('settings:selectFolder'),
    getAutoLaunch: () => ipcRenderer.invoke('settings:getAutoLaunch'),
    setAutoLaunch: (enabled: boolean) => ipcRenderer.invoke('settings:setAutoLaunch', enabled),
    resetAll: () => ipcRenderer.invoke('settings:resetAll')
  },
  categories: {
    getAll: () => ipcRenderer.invoke('categories:getAll'),
    getById: (id: number) => ipcRenderer.invoke('categories:getById', id),
    create: (input: any) => ipcRenderer.invoke('categories:create', input),
    update: (id: number, input: any) => ipcRenderer.invoke('categories:update', id, input),
    delete: (id: number) => ipcRenderer.invoke('categories:delete', id),
    reorder: (orderedIds: number[]) => ipcRenderer.invoke('categories:reorder', orderedIds),
    createMany: (inputs: any[]) => ipcRenderer.invoke('categories:createMany', inputs)
  },
  menu: {
    getAll: (categoryId?: number) => ipcRenderer.invoke('menu:getAll', categoryId),
    getById: (id: number) => ipcRenderer.invoke('menu:getById', id),
    create: (input: any) => ipcRenderer.invoke('menu:create', input),
    update: (id: number, input: any) => ipcRenderer.invoke('menu:update', id, input),
    delete: (id: number) => ipcRenderer.invoke('menu:delete', id),
    uploadImage: () => ipcRenderer.invoke('menu:uploadImage')
  },
  stock: {
    getAll: () => ipcRenderer.invoke('stock:getAll'),
    getById: (id: number) => ipcRenderer.invoke('stock:getById', id),
    getLowStock: () => ipcRenderer.invoke('stock:getLowStock'),
    getLowStockCount: () => ipcRenderer.invoke('stock:getLowStockCount'),
    create: (input: any) => ipcRenderer.invoke('stock:create', input),
    update: (id: number, input: any) => ipcRenderer.invoke('stock:update', id, input),
    delete: (id: number) => ipcRenderer.invoke('stock:delete', id),
    fix: (id: number, newQuantity: number, reason: string) =>
      ipcRenderer.invoke('stock:fix', id, newQuantity, reason),
    adjust: (id: number, newQuantity: number, reason: string) =>
      ipcRenderer.invoke('stock:adjust', id, newQuantity, reason),
    addPurchase: (id: number, quantity: number, pricePerUnit: number) =>
      ipcRenderer.invoke('stock:addPurchase', id, quantity, pricePerUnit)
  },
  workers: {
    getAll: () => ipcRenderer.invoke('workers:getAll'),
    getById: (id: number) => ipcRenderer.invoke('workers:getById', id),
    getByCategoryId: (categoryId: number) =>
      ipcRenderer.invoke('workers:getByCategoryId', categoryId),
    create: (input: any) => ipcRenderer.invoke('workers:create', input),
    update: (id: number, input: any) => ipcRenderer.invoke('workers:update', id, input),
    delete: (id: number) => ipcRenderer.invoke('workers:delete', id),
    getAttendance: (date: string) => ipcRenderer.invoke('workers:getAttendance', date),
    setAttendance: (
      workerId: number,
      date: string,
      shiftType: string,
      payAmount: number,
      notes?: string
    ) => ipcRenderer.invoke('workers:setAttendance', workerId, date, shiftType, payAmount, notes),
    getAttendanceRange: (startDate: string, endDate: string, workerId?: number) =>
      ipcRenderer.invoke('workers:getAttendanceRange', startDate, endDate, workerId)
  },
  orders: {
    create: (input: any) => ipcRenderer.invoke('orders:create', input),
    getById: (id: number) => ipcRenderer.invoke('orders:getById', id),
    getByDate: (date: string) => ipcRenderer.invoke('orders:getByDate', date),
    getByDateRange: (startDate: string, endDate: string) =>
      ipcRenderer.invoke('orders:getByDateRange', startDate, endDate),
    updateStatus: (id: number, status: string) =>
      ipcRenderer.invoke('orders:updateStatus', id, status),
    cancel: (id: number) => ipcRenderer.invoke('orders:cancel', id),
    getToday: () => ipcRenderer.invoke('orders:getToday'),
    updateItems: (id: number, items: any[]) => ipcRenderer.invoke('orders:updateItems', id, items)
  },
  analytics: {
    getProfitSummary: (startDate: string, endDate: string) =>
      ipcRenderer.invoke('analytics:getProfitSummary', startDate, endDate),
    getRevenueByDay: (startDate: string, endDate: string) =>
      ipcRenderer.invoke('analytics:getRevenueByDay', startDate, endDate),
    getCostsByDay: (startDate: string, endDate: string) =>
      ipcRenderer.invoke('analytics:getCostsByDay', startDate, endDate),
    getTopSellingItems: (startDate: string, endDate: string, limit?: number) =>
      ipcRenderer.invoke('analytics:getTopSellingItems', startDate, endDate, limit),
    getWorstSellingItems: (startDate: string, endDate: string, limit?: number) =>
      ipcRenderer.invoke('analytics:getWorstSellingItems', startDate, endDate, limit),
    getRevenueByCategory: (startDate: string, endDate: string) =>
      ipcRenderer.invoke('analytics:getRevenueByCategory', startDate, endDate),
    getWorkerPerformance: (startDate: string, endDate: string) =>
      ipcRenderer.invoke('analytics:getWorkerPerformance', startDate, endDate),
    getMonthlyTrends: (year: number) =>
      ipcRenderer.invoke('analytics:getMonthlyTrends', year),
    getOrderTypeBreakdown: (startDate: string, endDate: string) =>
      ipcRenderer.invoke('analytics:getOrderTypeBreakdown', startDate, endDate)
  },
  backup: {
    getPaths: () => ipcRenderer.invoke('backup:getPaths'),
    addPath: () => ipcRenderer.invoke('backup:addPath'),
    removePath: (path: string) => ipcRenderer.invoke('backup:removePath', path),
    createNow: () => ipcRenderer.invoke('backup:createNow'),
    restore: () => ipcRenderer.invoke('backup:restore'),
    listAvailable: () => ipcRenderer.invoke('backup:listAvailable'),
    getSchedule: () => ipcRenderer.invoke('backup:getSchedule'),
    setSchedule: (config: { enabled: boolean; time: string }) =>
      ipcRenderer.invoke('backup:setSchedule', config)
  },
  printer: {
    getPrinters: () => ipcRenderer.invoke('printer:getPrinters'),
    printReceipt: (orderId: number) => ipcRenderer.invoke('printer:printReceipt', orderId),
    printKitchen: (orderId: number) => ipcRenderer.invoke('printer:printKitchen', orderId),
    printKitchenForWorker: (orderId: number, workerId: number) => ipcRenderer.invoke('printer:printKitchenForWorker', orderId, workerId),
    getOrderWorkers: (orderId: number) => ipcRenderer.invoke('printer:getOrderWorkers', orderId),
    previewReceipt: (orderId: number) => ipcRenderer.invoke('printer:previewReceipt', orderId),
    testPrint: () => ipcRenderer.invoke('printer:testPrint')
  },
  telegram: {
    getConfig: () => ipcRenderer.invoke('telegram:getConfig'),
    saveConfig: (config: {
      token: string
      chatId: string
      autoStart: boolean
      orderNotifications: boolean
    }) => ipcRenderer.invoke('telegram:saveConfig', config),
    start: () => ipcRenderer.invoke('telegram:start'),
    stop: () => ipcRenderer.invoke('telegram:stop'),
    status: () => ipcRenderer.invoke('telegram:status')
  },
  data: {
    clearForImport: () => ipcRenderer.invoke('data:clearForImport'),
    saveVersion: (label: string) => ipcRenderer.invoke('data:saveVersion', label),
    listVersions: () => ipcRenderer.invoke('data:listVersions'),
    restoreVersion: (versionId: number) => ipcRenderer.invoke('data:restoreVersion', versionId),
    deleteVersion: (versionId: number) => ipcRenderer.invoke('data:deleteVersion', versionId)
  },
  updater: {
    onUpdateAvailable: (cb: (version: string) => void) => {
      const handler = (_: any, version: string) => cb(version)
      ipcRenderer.on('updater:update-available', handler)
      return () => { ipcRenderer.removeListener('updater:update-available', handler) }
    },
    onDownloadProgress: (cb: (percent: number) => void) => {
      const handler = (_: any, percent: number) => cb(percent)
      ipcRenderer.on('updater:download-progress', handler)
      return () => { ipcRenderer.removeListener('updater:download-progress', handler) }
    },
    onUpdateDownloaded: (cb: () => void) => {
      const handler = () => cb()
      ipcRenderer.on('updater:update-downloaded', handler)
      return () => { ipcRenderer.removeListener('updater:update-downloaded', handler) }
    },
    onUpdateError: (cb: (msg: string) => void) => {
      const handler = (_: any, msg: string) => cb(msg)
      ipcRenderer.on('updater:error', handler)
      return () => { ipcRenderer.removeListener('updater:error', handler) }
    },
    onUpToDate: (cb: () => void) => {
      const handler = () => cb()
      ipcRenderer.on('updater:up-to-date', handler)
      return () => { ipcRenderer.removeListener('updater:up-to-date', handler) }
    },
    check: () => ipcRenderer.invoke('updater:check'),
    download: () => ipcRenderer.invoke('updater:download'),
    install: () => ipcRenderer.invoke('updater:install')
  },
  trial: {
    start: () => ipcRenderer.invoke('trial:start'),
    check: () => ipcRenderer.invoke('trial:check'),
    getLocalStatus: () => ipcRenderer.invoke('trial:getLocalStatus'),
    ensureWatcher: () => ipcRenderer.invoke('trial:ensureWatcher'),
    checkNow: () => ipcRenderer.invoke('trial:checkNow'),
    onLocked: (cb: (reason: string) => void) => {
      const handler = (_: any, reason: string) => cb(reason)
      ipcRenderer.on('trial:locked', handler)
      return () => { ipcRenderer.removeListener('trial:locked', handler) }
    },
    onOfflineCountdown: (cb: (seconds: number) => void) => {
      const handler = (_: any, seconds: number) => cb(seconds)
      ipcRenderer.on('trial:offline-countdown', handler)
      return () => { ipcRenderer.removeListener('trial:offline-countdown', handler) }
    },
    onOfflineCleared: (cb: () => void) => {
      const handler = () => cb()
      ipcRenderer.on('trial:offline-cleared', handler)
      return () => { ipcRenderer.removeListener('trial:offline-cleared', handler) }
    },
    onStatusUpdate: (cb: (data: { status: string; expiresAt?: string }) => void) => {
      const handler = (_: any, data: any) => cb(data)
      ipcRenderer.on('trial:status-update', handler)
      return () => { ipcRenderer.removeListener('trial:status-update', handler) }
    }
  },
  reset: {
    sendViaTelegram: () => ipcRenderer.invoke('reset:telegram'),
    validateTelegram: (code: string) => ipcRenderer.invoke('reset:validateTelegram', code),
    validateCloud: (code: string) => ipcRenderer.invoke('reset:validateCloud', code),
    resetPassword: (code: string, newPassword: string, method: 'telegram' | 'support') =>
      ipcRenderer.invoke('reset:resetPassword', code, newPassword, method)
  },
  installation: {
    sync: () => ipcRenderer.invoke('installation:sync')
  },
  tablet: {
    start: () => ipcRenderer.invoke('tablet:start'),
    stop: () => ipcRenderer.invoke('tablet:stop'),
    status: () => ipcRenderer.invoke('tablet:status'),
    setPin: (pin: string) => ipcRenderer.invoke('tablet:setPin', pin),
    setPinEnabled: (enabled: boolean) => ipcRenderer.invoke('tablet:setPinEnabled', enabled),
    setAutoStart: (enabled: boolean) => ipcRenderer.invoke('tablet:setAutoStart', enabled),
    onNewOrder: (cb: (order: any) => void) => {
      const handler = (_: any, order: any) => cb(order)
      ipcRenderer.on('tablet:new-order', handler)
      return () => { ipcRenderer.removeListener('tablet:new-order', handler) }
    }
  }
}

contextBridge.exposeInMainWorld('api', api)

// For splash window
const electronAPI = {
  invoke: (channel: string, ...args: any[]) => ipcRenderer.invoke(channel, ...args)
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)

export type ElectronAPI = typeof api
