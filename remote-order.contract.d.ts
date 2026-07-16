/**
 * Test-only seams required by the frozen WP-G acceptance suites.
 *
 * Production route exports (`POST` and `GET`) remain the framework entry points.  The
 * factories below must use the same production code path and exist solely to make
 * clocks, randomness, Supabase, and POS side effects deterministic in node --test.
 */

export interface RemoteOrderRouteDeps {
  supabase: any
  now: () => Date
  getClientIp: (request: Request) => string
  randomBytes: (length: number) => Uint8Array
  sha256Hex: (value: string) => string
}

export interface RemoteOrderRouteHandlers {
  POST(request: Request): Promise<Response>
}

export interface RemoteOrderStatusHandlers {
  GET(request: Request): Promise<Response>
}

/** Export from admin/app/api/remote-order/route.ts. */
export function createRemoteOrderRoute(deps: RemoteOrderRouteDeps): RemoteOrderRouteHandlers

/** Export from admin/app/api/remote-order/status/route.ts. */
export function createRemoteOrderStatusRoute(deps: Pick<RemoteOrderRouteDeps, 'supabase' | 'now' | 'sha256Hex'>): RemoteOrderStatusHandlers

export interface CreateRemoteOrderInput {
  source: 'remote'
  sourceRequestId: string
  orderType: 'local' | 'takeout' | 'delivery'
  tableNumber?: string
  lines: Array<{ menuItemId: number, quantity: number, unitPriceOverride?: never }>
  customer?: { name?: string, phone?: string }
  note?: string
  applyAutoPromotions: boolean
}

export interface RemoteOrderListenerDeps {
  supabase: any
  machineId: string
  now: () => Date
  createOrder(input: CreateRemoteOrderInput): { ok: true, duplicate: boolean, orderId: number, dailyNumber: number } | { ok: false, code: string, message: string }
  broadcastQueue(): void
  /** The listener must show only still-submitted, unexpired rows to this callback. */
  present?(row: any): void
}

export interface RemoteOrderListener {
  /** Performs the startup/poll sweep once; no timers or network are started. */
  pollOnce(): Promise<void>
  accept(id: string): Promise<void>
  reject(id: string, reason?: string): Promise<void>
}

/** Export from src/main/sync/remote-order-listener.ts. */
export function createRemoteOrderListener(deps: RemoteOrderListenerDeps): RemoteOrderListener
