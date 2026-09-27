import { contextBridge, ipcRenderer } from 'electron'
import type { SetupImportPayload, SetupImportResult } from '../shared/excel-import'
import type {
  DashboardSummary, InsightAlert, InsightsPrintResult, InsightsSendResult, InsightsSettings,
  MenuProfitReport, PrepForecast, RushHoursReport, ShoppingList, UpsellSuggestion
} from '../shared/insights'
import type {
  KdsActionResult,
  KdsBoardState,
  KdsChangeEvent,
  KdsDisplayInfo,
  KdsLanInfo,
  KdsReadyEvent,
  KdsSettings,
  KdsSnapshot,
  KdsStationFilter
} from '../shared/kds'
import type {
  ApprovalAction, ApprovalInput, ApprovalPolicy, CashBreakdown, InvoiceCustomer, InvoiceRow, OrderPaymentInput,
  OrderPaymentSummary, PaymentMethodConfig, RefundInput
} from '../shared/cash'
import type {
  CustomerAddress, CustomerAddressInput, DeliveryListEntry, DeliveryStatus, DeliveryZone, DeliveryZoneInput,
  DriverSettlement, DriverSettlementPreview, OrderDelivery, OrderDeliveryInput
} from '../shared/delivery'
import type { CashMovement, CashMovementInput, CloseShiftInput, OpenShiftInput, Shift, ShiftReport } from '../shared/shift-report'
import type {
  ArchiveExportResult, AttestationLang, AttestationResult, FiscalStatus, JournalVerification, VendorInfo
} from '../shared/fiscal'
import type { ChannelPrices, CustomPlatformInput, SalesChannel } from '../shared/channels'
import type { AvailabilityEnforce, AvailabilityRule, AvailabilityState, AvailabilityTarget } from '../shared/availability'
import type { ConsentInput, CustomerRecord, LastOrderResult } from '../shared/customer-lookup'

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
  // ─── v4 catalog: modifiers (options), combos, sold out. Errors reject with a message already
  // in the app language. Order lines (orders.create items[] / orders.updateItems items[]) accept:
  //   modifiers?: { option_id: number; quantity?: number }[]   // omit = defaults ([] = none;
  //                                                              // existing line: omit = keep)
  //   children?: { slot_id: number; menu_item_id: number; modifiers?: …same…; note?: string }[]
  //                                                              // combos only; omit = default picks
  // Prices always come from the DB; unit_price (POS only) is the FINAL unit price — omit it.
  modifiers: {
    listGroups: (opts?: { includeInactive?: boolean }): Promise<import('../shared/catalog-types').ModifierGroup[]> =>
      ipcRenderer.invoke('modifiers:listGroups', opts),
    getGroup: (groupId: number): Promise<import('../shared/catalog-types').ModifierGroup | null> => ipcRenderer.invoke('modifiers:getGroup', groupId),
    createGroup: (input: import('../shared/catalog-types').ModifierGroupInput): Promise<import('../shared/catalog-types').ModifierGroup> => ipcRenderer.invoke('modifiers:createGroup', input),
    updateGroup: (groupId: number, input: Partial<import('../shared/catalog-types').ModifierGroupInput>): Promise<import('../shared/catalog-types').ModifierGroup> =>
      ipcRenderer.invoke('modifiers:updateGroup', groupId, input),
    /** Hard delete (options + assignments go with it; sold orders keep their snapshots). */
    deleteGroup: (groupId: number): Promise<boolean> => ipcRenderer.invoke('modifiers:deleteGroup', groupId),
    createOption: (groupId: number, input: import('../shared/catalog-types').ModifierOptionInput): Promise<import('../shared/catalog-types').ModifierOption> =>
      ipcRenderer.invoke('modifiers:createOption', groupId, input),
    /** `ingredients` omitted = keep, [] = none. */
    updateOption: (optionId: number, input: Partial<import('../shared/catalog-types').ModifierOptionInput>): Promise<import('../shared/catalog-types').ModifierOption> =>
      ipcRenderer.invoke('modifiers:updateOption', optionId, input),
    deleteOption: (optionId: number): Promise<boolean> => ipcRenderer.invoke('modifiers:deleteOption', optionId),
    getItemAssignments: (menuItemId: number): Promise<Required<import('../shared/catalog-types').ModifierAssignmentInput>[]> =>
      ipcRenderer.invoke('modifiers:getItemAssignments', menuItemId),
    /** Replaces the item's own rows; `excluded: true` hides a category group for this item. */
    setItemAssignments: (menuItemId: number, entries: import('../shared/catalog-types').ModifierAssignmentInput[]): Promise<Required<import('../shared/catalog-types').ModifierAssignmentInput>[]> =>
      ipcRenderer.invoke('modifiers:setItemAssignments', menuItemId, entries),
    getCategoryAssignments: (categoryId: number): Promise<{ group_id: number; sort_order: number }[]> =>
      ipcRenderer.invoke('modifiers:getCategoryAssignments', categoryId),
    setCategoryAssignments: (
      categoryId: number,
      entries: { group_id: number; sort_order?: number }[]
    ): Promise<{ group_id: number; sort_order: number }[]> =>
      ipcRenderer.invoke('modifiers:setCategoryAssignments', categoryId, entries),
    /** Active groups/options that apply to the item (item rows override category rows), in order. */
    getForMenuItem: (menuItemId: number): Promise<import('../shared/catalog-types').ResolvedModifierGroup[]> =>
      ipcRenderer.invoke('modifiers:getForMenuItem', menuItemId)
  },
  combos: {
    list: (): Promise<import('../shared/catalog-types').ComboDefinition[]> => ipcRenderer.invoke('combos:list'),
    get: (menuItemId: number): Promise<import('../shared/catalog-types').ComboDefinition | null> => ipcRenderer.invoke('combos:get', menuItemId),
    /** Flags the menu item as a combo (price = menu price) and replaces its slots. */
    save: (menuItemId: number, input: { slots: import('../shared/catalog-types').ComboSlotInput[] }): Promise<import('../shared/catalog-types').ComboDefinition> =>
      ipcRenderer.invoke('combos:save', menuItemId, input),
    remove: (menuItemId: number): Promise<boolean> => ipcRenderer.invoke('combos:remove', menuItemId),
    /** Order screen view (category choices expanded, sold_out flags); null = not a combo. */
    getForMenuItem: (menuItemId: number): Promise<import('../shared/catalog-types').ResolvedCombo | null> =>
      ipcRenderer.invoke('combos:getForMenuItem', menuItemId)
  },
  soldOut: {
    /** Manual 86 toggle. `sold_out` is the effective state (also true when auto rule applies). */
    set: (menuItemId: number, soldOut: boolean): Promise<{ id: number; is_sold_out: number; sold_out: number }> =>
      ipcRenderer.invoke('soldOut:set', menuItemId, soldOut),
    list: (): Promise<{ id: number; name: string; manual: boolean; auto: boolean }[]> => ipcRenderer.invoke('soldOut:list'),
    /** Setting auto_sold_out: items with a recipe ingredient at 0 stock cannot be ordered. */
    getAuto: (): Promise<boolean> => ipcRenderer.invoke('soldOut:getAuto'),
    setAuto: (enabled: boolean): Promise<boolean> => ipcRenderer.invoke('soldOut:setAuto', enabled)
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
        /** v4 fiscal: sales channel ('yassir' / platform id for delivery orders); orders.create takes `channel` too. */
        channel?: string
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
  /**
   * Smart insights (v4). Types: src/shared/insights.ts. Dates are local 'YYYY-MM-DD'; omitted
   * date = today. Invalid input rejects with a readable message.
   */
  insights: {
    /** Expected units per active menu item for a date (same-weekday weighted average). */
    getForecast: (date?: string, options?: { trend?: boolean }): Promise<PrepForecast> =>
      ipcRenderer.invoke('insights:getForecast', date, options),
    /** Ingredient needs vs stock/thresholds → what to buy, with estimated cost. Includes the forecast. */
    getShoppingList: (date?: string): Promise<ShoppingList> =>
      ipcRenderer.invoke('insights:getShoppingList', date),
    /** Printable prep + shopping list HTML, sized for the receipt printer (preview). */
    getPrepListHtml: (date?: string): Promise<string> =>
      ipcRenderer.invoke('insights:getPrepListHtml', date),
    /** Prints the prep + shopping list on the receipt printer. */
    printPrepList: (date?: string): Promise<InsightsPrintResult> =>
      ipcRenderer.invoke('insights:printPrepList', date),
    /** Sends the morning prep message to the owner's Telegram now (manual / test). */
    sendMorningPrep: (date?: string): Promise<InsightsSendResult> =>
      ipcRenderer.invoke('insights:sendMorningPrep', date),
    /** Recipe cost, margin, food-cost %, flags and menu-engineering quadrant over a range. */
    getMenuProfit: (startDate: string, endDate: string): Promise<MenuProfitReport> =>
      ipcRenderer.invoke('insights:getMenuProfit', startDate, endDate),
    /** "62% also take …" for the order screen; cached model, sub-millisecond lookups. */
    getUpsellSuggestions: (cartMenuItemIds: number[], limit = 3): Promise<UpsellSuggestion[]> =>
      ipcRenderer.invoke('insights:getUpsellSuggestions', cartMenuItemIds, limit),
    /** Weekday × hour heatmap, best/worst hours and staffing blocks. */
    getRushHours: (startDate: string, endDate: string): Promise<RushHoursReport> =>
      ipcRenderer.invoke('insights:getRushHours', startDate, endDate),
    /** Alerts detected right now (all kinds), with `sent` = already sent to Telegram today. */
    getAlerts: (): Promise<InsightAlert[]> => ipcRenderer.invoke('insights:getAlerts'),
    /** Admin home: today vs last week, 14-day sparkline, top items, low stock, forecast, alerts. */
    getDashboardSummary: (): Promise<DashboardSummary> =>
      ipcRenderer.invoke('insights:getDashboardSummary'),
    getSettings: (): Promise<InsightsSettings> => ipcRenderer.invoke('insights:getSettings'),
    /** Validates and saves a partial patch; resolves to the full saved settings. */
    saveSettings: (patch: Partial<InsightsSettings>): Promise<InsightsSettings> =>
      ipcRenderer.invoke('insights:saveSettings', patch)
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
  /** Kitchen display + customer order board (v4). station: 'all' = expo view, 0 = unassigned lines, else workers.id. */
  kds: {
    getTickets: (station: KdsStationFilter = 'all'): Promise<KdsSnapshot> => ipcRenderer.invoke('kds:getTickets', station),
    start: (ticketId: number): Promise<KdsActionResult> => ipcRenderer.invoke('kds:action', { type: 'start', ticketId }),
    bump: (ticketId: number): Promise<KdsActionResult> => ipcRenderer.invoke('kds:action', { type: 'bump', ticketId }),
    recall: (ticketId: number): Promise<KdsActionResult> => ipcRenderer.invoke('kds:action', { type: 'recall', ticketId }),
    lineDone: (itemId: number, done: boolean): Promise<KdsActionResult> => ipcRenderer.invoke('kds:action', { type: 'line-done', itemId, done }),
    bumpOrder: (orderId: number): Promise<KdsActionResult> => ipcRenderer.invoke('kds:action', { type: 'bump-order', orderId }),
    recallOrder: (orderId: number): Promise<KdsActionResult> => ipcRenderer.invoke('kds:action', { type: 'recall-order', orderId }),
    recallLast: (station: KdsStationFilter): Promise<KdsActionResult> => ipcRenderer.invoke('kds:action', { type: 'recall-last', station }),
    /** Orders whose every kitchen ticket is ready (POS "READY" badges). */
    getReadyOrders: (): Promise<number[]> => ipcRenderer.invoke('kds:getReadyOrders'),
    getBoard: (): Promise<KdsBoardState> => ipcRenderer.invoke('kds:getBoard'),
    getSettings: (): Promise<KdsSettings> => ipcRenderer.invoke('kds:getSettings'),
    saveSettings: (
      patch: Partial<Omit<KdsSettings, 'pin'>>
    ): Promise<{ ok: true; settings: KdsSettings } | { ok: false; error: string }> => ipcRenderer.invoke('kds:saveSettings', patch),
    setPin: (pin: string): Promise<{ ok: true } | { ok: false; error: string }> => ipcRenderer.invoke('kds:setPin', pin),
    getDisplays: (): Promise<KdsDisplayInfo[]> => ipcRenderer.invoke('kds:getDisplays'),
    getLanInfo: (): Promise<KdsLanInfo> => ipcRenderer.invoke('kds:getLanInfo'),
    /** Opens (or moves) the kitchen screen window; no id = last used / first secondary display. */
    openWindow: (displayId?: number): Promise<{ ok: true; displayId: number }> => ipcRenderer.invoke('kds:openWindow', displayId),
    openBoardWindow: (displayId?: number): Promise<{ ok: true; displayId: number }> => ipcRenderer.invoke('kds:openBoardWindow', displayId),
    onChanged: (cb: (event: KdsChangeEvent) => void) => {
      const handler = (_: any, event: KdsChangeEvent) => cb(event)
      ipcRenderer.on('kds:changed', handler)
      return () => { ipcRenderer.removeListener('kds:changed', handler) }
    },
    onReadyChanged: (cb: (event: KdsReadyEvent) => void) => {
      const handler = (_: any, event: KdsReadyEvent) => cb(event)
      ipcRenderer.on('kds:readyChanged', handler)
      return () => { ipcRenderer.removeListener('kds:readyChanged', handler) }
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
    update: (id: number, data: any) => ipcRenderer.invoke('customers:update', id, data),
    /** v4: last non-cancelled order as re-orderable lines + skipped ones (sold out / removed). */
    getLastOrder: (customerId: number): Promise<LastOrderResult> => ipcRenderer.invoke('customers:getLastOrder', customerId),
    /** v4: customer agreed to keep phone + addresses (law 18-07); creates the customer by phone if new. */
    recordConsent: (input: ConsentInput): Promise<CustomerRecord> => ipcRenderer.invoke('customers:recordConsent', input),
    /** v4: consent withdrawn — deletes saved addresses, clears consent. */
    withdrawConsent: (customerId: number): Promise<CustomerRecord> => ipcRenderer.invoke('customers:withdrawConsent', customerId)
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
  },
  // ==================== v4 FISCAL: journal, archive, attestation / channels / availability ====================
  // Orders carry `fiscal_number` (gapless, printed "N° fiscal") and `channel`; menu reads carry
  // `channel_prices` ({ [channel]: price }) and `available_now` (1 | 0). Types: src/shared/{fiscal,channels,availability}.ts
  fiscal: {
    getStatus: (): Promise<FiscalStatus> => ipcRenderer.invoke('fiscal:getStatus'),
    /** Re-hashes the whole journal and every journaled order (can take a few seconds on big databases). */
    verify: (): Promise<JournalVerification> => ipcRenderer.invoke('fiscal:verify'),
    getVendorInfo: (): Promise<VendorInfo> => ipcRenderer.invoke('fiscal:getVendorInfo'),
    saveVendorInfo: (patch: Partial<VendorInfo>): Promise<VendorInfo> => ipcRenderer.invoke('fiscal:saveVendorInfo', patch),
    /** Opens a folder picker; one sub-folder per year (JSON + CSV + manifest with SHA-256). Omit years = all. */
    exportArchive: (years?: number[]): Promise<ArchiveExportResult> => ipcRenderer.invoke('fiscal:exportArchive', years),
    /** The attestation TEMPLATE as HTML (preview). */
    attestationHtml: (lang: AttestationLang): Promise<string> => ipcRenderer.invoke('fiscal:attestationHtml', lang),
    /** Save dialog → PDF of the attestation TEMPLATE. */
    saveAttestationPdf: (lang: AttestationLang): Promise<AttestationResult> => ipcRenderer.invoke('fiscal:saveAttestationPdf', lang),
    /** Shows an exported file / folder of this session in Explorer. */
    reveal: (path: string): Promise<boolean> => ipcRenderer.invoke('fiscal:reveal', path)
  },
  channels: {
    list: (): Promise<SalesChannel[]> => ipcRenderer.invoke('channels:list'),
    /** Replaces the delivery platform list (Yassir can be disabled, never removed). */
    savePlatforms: (platforms: CustomPlatformInput[]): Promise<SalesChannel[]> => ipcRenderer.invoke('channels:savePlatforms', platforms),
    getItemPrices: (menuItemId: number): Promise<ChannelPrices> => ipcRenderer.invoke('channels:getItemPrices', menuItemId),
    /** Full replace: a channel left out (or null) sells at the menu price. */
    setItemPrices: (menuItemId: number, prices: Record<string, number | null>): Promise<ChannelPrices> =>
      ipcRenderer.invoke('channels:setItemPrices', menuItemId, prices)
  },
  availability: {
    get: (target: AvailabilityTarget): Promise<AvailabilityState> => ipcRenderer.invoke('availability:get', target),
    /** Full replace of the target's rules ([] = always available). */
    set: (target: AvailabilityTarget, rules: AvailabilityRule[]): Promise<AvailabilityState> =>
      ipcRenderer.invoke('availability:set', target, rules),
    getEnforce: (): Promise<AvailabilityEnforce> => ipcRenderer.invoke('availability:getEnforce'),
    setEnforce: (mode: AvailabilityEnforce): Promise<AvailabilityEnforce> => ipcRenderer.invoke('availability:setEnforce', mode)
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
