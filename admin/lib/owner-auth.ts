import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { supabase as supabaseClient } from '@/lib/supabase'
import { formatAlgiersDate, algiersDaysAgo } from '@/lib/dates'
import { type ThrottleRow, type ThrottleScope } from '@/lib/rate-limit'
import { COOKIE_NAME } from '@/lib/auth'

/**
 * Owner/admin remote-credential auth: route handler factories + the production Supabase-backed
 * adapter. The factories mirror the frozen seam in admin/tests/auth/auth.contract.d.ts (types are
 * re-declared here, not imported, so production code never depends on the tests/ tree). Each
 * owner route module (app/api/owner/verify-pin, /data, /stats) re-exports the matching factory
 * and wires it to real dependencies; the acceptance tests inject a mocked `OwnerAuthSupabase`
 * and call the factories directly.
 *
 * Security-review pass (cross-vendor review, see CONTRACT adjudication): the throttle gate used
 * to be read-then-write (getThrottle → compute in the caller → saveThrottle), which is exactly
 * the shape of the two races it enabled — N concurrent requests all read the same failure_count
 * before any of them writes, so the lock never engages under a real burst, and worse, all N still
 * ran bcrypt (a CPU-cost hash) before any of that mattered. `takeThrottleAttempt` replaces both
 * calls with a single atomic reservation (a Postgres RPC in production; see
 * supabase/migrations/0005_owner_auth.sql) that gates BOTH scopes BEFORE bcrypt ever runs, and
 * every throttle failure now fails CLOSED (503) instead of open.
 */

// ── Shared contract types (see auth.contract.d.ts) ──────────────────────────

export type SessionCheck =
  | { ok: true; machineId: string; credentialVersion?: string }
  | { ok: false; reason: 'missing' | 'expired' | 'invalid' | 'wrong_machine' }

export type AuthThrottleRow = ThrottleRow

export interface ThrottleAttemptResult {
  allowed: boolean
  /** Whole seconds remaining on whichever scope is locked. 0 when `allowed` is true. */
  retryAfterSeconds: number
  machine: AuthThrottleRow
  ip: AuthThrottleRow
}

export interface OwnerAuthSupabase {
  calls?: Array<{ operation: string; table: string; [key: string]: unknown }>
  getOwnerCredential(machineId: string): Promise<{ credential_hash: string; updatedAt?: string } | null>
  /**
   * Atomically reserves one login attempt across BOTH the machine and IP throttle scopes in a
   * single round-trip, gating BEFORE any credential comparison. This MUST be an atomic operation
   * (a single Postgres statement/RPC in production, not a separate read followed by a separate
   * write) — a non-atomic version of this call is precisely the race it exists to close.
   */
  takeThrottleAttempt(machineKey: string, ipKey: string, now: Date): Promise<ThrottleAttemptResult>
  clearThrottle(scope: ThrottleScope, key: string): Promise<void>
  queryOwnerData?(machineId: string, date: string): Promise<unknown>
  queryOwnerStats?(machineId: string, period: string): Promise<unknown>
  /** Not part of the frozen test contract; used only by the admin credential-reset endpoint. */
  setOwnerCredential?(machineId: string, credentialHash: string): Promise<void>
}

export interface OwnerRouteDependencies {
  appOrigin: string
  supabase: OwnerAuthSupabase
  now: () => Date
  compareCredential(credential: string, credentialHash: string): Promise<boolean> | boolean
  /**
   * `credentialVersion` is an additive, optional parameter (safe under structural typing — a
   * mock/implementation that ignores it, like the frozen tests', still satisfies this type) used
   * to stamp the owner credential's current version into the minted session, so a later
   * credential reset can invalidate sessions minted under the old one. See `SessionCheck` below.
   */
  createOwnerSession(machineId: string, credentialVersion?: string): Promise<string>
  ownerCookieName(machineId: string): string
  getOwnerSessionToken(request: Request, machineId: string): string | undefined
  verifyOwnerSession(token: string | undefined, machineId: string): Promise<SessionCheck> | SessionCheck
}

export const MIN_CREDENTIAL_LENGTH = 8
const MAX_CREDENTIAL_LENGTH = 256
const OWNER_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 // 24h ceiling, frozen by session_cookie_flags

// ── CSRF (Origin / Sec-Fetch-Site) ──────────────────────────────────────────

/**
 * Same-origin check for mutating admin/owner routes. `Origin` is sent by every modern browser on
 * a fetch/XHR/form POST (same-origin or cross-origin) and is the primary signal; when it is
 * absent we fall back to rejecting an explicitly cross-site `Sec-Fetch-Site`. Requests bearing
 * neither header (no cross-origin browser signal at all) are allowed through.
 */
export function isSameOriginRequest(request: Request, appOrigin: string): boolean {
  const origin = request.headers.get('origin')
  if (origin) return origin === appOrigin
  const secFetchSite = request.headers.get('sec-fetch-site')
  if (secFetchSite) return secFetchSite === 'same-origin'
  return true
}

function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  return request.headers.get('x-real-ip')?.trim() || 'unknown'
}

async function readJsonBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const value = await request.json()
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
  } catch {
    return null
  }
}

function sessionFailureStatus(reason: Extract<SessionCheck, { ok: false }>['reason']): number {
  return reason === 'wrong_machine' ? 403 : 401
}

// ── Route handler factories ─────────────────────────────────────────────────

/** Required export from `app/api/owner/verify-pin/route.ts`. */
export function createVerifyOwnerCredentialHandler(deps: OwnerRouteDependencies) {
  return async (request: Request): Promise<Response> => {
    if (!isSameOriginRequest(request, deps.appOrigin)) {
      return NextResponse.json({ error: 'cross_origin_rejected' }, { status: 403 })
    }

    const body = await readJsonBody(request)
    const machineId = typeof body?.machineId === 'string' ? body.machineId : ''
    // Only `credential` is ever honored — a `pin` field (the retired tablet 4-digit PIN) is
    // silently ignored, never read, never compared against anything.
    const credential = typeof body?.credential === 'string' ? body.credential : ''

    // Length is validated before ANY storage/hashing touch (including a throttle read), so a
    // malformed request never counts against — or even reads — the durable throttle state.
    if (!machineId || credential.length < MIN_CREDENTIAL_LENGTH || credential.length > MAX_CREDENTIAL_LENGTH) {
      return NextResponse.json({ error: 'invalid_credential' }, { status: 400 })
    }

    const now = deps.now()
    const ip = clientIp(request)

    // The gate runs BEFORE bcrypt, and is a single atomic reservation across both scopes — see
    // the interface doc on `takeThrottleAttempt`. Any failure here fails CLOSED: a throttle-table
    // outage must never let a request fall through to the credential comparison unthrottled.
    let attempt: ThrottleAttemptResult
    try {
      attempt = await deps.supabase.takeThrottleAttempt(machineId, ip, now)
    } catch {
      return NextResponse.json({ error: 'owner_login_unavailable' }, { status: 503 })
    }

    if (!attempt.allowed) {
      // A correct credential during a lock is refused too — the gate resolves before any
      // credential lookup or comparison, so it cannot be bypassed by supplying the right value.
      const retryAfter = Math.max(1, Math.round(attempt.retryAfterSeconds))
      return NextResponse.json(
        { error: 'locked', retryAfter },
        { status: 429, headers: { 'Retry-After': String(retryAfter) } }
      )
    }

    let stored: { credential_hash: string; updatedAt?: string } | null
    try {
      stored = await deps.supabase.getOwnerCredential(machineId)
    } catch {
      return NextResponse.json({ error: 'owner_login_unavailable' }, { status: 503 })
    }
    if (!stored) {
      return NextResponse.json({ error: 'setup_required' }, { status: 403 })
    }

    const valid = await deps.compareCredential(credential, stored.credential_hash)
    if (!valid) {
      // Nothing more to persist: `takeThrottleAttempt` already recorded this attempt atomically
      // before bcrypt ran, so there is no separate post-hoc write (and so no separate race).
      return NextResponse.json({ error: 'invalid_credential' }, { status: 401 })
    }

    try {
      await Promise.all([
        deps.supabase.clearThrottle('machine', machineId),
        deps.supabase.clearThrottle('ip', ip)
      ])
    } catch {
      return NextResponse.json({ error: 'owner_login_unavailable' }, { status: 503 })
    }

    let token: string
    try {
      token = await deps.createOwnerSession(machineId, stored.updatedAt)
    } catch {
      // Fail closed: a signing-key misconfiguration must never mint a session.
      return NextResponse.json({ error: 'owner_login_unavailable' }, { status: 503 })
    }

    const response = NextResponse.json({ ok: true })
    response.cookies.set(deps.ownerCookieName(machineId), token, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: OWNER_SESSION_MAX_AGE_SECONDS
    })
    return response
  }
}

/**
 * Shared by the data/stats handlers: fetch the credential row (needed for setup_required either
 * way), then — the point of MEDIUM-4 — reject a token minted before the credential was last reset
 * even though it is still cryptographically valid and unexpired. `session.credentialVersion` and
 * `credential.updatedAt` are both optional (the frozen mocks never populate either), so when
 * either is absent the version check is simply skipped — zero behavior change for every test that
 * doesn't exercise this path. `unavailableBody` lets each caller keep its own outage-honesty
 * response shape (`stats`/`orders`/`popularItems` for data, `days` for stats) rather than a
 * lowest-common-denominator body.
 */
async function checkCredential(
  deps: OwnerRouteDependencies,
  machineId: string,
  session: Extract<SessionCheck, { ok: true }>,
  unavailableBody: Record<string, unknown>
): Promise<{ credential: { credential_hash: string; updatedAt?: string } } | { errorResponse: Response }> {
  let credential: { credential_hash: string; updatedAt?: string } | null
  try {
    credential = await deps.supabase.getOwnerCredential(machineId)
  } catch {
    // A credential-READ error is an outage, not "nobody ever configured this machine" — conflating
    // the two would tell a real owner their dashboard needs setup when it's actually just down.
    return { errorResponse: NextResponse.json(unavailableBody, { status: 503 }) }
  }
  if (!credential) {
    return { errorResponse: NextResponse.json({ error: 'setup_required' }, { status: 403 }) }
  }
  if (
    session.credentialVersion !== undefined &&
    credential.updatedAt !== undefined &&
    session.credentialVersion !== credential.updatedAt
  ) {
    // The credential was rotated after this session was minted: treat it like an expired session
    // rather than trusting a JWT whose `cv` claim no longer matches reality.
    return { errorResponse: NextResponse.json({ error: 'expired' }, { status: 401 }) }
  }
  return { credential }
}

/** Required export from `app/api/owner/data/route.ts`. */
export function createOwnerDataHandler(deps: OwnerRouteDependencies) {
  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url)
    const machineId = url.searchParams.get('machineId')
    if (!machineId) {
      return NextResponse.json({ error: 'missing_machine_id' }, { status: 400 })
    }

    const token = deps.getOwnerSessionToken(request, machineId)
    const session = await deps.verifyOwnerSession(token, machineId)
    if (!session.ok) {
      return NextResponse.json({ error: session.reason }, { status: sessionFailureStatus(session.reason) })
    }

    const credentialResult = await checkCredential(deps, machineId, session, {
      error: 'owner_data_unavailable',
      stale: true,
      stats: null,
      orders: [],
      popularItems: []
    })
    if ('errorResponse' in credentialResult) return credentialResult.errorResponse

    const requestedDate = url.searchParams.get('date') || ''
    const date = /^\d{4}-\d{2}-\d{2}$/.test(requestedDate) ? requestedDate : formatAlgiersDate()

    try {
      const data = await deps.supabase.queryOwnerData!(machineId, date)
      return NextResponse.json(data as object)
    } catch {
      // Outage honesty: never fabricate a zero-orders snapshot. `stats: null` (not the real
      // {totalRevenue:0,...} shape) lets the UI keep its last good snapshot with an age label.
      return NextResponse.json(
        { error: 'owner_data_unavailable', stale: true, stats: null, orders: [], popularItems: [] },
        { status: 503 }
      )
    }
  }
}

/** Required export from `app/api/owner/stats/route.ts`. */
export function createOwnerStatsHandler(deps: OwnerRouteDependencies) {
  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url)
    const machineId = url.searchParams.get('machineId')
    const period = url.searchParams.get('period') || 'week'
    if (!machineId) {
      return NextResponse.json({ error: 'missing_machine_id' }, { status: 400 })
    }

    const token = deps.getOwnerSessionToken(request, machineId)
    const session = await deps.verifyOwnerSession(token, machineId)
    if (!session.ok) {
      return NextResponse.json({ error: session.reason }, { status: sessionFailureStatus(session.reason) })
    }

    const credentialResult = await checkCredential(deps, machineId, session, {
      error: 'owner_stats_unavailable',
      stale: true,
      days: null
    })
    if ('errorResponse' in credentialResult) return credentialResult.errorResponse

    try {
      const data = await deps.supabase.queryOwnerStats!(machineId, period)
      return NextResponse.json(data as object)
    } catch {
      return NextResponse.json({ error: 'owner_stats_unavailable', stale: true, days: null }, { status: 503 })
    }
  }
}

/**
 * Required export from `app/api/login/route.ts`; the production POST must use it.
 *
 * Lives here (rather than in lib/auth.ts) so it can share `isSameOriginRequest` with the owner
 * handlers above — the implementer boundary for this work package permits only rate-limit.ts and
 * owner-auth.ts as new admin/lib files.
 */
export function createAdminLoginHandler(dependencies: {
  appOrigin: string
  adminPassword: () => string | undefined
  createSession: () => Promise<string>
}) {
  return async (request: Request): Promise<Response> => {
    if (!isSameOriginRequest(request, dependencies.appOrigin)) {
      return NextResponse.json({ error: 'cross_origin_rejected' }, { status: 403 })
    }

    // Fail closed: an unconfigured (missing/short) admin password must 503, never compare
    // anything or mint a session.
    const expected = dependencies.adminPassword()
    if (!expected || expected.length < 8) {
      return NextResponse.json({ error: 'Admin portal is not configured' }, { status: 503 })
    }

    const body = await readJsonBody(request)
    const password = body?.password
    if (typeof password !== 'string' || password.length === 0 || password.length > 256) {
      return NextResponse.json({ error: 'Invalid password' }, { status: 401 })
    }

    const suppliedBytes = Buffer.from(password)
    const expectedBytes = Buffer.from(expected)
    if (suppliedBytes.length !== expectedBytes.length || !timingSafeEqual(suppliedBytes, expectedBytes)) {
      return NextResponse.json({ error: 'Invalid password' }, { status: 401 })
    }

    let token: string
    try {
      token = await dependencies.createSession()
    } catch {
      // e.g. SESSION_SECRET missing/short: fail closed, never mint a session.
      return NextResponse.json({ error: 'Admin portal is not configured' }, { status: 503 })
    }

    const response = NextResponse.json({ ok: true })
    response.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7 // 7 days
    })
    return response
  }
}

// ── Production Supabase-backed adapter ──────────────────────────────────────

/**
 * Durable adapter over the `owner_credentials` / `auth_throttle` tables (see
 * supabase/migrations/0005_owner_auth.sql). Every read/write goes through Supabase — nothing is
 * cached in process memory, so the throttle survives a serverless cold start or a restart — and
 * every one of them throws on a Supabase-reported error rather than silently treating it as "no
 * row"/"nothing to do": a throttle-table or credential-table outage must fail the request closed,
 * never fail open into an unthrottled/mis-classified state.
 */
export function createOwnerAuthSupabase(): OwnerAuthSupabase {
  return {
    async getOwnerCredential(machineId) {
      const { data, error } = await supabaseClient
        .from('owner_credentials')
        .select('credential_hash, updated_at')
        .eq('machine_id', machineId)
        .maybeSingle()
      if (error) throw new Error('owner credential lookup failed')
      if (!data) return null
      return { credential_hash: data.credential_hash as string, updatedAt: data.updated_at as string | undefined }
    },

    /**
     * Calls the `owner_auth_throttle_take` Postgres function (service_role only — see the
     * migration), which reserves this attempt for BOTH scopes in one statement, BEFORE the
     * caller ever runs bcrypt. Row-level locking inside that function is what makes this safe
     * under real concurrency; a JS-level read-then-write here would simply move the race, not
     * close it.
     */
    async takeThrottleAttempt(machineKey, ipKey, now) {
      const { data, error } = await supabaseClient.rpc('owner_auth_throttle_take', {
        p_machine_key: machineKey,
        p_ip_key: ipKey,
        p_now: now.toISOString()
      })
      if (error) throw new Error('throttle unavailable')
      const row = Array.isArray(data) ? data[0] : data
      if (!row) throw new Error('throttle unavailable')
      return {
        allowed: row.allowed as boolean,
        retryAfterSeconds: Number(row.retry_after_seconds) || 0,
        machine: {
          scope: 'machine',
          key: machineKey,
          failureCount: Number(row.machine_failure_count) || 0,
          lockedUntil: row.machine_locked_until ? new Date(row.machine_locked_until as string) : null
        },
        ip: {
          scope: 'ip',
          key: ipKey,
          failureCount: Number(row.ip_failure_count) || 0,
          lockedUntil: row.ip_locked_until ? new Date(row.ip_locked_until as string) : null
        }
      }
    },

    async clearThrottle(scope, key) {
      const { error } = await supabaseClient.from('auth_throttle').delete().eq('scope', scope).eq('key', key)
      if (error) throw new Error('throttle clear failed')
    },

    async setOwnerCredential(machineId, credentialHash) {
      const { error } = await supabaseClient.from('owner_credentials').upsert(
        { machine_id: machineId, credential_hash: credentialHash, updated_at: new Date().toISOString() },
        { onConflict: 'machine_id' }
      )
      if (error) throw new Error('owner credential reset failed')
    },

    async queryOwnerData(machineId, date) {
      const { data: ds, error: settingsError } = await supabaseClient
        .from('display_settings')
        .select('settings')
        .eq('machine_id', machineId)
        .eq('profile_name', 'default')
        .single()
      if (settingsError) throw new Error('owner data unavailable')
      const settings = ds?.settings as { currency_symbol?: string; currency?: string } | undefined
      const currency = settings?.currency_symbol || settings?.currency || 'DA'

      const statRows: { total: number; status: string; items_summary: string | null }[] = []
      const PAGE = 1000
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabaseClient
          .from('owner_orders')
          .select('total, status, items_summary')
          .eq('machine_id', machineId)
          .eq('order_date', date)
          .range(from, from + PAGE - 1)
        if (error) throw new Error('owner data unavailable')
        if (!data || data.length === 0) break
        statRows.push(...(data as typeof statRows))
        if (data.length < PAGE) break
      }

      const { data: orders, error: ordersError } = await supabaseClient
        .from('owner_orders')
        .select('*')
        .eq('machine_id', machineId)
        .eq('order_date', date)
        .order('created_at', { ascending: false })
        .limit(100)
      if (ordersError) throw new Error('owner data unavailable')
      const orderList = orders || []

      const nonCancelled = statRows.filter(o => o.status !== 'cancelled')
      const totalRevenue = nonCancelled.reduce((s, o) => s + Number(o.total), 0)
      const orderCount = nonCancelled.length
      const avgOrder = orderCount > 0 ? Math.round(totalRevenue / orderCount) : 0

      const itemCounts = new Map<string, number>()
      for (const order of nonCancelled) {
        if (!order.items_summary) continue
        for (const part of order.items_summary.split(', ')) {
          const match = part.match(/^(\d+)x\s+(.+)$/)
          if (match) {
            const qty = parseInt(match[1], 10)
            const name = match[2]
            itemCounts.set(name, (itemCounts.get(name) || 0) + qty)
          }
        }
      }
      const popularItems = Array.from(itemCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, count]) => ({ name, count }))

      return { orders: orderList, stats: { totalRevenue, orderCount, avgOrder }, popularItems, currency }
    },

    async queryOwnerStats(machineId, period) {
      const today = formatAlgiersDate()
      const sinceStr = period === 'month' ? `${today.slice(0, 8)}01` : algiersDaysAgo(6)
      const { data, error } = await supabaseClient
        .from('daily_stats')
        .select('date, order_count, total_revenue, avg_order_value')
        .eq('machine_id', machineId)
        .gte('date', sinceStr)
        .order('date', { ascending: true })
      if (error) throw new Error('owner stats unavailable')
      return { days: data || [] }
    }
  }
}
