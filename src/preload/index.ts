import { contextBridge, ipcRenderer } from 'electron'
import type { SetupImportPayload, SetupImportResult } from '../shared/excel-import'
import type {
  ApprovalAction, ApprovalInput, ApprovalPolicy, CashBreakdown, InvoiceCustomer, InvoiceRow, OrderPaymentInput,
  OrderPaymentSummary, PaymentMethodConfig, RefundInput
} from '../shared/cash'
import type {
  CustomerAddress, CustomerAddressInput, DeliveryListEntry, DeliveryStatus, DeliveryZone, DeliveryZoneInput,
  DriverSettlement, DriverSettlementPreview, OrderDelivery, OrderDeliveryInput
} from '../shared/delivery'
import type { CashMovement, CashMovementInput, CloseShiftInput, OpenShiftInput, Shift, ShiftReport } from '../shared/shift-report'

/** Manual print options. reprint=true prints a visible "REPRINT" banner on the ticket. */
export type PrintOpts = { reprint?: boolean }
/** Result of every printer:* print call. error is human-readable and names the printer. */
export type PrintResult = { success: boolean; error?: string; printerName?: string }

const api = {
  activation: {
    getMachineId: () => ipcRenderer.invoke('activation:getMachineId'),
    isActivated: () => ipcRenderer.invoke('activation:isActivated'),
    activate: (serialCode: string) => ipcRenderer.invoke('activation:activate', serialCode),
    validateUnlockCode: (
      code: string
    ): Promise<{ valid: boolean; token?: string }> =>
      ipcRenderer.invoke('activation:validateUnlockCode', code),
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
    setAdminPassword: (
      newPassword: string
    ): Promise<
      | { ok: false; error: 'too_short_local' }
      | { ok: true; ownerDashboard: 'provisioned' | 'offline' | 'too_short' | 'unlicensed' | 'failed' }
    > => ipcRenderer.invoke('settings:setAdminPassword', newPassword),
    verifyPassword: (password: string) => ipcRenderer.invoke('settings:verifyPassword', password),
    uploadLogo: (): Promise<string | null> => ipcRenderer.invoke('settings:uploadLogo'),
    getLogoDataUrl: (): Promise<string | null> => ipcRenderer.invoke('settings:getLogoDataUrl'),
    removeLogo: (): Promise<void> => ipcRenderer.invoke('settings:removeLogo'),
    selectFolder: () => ipcRenderer.invoke('settings:selectFolder'),
    getAutoLaunch: () => ipcRenderer.invoke('settings:getAutoLaunch'),
    setAutoLaunch: (enabled: boolean) => ipcRenderer.invoke('settings:setAutoLaunch', enabled),
    logout: () => ipcRenderer.invoke('settings:logout')
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
    /** Soft-deleted menu items, most recent first. */
    getDeleted: () => ipcRenderer.invoke('menu:getDeleted'),
    /** Undo a delete; also re-activates the item's category if it was deleted. */
    restore: (id: number): Promise<{ item: any; categoryRestored: boolean }> =>
      ipcRenderer.invoke('menu:restore', id),
    uploadImage: () => ipcRenderer.invoke('menu:uploadImage')
  },
  stock: {
    getAll: () => ipcRenderer.invoke('stock:getAll'),
    getById: (id: number) => ipcRenderer.invoke('stock:getById', id),
    getLowStock: () => ipcRenderer.invoke('stock:getLowStock'),
    getLowStockCount: () => ipcRenderer.invoke('stock:getLowStockCount'),
    /** Active menu items whose recipe deducts from this stock item. */
    getRecipeUsage: (
      id: number
    ): Promise<{ menu_item_id: number; menu_item_name: string; quantity: number; unit: string }[]> =>
      ipcRenderer.invoke('stock:getRecipeUsage', id),
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
    /** v4: `approval` is required for 'cancelled' when manager approval guards cancellations. */
    updateStatus: (id: number, status: string, approval?: ApprovalInput) =>
      ipcRenderer.invoke('orders:updateStatus', id, status, approval),
    cancel: (id: number, approval?: ApprovalInput) => ipcRenderer.invoke('orders:cancel', id, approval),
    getToday: () => ipcRenderer.invoke('orders:getToday'),
    /**
     * Resolves to the saved order. A refused edit REJECTS with a message containing
     * `ORDER_EDIT_REJECTED:<past_day|completed|cancelled|not_found>` (see src/shared/order-edit.ts);
     * it never resolves to the unchanged order.
     */
    updateItems: (
      id: number,
      items: any[],
      discountAmount?: number,
      discountDetails?: string,
      info?: {
        order_type?: string
        table_number?: string | null
        customer_phone?: string | null
        customer_name?: string | null
        notes?: string | null
        /** v4: delivery patch; null = no delivery details. */
        delivery?: OrderDeliveryInput | null
      },
      /** v4: needed when the edit voids lines / raises the discount and approvals are on. */
      approval?: ApprovalInput
    ) => ipcRenderer.invoke('orders:updateItems', id, items, discountAmount, discountDetails, info, approval)
  },
  // ==================== v4 CASH: payments / shifts / delivery / approvals ====================
  // Rejections carry a message; stable tokens: NO_OPEN_SHIFT:, SHIFT_ALREADY_OPEN:, BELOW_MIN_ORDER:,
  // APPROVAL_REQUIRED:<action>, APPROVAL_INVALID:<action> (parse with parseApprovalError in shared/cash).
  payments: {
    getMethods: (): Promise<PaymentMethodConfig[]> => ipcRenderer.invoke('payments:getMethods'),
    /** Built-ins are always kept (cash cannot be disabled); custom methods need a label. */
    saveMethods: (methods: { id: string; enabled: boolean; label?: string }[]): Promise<PaymentMethodConfig[]> =>
      ipcRenderer.invoke('payments:saveMethods', methods),
    /** Rounded cash due + change for `amount` (setting cash_rounding 0 | 5 | 10). */
    previewCash: (amount: number, tendered?: number): Promise<CashBreakdown & { step: number }> =>
      ipcRenderer.invoke('payments:previewCash', amount, tendered),
    forOrder: (orderId: number): Promise<OrderPaymentSummary> => ipcRenderer.invoke('payments:forOrder', orderId),
    /** Pay later / partial / COD collection; split across methods allowed. */
    add: (orderId: number, lines: OrderPaymentInput[], operator?: string): Promise<OrderPaymentSummary> =>
      ipcRenderer.invoke('payments:add', orderId, lines, operator),
    refund: (orderId: number, refund: RefundInput, approval?: ApprovalInput): Promise<OrderPaymentSummary> =>
      ipcRenderer.invoke('payments:refund', orderId, refund, approval),
    listUnpaid: (options?: { date?: string; shiftId?: number }): Promise<{
      id: number; daily_number: number; order_date: string; order_type: string; customer_name: string | null
      customer_phone: string | null; total: number; paid: number; balance_due: number; payment_status: string
    }[]> => ipcRenderer.invoke('payments:listUnpaid', options),
    /** Net collected by method for an order_date range; pre-v4 orders count as cash. */
    salesByMethod: (startDate: string, endDate: string): Promise<{ method: string; amount: number; count: number }[]> =>
      ipcRenderer.invoke('payments:salesByMethod', startDate, endDate),
    getInvoice: (orderId: number): Promise<InvoiceRow | null> => ipcRenderer.invoke('payments:getInvoice', orderId),
    /** Issues the invoice number on first use, then returns the printable HTML. */
    invoiceHTML: (orderId: number, customer: InvoiceCustomer, format?: 'receipt' | 'a4'): Promise<string> =>
      ipcRenderer.invoke('payments:invoiceHTML', orderId, customer, format),
    printInvoice: (
      orderId: number,
      customer: InvoiceCustomer,
      options?: { printerName?: string; format?: 'receipt' | 'a4' }
    ): Promise<PrintResult> => ipcRenderer.invoke('payments:printInvoice', orderId, customer, options)
  },
  shifts: {
    getCurrent: (): Promise<Shift | null> => ipcRenderer.invoke('shifts:getCurrent'),
    open: (input: OpenShiftInput): Promise<Shift> => ipcRenderer.invoke('shifts:open', input),
    /** Pay-in / pay-out on the open shift; a pay-out needs `approval` when guarded. */
    addMovement: (input: CashMovementInput, approval?: ApprovalInput): Promise<CashMovement> =>
      ipcRenderer.invoke('shifts:addMovement', input, approval),
    listMovements: (shiftId?: number): Promise<CashMovement[]> => ipcRenderer.invoke('shifts:listMovements', shiftId),
    /** X report; expected cash is null (report.blind) during a blind count unless `approval` is given. */
    xReport: (approval?: ApprovalInput): Promise<ShiftReport> => ipcRenderer.invoke('shifts:xReport', approval),
    getReport: (shiftId: number, approval?: ApprovalInput): Promise<ShiftReport> =>
      ipcRenderer.invoke('shifts:getReport', shiftId, approval),
    list: (options?: { from?: string; to?: string; limit?: number }): Promise<Shift[]> => ipcRenderer.invoke('shifts:list', options),
    /** Closes with counted cash (or denominations); returns the Z report (+ print result when input.print). */
    close: (input: CloseShiftInput): Promise<{ shift: Shift; report: ShiftReport; print?: PrintResult }> =>
      ipcRenderer.invoke('shifts:close', input),
    printReport: (shiftId?: number, approval?: ApprovalInput): Promise<PrintResult> =>
      ipcRenderer.invoke('shifts:printReport', shiftId, approval)
  },
  delivery: {
    getZones: (includeInactive?: boolean): Promise<DeliveryZone[]> => ipcRenderer.invoke('delivery:getZones', includeInactive),
    saveZone: (input: DeliveryZoneInput): Promise<DeliveryZone> => ipcRenderer.invoke('delivery:saveZone', input),
    deleteZone: (id: number): Promise<boolean> => ipcRenderer.invoke('delivery:deleteZone', id),
    getAddresses: (customerId: number): Promise<CustomerAddress[]> => ipcRenderer.invoke('delivery:getAddresses', customerId),
    getAddressesByPhone: (phone: string): Promise<CustomerAddress[]> => ipcRenderer.invoke('delivery:getAddressesByPhone', phone),
    saveAddress: (input: CustomerAddressInput): Promise<CustomerAddress> => ipcRenderer.invoke('delivery:saveAddress', input),
    deleteAddress: (id: number): Promise<boolean> => ipcRenderer.invoke('delivery:deleteAddress', id),
    /** Active workers with role 'driver'. */
    getDrivers: (): Promise<{ id: number; name: string; phone: string | null }[]> => ipcRenderer.invoke('delivery:getDrivers'),
    getOrder: (orderId: number): Promise<OrderDelivery | null> => ipcRenderer.invoke('delivery:getOrder', orderId),
    list: (options?: { date?: string; status?: DeliveryStatus; driverId?: number }): Promise<DeliveryListEntry[]> =>
      ipcRenderer.invoke('delivery:list', options),
    /** Patch address / zone / fee / driver / notes; resolves to the updated order (a fee change updates the total). */
    updateDetails: (orderId: number, patch: OrderDeliveryInput) => ipcRenderer.invoke('delivery:updateDetails', orderId, patch),
    assignDriver: (orderId: number, driverId: number | null): Promise<OrderDelivery> =>
      ipcRenderer.invoke('delivery:assignDriver', orderId, driverId),
    /** 'delivered' also completes the order. */
    setStatus: (orderId: number, status: DeliveryStatus, reason?: string): Promise<OrderDelivery> =>
      ipcRenderer.invoke('delivery:setStatus', orderId, status, reason),
    settlementPreview: (driverId: number): Promise<DriverSettlementPreview> => ipcRenderer.invoke('delivery:settlementPreview', driverId),
    settleDriver: (input: { driver_id: number; collected_cash: number; note?: string; operator?: string }): Promise<DriverSettlement> =>
      ipcRenderer.invoke('delivery:settleDriver', input),
    listSettlements: (options?: { date?: string; shiftId?: number }): Promise<DriverSettlement[]> =>
      ipcRenderer.invoke('delivery:listSettlements', options)
  },
  approvals: {
    getPolicy: (): Promise<ApprovalPolicy> => ipcRenderer.invoke('approvals:getPolicy'),
    /** Ask before prompting: { required }. For 'discount' pass { subtotal, discount, allowance? }. */
    check: (action: ApprovalAction, context?: { subtotal: number; discount: number; allowance?: number }): Promise<{ required: boolean }> =>
      ipcRenderer.invoke('approvals:check', action, context),
    /** Admin password authorises. Policy keys are refused by settings:set (cashiers cannot switch them off). */
    savePolicy: (
      adminPassword: string,
      policy: { enabled?: boolean; actions?: ApprovalAction[]; discountPercent?: number; blindClose?: boolean }
    ): Promise<ApprovalPolicy> => ipcRenderer.invoke('approvals:savePolicy', adminPassword, policy),
    /** Admin password authorises; an empty pin clears the manager PIN. */
    setManagerPin: (adminPassword: string, pin: string): Promise<ApprovalPolicy> =>
      ipcRenderer.invoke('approvals:setManagerPin', adminPassword, pin),
    list: (options?: { shiftId?: number; orderId?: number }) => ipcRenderer.invoke('approvals:list', options)
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
    printReceipt: (orderId: number, opts?: PrintOpts): Promise<PrintResult> => ipcRenderer.invoke('printer:printReceipt', orderId, opts),
    printKitchen: (orderId: number, opts?: PrintOpts): Promise<PrintResult> => ipcRenderer.invoke('printer:printKitchen', orderId, opts),
    printKitchenForWorker: (orderId: number, workerId: number, opts?: PrintOpts): Promise<PrintResult> => ipcRenderer.invoke('printer:printKitchenForWorker', orderId, workerId, opts),
    printKitchenUnassigned: (orderId: number, opts?: PrintOpts): Promise<PrintResult> => ipcRenderer.invoke('printer:printKitchenUnassigned', orderId, opts),
    getOrderWorkers: (orderId: number) => ipcRenderer.invoke('printer:getOrderWorkers', orderId),
    previewReceipt: (orderId: number) => ipcRenderer.invoke('printer:previewReceipt', orderId),
    /** Full standalone HTML of what the receipt printer prints for a sample order. template=null → default receipt. */
    previewTemplate: (template: any | null): Promise<string> => ipcRenderer.invoke('printer:previewTemplate', template),
    testPrint: () => ipcRenderer.invoke('printer:testPrint'),
    testPrintOnPrinter: (printerName: string): Promise<PrintResult> => ipcRenderer.invoke('printer:testPrintOnPrinter', printerName),
    getAssignments: () => ipcRenderer.invoke('printer:getAssignments'),
    setAssignment: (printerName: string, assignmentType: string, workerId?: number) => ipcRenderer.invoke('printer:setAssignment', printerName, assignmentType, workerId),
    deleteAssignment: (id: number) => ipcRenderer.invoke('printer:deleteAssignment', id),
    clearAssignments: () => ipcRenderer.invoke('printer:clearAssignments'),
    saveFullConfig: (config: any) => ipcRenderer.invoke('printer:saveFullConfig', config),
    getPrintJobs: () => ipcRenderer.invoke('printer:getPrintJobs'),
    retryPrintJob: (id: number) => ipcRenderer.invoke('printer:retryPrintJob', id),
    cancelPrintJob: (id: number) => ipcRenderer.invoke('printer:cancelPrintJob', id),
    onPrintJobsChanged: (cb: (jobs: any[]) => void) => {
      const handler = (_: any, jobs: any[]) => cb(jobs)
      ipcRenderer.on('printer:jobsChanged', handler)
      return () => { ipcRenderer.removeListener('printer:jobsChanged', handler) }
    }
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
    importSetup: (payload: SetupImportPayload): Promise<SetupImportResult> =>
      ipcRenderer.invoke('data:importSetup', payload),
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
    // The validators CONSUME the single-use code and hand back a one-shot `token`.
    // resetPassword redeems that token — it must not re-check the (already burnt) code.
    validateTelegram: (
      code: string
    ): Promise<{ valid: boolean; token?: string }> =>
      ipcRenderer.invoke('reset:validateTelegram', code),
    validateCloud: (
      code: string
    ): Promise<{ valid: boolean; token?: string }> =>
      ipcRenderer.invoke('reset:validateCloud', code),
    resetPassword: (token: string, newPassword: string) =>
      ipcRenderer.invoke('reset:resetPassword', token, newPassword)
  },
  installation: {
    sync: () => ipcRenderer.invoke('installation:sync')
  },
  menuUpload: {
    selectImages: () => ipcRenderer.invoke('menu-upload:selectImages'),
    upload: (paths: string[]) => ipcRenderer.invoke('menu-upload:upload', paths),
    checkStatus: () => ipcRenderer.invoke('menu-upload:checkStatus'),
    downloadExcel: (
      excelPath: string
    ): Promise<{ ok: true; data: Uint8Array } | { ok: false; error: string }> =>
      ipcRenderer.invoke('menu-upload:downloadExcel', excelPath),
    markCompleted: (): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('menu-upload:markCompleted')
  },
  customers: {
    getAll: (sortBy?: string) => ipcRenderer.invoke('customers:getAll', sortBy),
    search: (query: string) => ipcRenderer.invoke('customers:search', query),
    getById: (id: number) => ipcRenderer.invoke('customers:getById', id),
    getOrders: (customerId: number) => ipcRenderer.invoke('customers:getOrders', customerId),
    getFavorites: (customerId: number) => ipcRenderer.invoke('customers:getFavorites', customerId),
    update: (id: number, data: any) => ipcRenderer.invoke('customers:update', id, data)
  },
  promotions: {
    getAll: () => ipcRenderer.invoke('promotions:getAll'),
    getActive: () => ipcRenderer.invoke('promotions:getActive'),
    create: (input: any) => ipcRenderer.invoke('promotions:create', input),
    update: (id: number, input: any) => ipcRenderer.invoke('promotions:update', id, input),
    delete: (id: number) => ipcRenderer.invoke('promotions:delete', id),
    toggle: (id: number) => ipcRenderer.invoke('promotions:toggle', id)
  },
  packs: {
    getAll: () => ipcRenderer.invoke('packs:getAll'),
    getActive: () => ipcRenderer.invoke('packs:getActive'),
    create: (input: any) => ipcRenderer.invoke('packs:create', input),
    update: (id: number, input: any) => ipcRenderer.invoke('packs:update', id, input),
    delete: (id: number) => ipcRenderer.invoke('packs:delete', id),
    toggle: (id: number) => ipcRenderer.invoke('packs:toggle', id)
  },
  receipt: {
    getTemplates: () => ipcRenderer.invoke('receipt:getTemplates'),
    getActive: () => ipcRenderer.invoke('receipt:getActive'),
    saveTemplate: (input: any) => ipcRenderer.invoke('receipt:saveTemplate', input),
    updateTemplate: (id: number, input: any) => ipcRenderer.invoke('receipt:updateTemplate', id, input),
    deleteTemplate: (id: number) => ipcRenderer.invoke('receipt:deleteTemplate', id),
    setActive: (id: number) => ipcRenderer.invoke('receipt:setActive', id),
    /** Deactivate every template: receipts print with the built-in default layout. */
    clearActive: (): Promise<void> => ipcRenderer.invoke('receipt:clearActive'),
    /** Reads/writes settings.social_media (same list as Settings > General). */
    getSocialMedia: (): Promise<{ platform: string; handle: string }[]> => ipcRenderer.invoke('receipt:getSocialMedia'),
    saveSocialMedia: (items: { platform: string; handle: string }[]): Promise<void> => ipcRenderer.invoke('receipt:saveSocialMedia', items),
    getPresets: () => ipcRenderer.invoke('receipt:getPresets'),
    generateQR: (url: string) => ipcRenderer.invoke('receipt:generateQR', url)
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
    },
    pushDisplayUpdate: (data: any) => ipcRenderer.invoke('tablet:pushDisplayUpdate', data),
    uploadDisplayImages: (profile?: string) => ipcRenderer.invoke('display:uploadImages', profile),
    getDisplayImages: (profile?: string) => ipcRenderer.invoke('display:getImages', profile),
    removeDisplayImage: (path: string, profile?: string) => ipcRenderer.invoke('display:removeImage', path, profile),
    getOwnerDashboard: () => ipcRenderer.invoke('owner:getQR'),
    getPairingCode: () => ipcRenderer.invoke('tablet:getPairingCode'),
    allowFirewall: () => ipcRenderer.invoke('tablet:allowFirewall')
  },
  cloud: {
    getShortCodes: () => ipcRenderer.invoke('cloud:getShortCodes'),
    syncDisplay: (profileName?: string) => ipcRenderer.invoke('cloud:syncDisplay', profileName),
    syncMenu: () => ipcRenderer.invoke('cloud:syncMenu'),
    createDisplayProfile: (name: string) => ipcRenderer.invoke('cloud:createDisplayProfile', name),
    deleteDisplayProfile: (name: string) => ipcRenderer.invoke('cloud:deleteDisplayProfile', name)
  },
  remote: {
    onRemoteOrder: (cb: (order: any) => void) => {
      const handler = (_: any, order: any) => cb(order)
      ipcRenderer.on('remote:new-order', handler)
      return () => { ipcRenderer.removeListener('remote:new-order', handler) }
    }
  }
}

// ==================== WP-F ORDER-EFFECTS IPC (APPEND-ONLY BLOCK) ====================
// Kept adjacent to exposure so Electron snapshots the widened API, and ElectronAPI includes it.
const orderEffectsIpc = {
  updateOrderHeader: (input: {
    orderId: number
    note?: string
    tableNumber?: string
    customer?: { phone?: string; name?: string }
    /** v4 (service camelCase): { address, addressId, zoneId, driverId, fee, notes, saveAddress, ignoreMinOrder }. */
    delivery?: Record<string, unknown> | null
  }) => ipcRenderer.invoke('orders:effects:updateHeader', input),
  updateOrderLines: (input: {
    orderId: number
    lines: {
      orderItemId?: number
      menuItemId: number
      quantity: number
      unitPriceOverride?: number
      note?: string
      workerId?: number
    }[]
    discountAmount?: number
    /** v4: service-shape delivery patch (see updateOrderHeader). */
    delivery?: Record<string, unknown> | null
    approval?: ApprovalInput
  }) => ipcRenderer.invoke('orders:effects:updateLines', input),
  updateOrderStatus: (
    orderId: number,
    status: 'pending' | 'preparing' | 'completed' | 'cancelled',
    approval?: ApprovalInput
  ) => ipcRenderer.invoke('orders:effects:updateStatus', orderId, status, approval)
}

const exposedApi = {
  ...api,
  orders: { ...api.orders, ...orderEffectsIpc }
}

contextBridge.exposeInMainWorld('api', exposedApi)

// For splash window
const electronAPI = {
  invoke: (channel: string, ...args: any[]) => ipcRenderer.invoke(channel, ...args)
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)

export type ElectronAPI = typeof exposedApi

// ═══ WP-G remote inbox bridge — appended block (EOF only, per WP-G boundaries) ═══
const remoteInboxApi = {
  list: () => ipcRenderer.invoke('remoteInbox:list'),
  accept: (id: string) => ipcRenderer.invoke('remoteInbox:accept', id),
  reject: (id: string, reason?: string) => ipcRenderer.invoke('remoteInbox:reject', id, reason),
  getEnabled: () => ipcRenderer.invoke('remoteInbox:getEnabled'),
  setEnabled: (enabled: boolean) => ipcRenderer.invoke('remoteInbox:setEnabled', enabled),
  onChanged: (cb: (rows: unknown[]) => void) => {
    const handler = (_: unknown, rows: unknown[]) => cb(rows)
    ipcRenderer.on('remoteInbox:changed', handler)
    return () => { ipcRenderer.removeListener('remoteInbox:changed', handler) }
  }
}
contextBridge.exposeInMainWorld('remoteInbox', remoteInboxApi)
export type RemoteInboxAPI = typeof remoteInboxApi
// ═══ end WP-G remote inbox bridge ═══
