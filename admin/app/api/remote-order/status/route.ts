/**
 * WP-G — Remote-order status capability endpoint (CONTRACT §2.3).
 *
 * GET /api/remote-order/status?token=<statusToken>
 * The opaque capability token is the ONLY accepted lookup key — row ids /
 * request ids are never customer lookup keys. The server stores and matches
 * only SHA-256(token) (ADDENDUM #1).
 *
 * Must stay importable by `node --test`: erasable TS only, no `next/server`,
 * no path aliases, no top-level env access.
 */
import { createHash } from 'node:crypto'

interface RemoteOrderStatusDeps {
  supabase: any
  now: () => Date
  sha256Hex: (value: string) => string
}

interface RemoteOrderStatusHandlers {
  GET(request: Request): Promise<Response>
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  })
}

export function createRemoteOrderStatusRoute(deps: RemoteOrderStatusDeps): RemoteOrderStatusHandlers {
  async function GET(request: Request): Promise<Response> {
    let token: string | null = null
    try {
      token = new URL(request.url).searchParams.get('token')
    } catch {
      token = null
    }
    // No other identifier is accepted; absent/absurd tokens 404 without a lookup.
    if (!token || token.length < 16 || token.length > 512) {
      return jsonResponse({ error: 'not_found' }, 404)
    }

    const tokenHash = deps.sha256Hex(token)
    const { data: found, error: selectError } = await deps.supabase
      .from('remote_orders_v2')
      .select()
      .eq('status_token_hash', tokenHash)
      .maybeSingle()
    // Finding #3: a transient DB error is INCONCLUSIVE — 503, never 404 and never
    // a synthesized terminal state (customers must not reorder on a hiccup).
    if (selectError) return jsonResponse({ error: 'db_failure' }, 503)
    if (!found) return jsonResponse({ error: 'not_found' }, 404)

    let row: any = found
    // Lazy expiry (CONTRACT §2.3): a submitted row past its TTL is persisted as
    // expired via a CONDITIONAL update; 'expired' is reported ONLY when that
    // update verifiably transitioned the row. A failed update is 503; an update
    // that matched 0 rows means a concurrent staff decision won — re-read and
    // report the ACTUAL row state (never synthesize).
    if (
      row.status === 'submitted' &&
      row.expires_at &&
      deps.now().getTime() > new Date(row.expires_at).getTime()
    ) {
      const { data: updated, error: updateError } = await deps.supabase
        .from('remote_orders_v2')
        .update({ status: 'expired' })
        .eq('status_token_hash', tokenHash)
        .eq('status', 'submitted')
        .select()
      if (updateError) return jsonResponse({ error: 'db_failure' }, 503)
      const transitioned = Array.isArray(updated) ? updated.length : updated ? 1 : 0
      if (transitioned > 0) {
        row = { ...row, status: 'expired' }
      } else {
        const { data: fresh, error: refetchError } = await deps.supabase
          .from('remote_orders_v2')
          .select()
          .eq('status_token_hash', tokenHash)
          .maybeSingle()
        if (refetchError || !fresh) return jsonResponse({ error: 'db_failure' }, 503)
        row = fresh
      }
    }

    // Claim-in-progress rows (accepted claim taken, local order not yet finalized
    // with its daily number) stay customer-visible as 'submitted': the customer
    // must never see a confirmation the POS hasn't durably committed (finding #4).
    const status: string =
      row.status === 'accepted' && row.daily_number == null ? 'submitted' : row.status

    const body: Record<string, unknown> = { status }
    // The daily number is present ONLY when accepted — it is the REAL POS daily
    // number written back by the listener, never a synthetic id.
    if (status === 'accepted' && row.daily_number != null) body.dailyNumber = row.daily_number
    if (status === 'rejected' && row.rejected_reason != null) body.rejectedReason = row.rejected_reason
    if (row.expires_at != null) body.expiresAt = row.expires_at
    return jsonResponse(body, 200)
  }

  return { GET }
}

// ─── Production wiring (lazy; same code path as the test factory) ──────────────
let productionRoute: RemoteOrderStatusHandlers | null = null

async function getProductionRoute(): Promise<RemoteOrderStatusHandlers> {
  if (!productionRoute) {
    const { supabase, isConfigured } = await import('../../../../lib/supabase')
    if (!isConfigured) throw new Error('Supabase service role is not configured')
    productionRoute = createRemoteOrderStatusRoute({
      supabase,
      now: () => new Date(),
      sha256Hex: (value: string) => createHash('sha256').update(value).digest('hex')
    })
  }
  return productionRoute
}

export async function GET(request: Request): Promise<Response> {
  try {
    const route = await getProductionRoute()
    return await route.GET(request)
  } catch {
    return jsonResponse({ error: 'db_failure' }, 503)
  }
}
