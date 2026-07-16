/**
 * WP-G — POS remote-order listener (CONTRACT §2.4 + ADDENDUM #2/#3, red-team hardened).
 *
 * Staff-approved model: cloud rows in `remote_orders_v2` are REQUESTS, not orders.
 * This module polls `submitted` rows for this machine, presents them to the POS
 * inbox, and only on explicit staff ACCEPT — after a successful conditional cloud
 * CLAIM — calls the WP-F order service (source:'remote', sourceRequestId =
 * client_request_id) exactly once. Reject/expire have ZERO local effects.
 *
 * Claim/crash safety (red-team findings #2/#4):
 * - Preferred claim is the DB-side atomic RPC `remote_order_claim` (machine
 *   ownership + status + DB-clock TTL + catalog revision verified server-side).
 *   When the RPC is unavailable (frozen test fakes / pre-deploy), the fallback is
 *   a conditional table update carrying the same predicates client-side.
 * - A claimed row has status='accepted' with daily_number NULL; the status
 *   capability endpoint reports such rows as still 'submitted', so customers
 *   never see a confirmation before the local order durably commits.
 * - `createOrder` may THROW (WP-F rethrows SQLITE_BUSY/FULL): a throw or ok:false
 *   reverts the claim to 'submitted' (attempt counted). If the revert itself
 *   fails or the process crashes, the recovery sweep in pollOnce converges the
 *   row via the idempotent (source, source_request_id) key.
 * - Every cloud read/update's {error} is inspected; errors are fail-closed
 *   (no createOrder) and never synthesized into a decision.
 *
 * `createRemoteOrderListener` is the pure, dependency-injected core required by
 * remote-order.contract.d.ts (frozen tests import this file directly under
 * `node --test`, so the module top level must not import electron/supabase).
 */

// ── Contract types (mirrors remote-order.contract.d.ts + CONTRACT §3) ──────────
export interface CreateRemoteOrderInput {
  source: 'remote'
  sourceRequestId: string
  orderType: 'local' | 'takeout' | 'delivery'
  tableNumber?: string
  lines: Array<{ menuItemId: number; quantity: number }>
  customer?: { name?: string; phone?: string }
  note?: string
  applyAutoPromotions: boolean
}

export type CreateRemoteOrderResult =
  | { ok: true; duplicate: boolean; orderId: number; dailyNumber: number }
  | { ok: false; code: string; message: string }

export interface RemoteOrderListenerDeps {
  supabase: any
  machineId: string
  now: () => Date
  createOrder(input: CreateRemoteOrderInput): CreateRemoteOrderResult
  broadcastQueue(): void
  /** Only still-submitted, unexpired rows are shown to this callback. */
  present?(row: any): void
  /**
   * ADDENDUM #3 accept-time catalog revision source (table-fallback path only —
   * the claim RPC verifies revision server-side). Semantics:
   * - provided and returns a finite number → compared against the quote;
   * - provided and THROWS or returns null → accept FAILS CLOSED (no claim);
   * - absent → falls back to a `current_catalog_revision` field on the row
   *   (frozen-test seam); if neither exists the check is skipped.
   */
  getCatalogRevision?(): number | null | Promise<number | null>
}

export type AcceptOutcome =
  | { outcome: 'accepted'; dailyNumber: number; duplicate: boolean }
  | { outcome: 'lost_race' | 'expired' | 'revision_changed' | 'not_found' | 'failed'; message?: string }

export interface RemoteOrderListener {
  /** One startup/poll sweep; no timers or network subscriptions are started. */
  pollOnce(): Promise<void>
  accept(id: string): Promise<AcceptOutcome>
  reject(id: string, reason?: string): Promise<void>
}

const POLL_BATCH = 10
/** A claimed-but-unfinalized row older than this is presumed crashed and is
 *  converged by the recovery sweep (idempotent via source_request_id). */
const CLAIM_RECOVERY_MS = 90_000

/**
 * Awaits a Supabase query builder via its own `.then()` return value. Some clients
 * (and the frozen test fakes) return a detached promise from `.then()` when the
 * transport fails — consuming that return value is the only way to observe the
 * rejection without leaving an unhandled rejection behind.
 */
function runQuery(query: any): Promise<any> {
  return query.then(
    (value: any) => value,
    (err: any) => Promise.reject(err)
  )
}

export function createRemoteOrderListener(deps: RemoteOrderListenerDeps): RemoteOrderListener {
  const table = () => deps.supabase.from('remote_orders_v2')
  const nowIso = () => deps.now().toISOString()

  function buildCreateInput(row: any): CreateRemoteOrderInput {
    const items: any[] = Array.isArray(row.items) ? row.items : []
    return {
      source: 'remote',
      sourceRequestId: String(row.client_request_id),
      orderType: row.order_type,
      tableNumber: row.table_number ?? undefined,
      lines: items.map((item) => ({
        menuItemId: Number(item?.menuItemId ?? item?.menu_item_id),
        quantity: Number(item?.quantity)
      })),
      customer: {
        name: row.customer_name ?? undefined,
        phone: row.customer_phone ?? undefined
      },
      note: row.note ?? undefined,
      applyAutoPromotions: true
    }
  }

  /** createOrder may THROW (SQLITE_BUSY/FULL are rethrown by WP-F) — normalize. */
  function runCreateOrder(row: any): CreateRemoteOrderResult {
    try {
      return deps.createOrder(buildCreateInput(row))
    } catch (err) {
      return {
        ok: false,
        code: 'db_failure',
        message: err instanceof Error ? err.message : String(err)
      }
    }
  }

  /** Write the real daily number back; returns true when the cloud write stuck. */
  async function finalizeDailyNumber(id: string, dailyNumber: number): Promise<boolean> {
    const { error } = await runQuery(
      table().update({ daily_number: dailyNumber }).eq('id', id).select()
    )
    if (error) {
      // Local order exists; the recovery sweep converges this row next cycle.
      console.error('[RemoteOrder] CRITICAL: daily-number write-back failed:', error)
      return false
    }
    return true
  }

  /** Revert a claim so the request becomes decidable again (attempt counted). */
  async function revertClaim(id: string, priorAttempts: number): Promise<void> {
    const { error } = await runQuery(
      table()
        .update({
          status: 'submitted',
          decided_at: null,
          accept_attempts: Number(priorAttempts ?? 0) + 1
        })
        .eq('id', id)
        .eq('status', 'accepted')
        .select()
    )
    if (error) {
      // Row stays claimed; the recovery sweep converges it (idempotent create).
      console.error('[RemoteOrder] CRITICAL: claim revert failed:', error)
    }
  }

  async function pollOnce(): Promise<void> {
    try {
      // TTL-expire stale rows first — but ONLY issue the update when something is
      // actually stale, so a quiet poll performs zero cloud writes.
      const { data: stale, error: staleError } = await runQuery(
        table()
          .select()
          .eq('machine_id', deps.machineId)
          .eq('status', 'submitted')
          .lt('expires_at', nowIso())
      )
      if (!staleError && Array.isArray(stale) && stale.length > 0) {
        const { error: expireError } = await runQuery(
          table()
            .update({ status: 'expired', decided_at: nowIso() })
            .eq('machine_id', deps.machineId)
            .eq('status', 'submitted')
            .lt('expires_at', nowIso())
            .select()
        )
        if (expireError) console.error('[RemoteOrder] TTL expiry sweep failed:', expireError)
      }

      // Poll ONLY submitted + unexpired, oldest first, max 10/cycle (CONTRACT §2.4).
      const { data: fresh, error: freshError } = await runQuery(
        table()
          .select()
          .eq('machine_id', deps.machineId)
          .eq('status', 'submitted')
          .gt('expires_at', nowIso())
          .order('created_at', { ascending: true })
          .limit(POLL_BATCH)
      )
      if (!freshError) {
        for (const row of Array.isArray(fresh) ? fresh : []) {
          deps.present?.(row)
        }
      }

      await recoverStuckClaims()
    } catch (err) {
      // Offline / cloud failure = no local effects, rows stay submitted.
      console.error('[RemoteOrder] pollOnce failed (will retry):', err)
    }
  }

  /**
   * Crash recovery (finding #4): a row claimed (status='accepted') whose
   * daily_number was never written means the process died between claim and
   * local commit/finalize. Staff already approved it, so converge it via the
   * IDEMPOTENT createOrder keyed by (source, source_request_id): if the local
   * order committed pre-crash this returns duplicate:true with zero repeated
   * effects; if it never committed it is created now. Permanent local failures
   * release the claim back to 'submitted' for a fresh staff decision.
   */
  async function recoverStuckClaims(): Promise<void> {
    const { data: claimedRows, error } = await runQuery(
      table().select().eq('machine_id', deps.machineId).eq('status', 'accepted')
    )
    if (error || !Array.isArray(claimedRows)) return
    for (const row of claimedRows) {
      if (row?.daily_number != null) continue
      if (!row?.decided_at) continue
      if (deps.now().getTime() - new Date(row.decided_at).getTime() < CLAIM_RECOVERY_MS) continue
      try {
        const result = runCreateOrder(row)
        if (result.ok) {
          const finalized = await finalizeDailyNumber(row.id, result.dailyNumber)
          if (finalized) deps.broadcastQueue()
        } else if (result.code !== 'db_failure') {
          // Permanent local rejection (e.g. item deleted) — release the claim.
          await revertClaim(row.id, Number(row.accept_attempts ?? 0))
        }
        // db_failure: infra still down; leave claimed and retry next sweep.
      } catch (err) {
        console.error('[RemoteOrder] claim recovery failed for', row?.id, err)
      }
    }
  }

  /** DB-side atomic claim (preferred). Returns 'unavailable' when the RPC cannot
   *  be used (no rpc surface / function not deployed) so the caller falls back. */
  async function claimViaRpc(
    id: string
  ): Promise<
    | { mode: 'rpc'; outcome: string; row?: any }
    | { mode: 'unavailable' }
    | { mode: 'error'; message: string }
  > {
    if (typeof deps.supabase?.rpc !== 'function') return { mode: 'unavailable' }
    try {
      const { data, error } = await runQuery(
        deps.supabase.rpc('remote_order_claim', {
          p_order_id: id,
          p_machine_id: deps.machineId
        })
      )
      if (error) {
        const code = String(error.code ?? '')
        // Function not deployed yet → use the conditional-table fallback.
        if (code === 'PGRST202' || code === '42883' || /find the function/i.test(String(error.message ?? ''))) {
          return { mode: 'unavailable' }
        }
        return { mode: 'error', message: String(error.message ?? code) }
      }
      const payload = Array.isArray(data) ? data[0] : data
      if (!payload || typeof payload.outcome !== 'string') {
        return { mode: 'error', message: 'malformed claim response' }
      }
      return { mode: 'rpc', outcome: payload.outcome, row: payload.row }
    } catch (err) {
      return { mode: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  async function accept(id: string): Promise<AcceptOutcome> {
    try {
      let claimedRow: any = null

      const rpcClaim = await claimViaRpc(id)
      if (rpcClaim.mode === 'error') {
        // Inconclusive cloud state — FAIL CLOSED, no createOrder.
        return { outcome: 'failed', message: rpcClaim.message }
      }
      if (rpcClaim.mode === 'rpc') {
        switch (rpcClaim.outcome) {
          case 'claimed':
            claimedRow = rpcClaim.row
            if (!claimedRow) return { outcome: 'failed', message: 'claim returned no row' }
            break
          case 'not_found':
            return { outcome: 'not_found' }
          case 'expired':
            return { outcome: 'expired' }
          case 'revision_changed':
            return { outcome: 'revision_changed' }
          case 'lost_race':
            return { outcome: 'lost_race' }
          default:
            return { outcome: 'failed', message: `unknown claim outcome: ${rpcClaim.outcome}` }
        }
      } else {
        // ── Conditional-table fallback (frozen-test surface) ────────────────────
        const { data: row, error: fetchError } = await runQuery(
          table().select().eq('id', id).eq('machine_id', deps.machineId).maybeSingle()
        )
        if (fetchError) return { outcome: 'failed', message: String(fetchError.message ?? fetchError) }
        if (!row) return { outcome: 'not_found' }

        // TTL guard: a stale request expires with zero local effects.
        if (row.expires_at && deps.now().getTime() >= new Date(row.expires_at).getTime()) {
          await runQuery(
            table()
              .update({ status: 'expired', decided_at: nowIso() })
              .eq('id', id)
              .eq('status', 'submitted')
              .select()
          )
          return { outcome: 'expired' }
        }

        // ADDENDUM #3: catalog revision changed since the quote → expire, zero
        // effects. A configured-but-unavailable revision source FAILS CLOSED.
        let currentRevision: number | null = null
        if (deps.getCatalogRevision) {
          const value = await deps.getCatalogRevision() // a throw fails the accept closed
          if (value == null || !Number.isFinite(Number(value))) {
            return { outcome: 'failed', message: 'current catalog revision unavailable' }
          }
          currentRevision = Number(value)
        } else if (row.current_catalog_revision != null) {
          currentRevision = Number(row.current_catalog_revision)
        }
        if (currentRevision != null && currentRevision !== Number(row.quote_revision)) {
          await runQuery(
            table()
              .update({ status: 'expired', rejected_reason: 'revision_changed', decided_at: nowIso() })
              .eq('id', id)
              .eq('status', 'submitted')
              .select()
          )
          return { outcome: 'revision_changed' }
        }

        // ADDENDUM #2: conditional CLAIM before create. `WHERE status='submitted'`
        // updating zero rows = a lost race (already decided/expired) and MUST NOT
        // call createOrder — this is what makes accept-twice single-order. The
        // claim also re-checks machine ownership and TTL as update predicates.
        const { data: claimed, error: claimError } = await runQuery(
          table()
            .update({ status: 'accepted', decided_at: nowIso() })
            .eq('id', id)
            .eq('machine_id', deps.machineId)
            .eq('status', 'submitted')
            .gt('expires_at', nowIso())
            .select()
        )
        if (claimError) {
          return { outcome: 'failed', message: String(claimError.message ?? claimError) }
        }
        const claimedCount = Array.isArray(claimed) ? claimed.length : claimed ? 1 : 0
        if (claimedCount === 0) return { outcome: 'lost_race' }
        claimedRow = row
      }

      // ── Claimed: create the local order (single WP-F transaction) ────────────
      const result = runCreateOrder(claimedRow)
      if (!result.ok) {
        // Throw/failure → revert the claim so the request is decidable again
        // (attempt counted). No partial local effects exist.
        await revertClaim(id, Number(claimedRow.accept_attempts ?? 0))
        return { outcome: 'failed', message: result.message }
      }

      // Write the REAL POS daily number back (customers see 'accepted' only once
      // this lands — accepted-without-number reads as still pending), then wake
      // the LAN displays.
      await finalizeDailyNumber(id, result.dailyNumber)
      deps.broadcastQueue()
      return { outcome: 'accepted', dailyNumber: result.dailyNumber, duplicate: result.duplicate }
    } catch (err) {
      console.error('[RemoteOrder] accept failed:', err)
      return { outcome: 'failed', message: err instanceof Error ? err.message : String(err) }
    }
  }

  async function reject(id: string, reason?: string): Promise<void> {
    try {
      // Zero local effects — no stock, no print, no loyalty, no broadcast.
      const { error } = await runQuery(
        table()
          .update({ status: 'rejected', rejected_reason: reason ?? null, decided_at: nowIso() })
          .eq('id', id)
          .eq('machine_id', deps.machineId)
          .eq('status', 'submitted')
          .select()
      )
      if (error) console.error('[RemoteOrder] reject write failed:', error)
    } catch (err) {
      console.error('[RemoteOrder] reject failed:', err)
    }
  }

  return { pollOnce, accept, reject }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Production wiring (Electron main). Everything below uses lazy dynamic imports so
// that `node --test` can import the factory above without electron/supabase.
// ═══════════════════════════════════════════════════════════════════════════════

const POLL_INTERVAL_MS = 5000

let stopped = true
let pollTimer: ReturnType<typeof setInterval> | null = null
let isPolling = false
let listener: RemoteOrderListener | null = null
let mainWinRef: any = null
let pendingRows: any[] = []
let lastPendingJson = ''
let machineIdRef = ''
let resolvedCreateOrder: ((input: CreateRemoteOrderInput) => CreateRemoteOrderResult) | null = null

/**
 * WP-F order service adapter (red-team finding #6): targets WP-F's
 * `createOrderService({ db })` factory (with a legacy `createOrder` fallback).
 * TODO(WP-F integration): replace the non-literal dynamic import below with a
 * STATIC `import { createOrderService } from '../services/order-service'` once
 * the module lands in-tree — electron-vite does not bundle this shim form, so
 * flipping to the static import is REQUIRED at integration. Until the module
 * exists, accepts are refused with a clear error and NO cloud claim occurs.
 */
async function resolveCreateOrder(): Promise<((input: CreateRemoteOrderInput) => CreateRemoteOrderResult) | null> {
  if (resolvedCreateOrder) return resolvedCreateOrder
  try {
    const specifier = '../services/' + 'order-service'
    const mod: any = await import(/* @vite-ignore */ specifier)
    if (typeof mod?.createOrderService === 'function') {
      const { getDb } = await import('../database/connection')
      const service = mod.createOrderService({ db: getDb() })
      if (typeof service?.createOrder === 'function') {
        resolvedCreateOrder = (input) => service.createOrder(input)
        return resolvedCreateOrder
      }
    }
    if (typeof mod?.createOrder === 'function') {
      resolvedCreateOrder = mod.createOrder
      return resolvedCreateOrder
    }
    return null
  } catch {
    return null
  }
}

async function resolveBroadcastQueue(): Promise<() => void> {
  try {
    const mod: any = await import('../tablet/server')
    if (typeof mod?.broadcastQueue === 'function') return mod.broadcastQueue
  } catch {
    /* tablet server unavailable — broadcast becomes a no-op */
  }
  return () => {}
}

/**
 * Accept-time catalog revision for the table-fallback path: the LOCAL mirror of
 * the last successfully pushed cloud quote_revision (written by cloud-sync's
 * menu push). Throws when unknown — the accept then FAILS CLOSED rather than
 * accepting a quote that cannot be verified against the live catalog.
 */
async function fetchCurrentCatalogRevision(): Promise<number | null> {
  const { settingsRepo } = await import('../database/repositories/settings.repo')
  const raw = settingsRepo.get('menu_quote_revision')
  const value = raw == null || raw === '' ? NaN : Number(raw)
  if (!Number.isFinite(value)) {
    throw new Error('Catalog revision unknown — menu has not been synced to the cloud yet')
  }
  return value
}

function publishPending(rows: any[]): void {
  pendingRows = rows
  const json = JSON.stringify(rows.map((row) => row?.id))
  if (json !== lastPendingJson) {
    lastPendingJson = json
    try {
      mainWinRef?.webContents?.send('remoteInbox:changed', pendingRows)
    } catch {
      /* window gone */
    }
  }
}

export function startRemoteOrderListener(win: unknown): void {
  stopped = false
  mainWinRef = win
  void (async () => {
    try {
      const [{ getClient }, { getMachineId }] = await Promise.all([
        import('../activation/cloud'),
        import('../activation/activation')
      ])
      const broadcastQueue = await resolveBroadcastQueue()
      machineIdRef = getMachineId()

      const collected: any[] = []
      const pollCreateOrder = (input: CreateRemoteOrderInput): CreateRemoteOrderResult => {
        // Recovery sweep path: use the real service when it is available, and
        // report an infra failure (retry next sweep) when it is not.
        if (resolvedCreateOrder) return resolvedCreateOrder(input)
        return { ok: false, code: 'db_failure', message: 'order service not integrated yet' }
      }
      listener = createRemoteOrderListener({
        supabase: new Proxy(
          {},
          {
            // Always use a FRESH client (endpoints/config may re-resolve) without
            // rebuilding the listener: delegate property access per call.
            get(_target, prop) {
              const client = getClient()
              const value = (client as any)?.[prop]
              return typeof value === 'function' ? value.bind(client) : value
            }
          }
        ),
        machineId: machineIdRef,
        now: () => new Date(),
        createOrder: pollCreateOrder,
        broadcastQueue,
        present: (row) => {
          collected.push(row)
        },
        getCatalogRevision: fetchCurrentCatalogRevision
      })
      // Warm the adapter so the recovery sweep can converge crashed claims early.
      void resolveCreateOrder()
      // Swap in a wrapper so each poll gets a clean `present` batch.
      const core = listener
      listener = {
        pollOnce: async () => {
          collected.length = 0
          await core.pollOnce()
          publishPending([...collected])
        },
        accept: async (id: string) => {
          const createOrder = await resolveCreateOrder()
          if (!createOrder) {
            return {
              outcome: 'failed',
              message: 'Order service unavailable (WP-F not integrated)'
            } as AcceptOutcome
          }
          const accepting = createRemoteOrderListener({
            supabase: getClient(),
            machineId: machineIdRef,
            now: () => new Date(),
            createOrder,
            broadcastQueue,
            getCatalogRevision: fetchCurrentCatalogRevision
          })
          const outcome = await accepting.accept(id)
          if (outcome.outcome === 'accepted') {
            // Keep the existing OrderScreen badge/list refresh path alive.
            try {
              mainWinRef?.webContents?.send('remote:new-order', { dailyNumber: outcome.dailyNumber })
            } catch { /* window gone */ }
          }
          await listener?.pollOnce()
          return outcome
        },
        reject: async (id: string, reason?: string) => {
          const rejecting = createRemoteOrderListener({
            supabase: getClient(),
            machineId: machineIdRef,
            now: () => new Date(),
            createOrder: () => ({ ok: false, code: 'invalid_input', message: 'reject path never creates' }),
            broadcastQueue,
            getCatalogRevision: fetchCurrentCatalogRevision
          })
          await rejecting.reject(id, reason)
          await listener?.pollOnce()
        }
      }

      // Register the inbox IPC surface (kept inside WP-G file boundaries; the
      // orchestrator may move this call into ipc/index.ts at integration).
      try {
        const ipc: any = await import('../ipc/remote-inbox.ipc')
        ipc.registerRemoteInboxHandlers?.()
      } catch (err) {
        console.error('[RemoteOrder] inbox IPC registration failed:', err)
      }

      if (stopped) return
      await listener.pollOnce()
      pollTimer = setInterval(() => {
        if (stopped || isPolling || !listener) return
        isPolling = true
        listener
          .pollOnce()
          .catch(() => {})
          .finally(() => {
            isPolling = false
          })
      }, POLL_INTERVAL_MS)
    } catch (err) {
      console.error('[RemoteOrder] listener startup failed:', err)
    }
  })()
}

export function stopRemoteOrderListener(): void {
  stopped = true
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
  listener = null
  pendingRows = []
  lastPendingJson = ''
  mainWinRef = null
}

// ── Surface consumed by src/main/ipc/remote-inbox.ipc.ts ───────────────────────
export function getPendingRemoteOrders(): any[] {
  return pendingRows
}

export async function acceptRemoteOrder(id: string): Promise<AcceptOutcome> {
  if (stopped || !listener) return { outcome: 'failed', message: 'Remote-order listener not running' }
  return listener.accept(String(id))
}

export async function rejectRemoteOrder(id: string, reason?: string): Promise<{ ok: boolean }> {
  if (stopped || !listener) return { ok: false }
  await listener.reject(String(id), reason)
  return { ok: true }
}

// ── Per-restaurant flag (red-team finding #5) ──────────────────────────────────
// The cloud RPCs are service_role-only; the desktop reaches them EXCLUSIVELY via
// the admin endpoint /api/remote-order/settings, authenticated with the WP-D
// device access token. Until WP-D lands, getDeviceAccessToken() returns null and
// both calls FAIL CLOSED (pendingIntegration) — the flag stays at its cloud
// default (OFF), which is the release gate for enabling remote ordering.

// TODO(integration): read from src/main/config/endpoints.ts (CONTRACT §4).
const ADMIN_BASE_URL = 'https://fastfood-manager.vercel.app'

/** TODO(WP-D integration): return the cached device ACCESS token (typ 'access',
 *  CONTRACT §1.3) from the license client. FAILS CLOSED (null) until wired. */
async function getDeviceAccessToken(): Promise<string | null> {
  return null
}

export interface RemoteOrderingFlagStatus {
  ok: boolean
  enabled: boolean
  pendingIntegration?: boolean
}

export async function getRemoteOrderingEnabled(): Promise<RemoteOrderingFlagStatus> {
  try {
    const token = await getDeviceAccessToken()
    if (!token || !machineIdRef) return { ok: false, enabled: false, pendingIntegration: true }
    const res = await fetch(
      `${ADMIN_BASE_URL}/api/remote-order/settings?machineId=${encodeURIComponent(machineIdRef)}`,
      { headers: { authorization: `Bearer ${token}` } }
    )
    if (!res.ok) return { ok: false, enabled: false, pendingIntegration: res.status === 401 }
    const data: any = await res.json()
    return { ok: true, enabled: data?.enabled === true }
  } catch {
    return { ok: false, enabled: false }
  }
}

export async function setRemoteOrderingEnabled(enabled: boolean): Promise<{ ok: boolean; pendingIntegration?: boolean }> {
  try {
    const token = await getDeviceAccessToken()
    if (!token || !machineIdRef) return { ok: false, pendingIntegration: true }
    const res = await fetch(`${ADMIN_BASE_URL}/api/remote-order/settings`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ machineId: machineIdRef, enabled: enabled === true })
    })
    if (!res.ok) return { ok: false, pendingIntegration: res.status === 401 }
    return { ok: true }
  } catch {
    return { ok: false }
  }
}
