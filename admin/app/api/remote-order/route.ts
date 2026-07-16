/**
 * WP-G — Public remote-order submission (CONTRACT §2.2 + ADDENDUM items 1,4,5,6,7).
 *
 * Staff-approved flow: this route only ever persists a `submitted` row. The POS
 * listener (src/main/sync/remote-order-listener.ts) is the ONLY thing that turns a
 * submission into a real order (stock/print/loyalty), after explicit staff accept.
 *
 * `createRemoteOrderRoute` is the test seam required by remote-order.contract.d.ts;
 * the production `POST` export delegates to the exact same code path.
 *
 * NOTE: this file must stay importable by `node --test` (Node type-stripping):
 * erasable TS syntax only, no `next/server`, no path aliases, no top-level env use.
 */
import { createHmac, createHash, randomBytes as nodeRandomBytes } from 'node:crypto'

interface RemoteOrderRouteDeps {
  supabase: any
  now: () => Date
  getClientIp: (request: Request) => string
  randomBytes: (length: number) => Uint8Array
  sha256Hex: (value: string) => string
  /**
   * ADDENDUM #1: HMAC key for the deterministic status capability.
   * Production passes SERVER_CAPABILITY_SECRET (Vercel secret, >=32 random bytes) and
   * FAILS CLOSED (500 config_error) when it is missing or too short — see POST below.
   * The randomBytes fallback exists ONLY for the frozen test seam (the acceptance
   * tests inject randomBytes and assert exactly one 32-byte draw per route instance).
   */
  capabilitySecret?: string
  /** Rotation support: previous secret, used only to match duplicate submissions
   *  whose stored hash was produced under the old key. */
  previousCapabilitySecret?: string
}

/** Production readiness check for the capability secret (exported for tests). */
export function capabilitySecretProblem(secret: string | undefined | null): string | null {
  if (!secret) return 'missing'
  if (Buffer.byteLength(secret, 'utf8') < 32) return 'too_short'
  return null
}

interface RemoteOrderRouteHandlers {
  POST(request: Request): Promise<Response>
}

const MAX_BODY_BYTES = 65536
const MAX_LINES = 20
const MAX_UNITS = 50
const MAX_NOTE = 300
const MAX_QUOTED_TOTAL = 100000
const TTL_MS = 15 * 60 * 1000
const NOT_FOUND_BODY = JSON.stringify({ error: 'not_found' })
const MACHINE_ID_RE = /^[A-Z0-9]{6,64}$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Canonical order types; the API maps UI values at the boundary (CONTRACT §2.1). */
const ORDER_TYPE_MAP: Record<string, 'local' | 'takeout' | 'delivery'> = {
  local: 'local',
  'dine-in': 'local',
  dinein: 'local',
  dine_in: 'local',
  takeout: 'takeout',
  takeaway: 'takeout',
  'take-away': 'takeout',
  delivery: 'delivery'
}

function jsonResponse(body: unknown, status: number, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers }
  })
}

function badInput(field: string): Response {
  return jsonResponse({ error: 'bad_input', field }, 400)
}

/** Byte-identical 404 for BOTH unknown machine and remote-ordering-disabled. */
function notFound(): Response {
  return new Response(NOT_FOUND_BODY, {
    status: 404,
    headers: { 'content-type': 'application/json' }
  })
}

interface CatalogEntry {
  menuItemId: number
  name: string
  price: number
  active: boolean
  revision: number
}

/**
 * Reads the machine's synced catalog and normalizes it to per-item entries.
 * Supports both shapes:
 *  - normalized per-item revision rows: { menu_item_id, name, price, active, revision }
 *  - the live jsonb menu_sync row: { items: [...], quote_revision } (current revision only)
 */
async function loadCatalogEntries(supabase: any, machineId: string): Promise<CatalogEntry[]> {
  const { data } = await supabase.from('menu_sync').select().eq('machine_id', machineId)
  const rows: any[] = Array.isArray(data) ? data : data ? [data] : []
  const entries: CatalogEntry[] = []
  for (const row of rows) {
    if (!row) continue
    if (row.menu_item_id != null) {
      entries.push({
        menuItemId: Number(row.menu_item_id),
        name: String(row.name ?? ''),
        price: Number(row.price),
        active: row.active !== false,
        revision: Number(row.revision ?? row.quote_revision ?? 0)
      })
    } else if (Array.isArray(row.items)) {
      const revision = Number(row.quote_revision ?? row.revision ?? 0)
      for (const item of row.items) {
        if (!item) continue
        const id = item.menu_item_id ?? item.menuItemId ?? item.id
        if (id == null) continue
        entries.push({
          menuItemId: Number(id),
          name: String(item.name ?? ''),
          price: Number(item.price),
          active: item.active !== false && item.available !== false,
          revision
        })
      }
    }
  }
  return entries
}

function entriesAt(entries: CatalogEntry[], revision: number): Map<number, CatalogEntry> {
  const map = new Map<number, CatalogEntry>()
  for (const entry of entries) {
    if (entry.revision === revision) map.set(entry.menuItemId, entry)
  }
  return map
}

export function createRemoteOrderRoute(deps: RemoteOrderRouteDeps): RemoteOrderRouteHandlers {
  // ADDENDUM #1 capability keys, current first. The randomBytes derivation is the
  // frozen-test seam only; production construction refuses to run without a real
  // secret (fail closed — see POST export).
  const capabilityKeys: Buffer[] = []
  if (deps.capabilitySecret) capabilityKeys.push(Buffer.from(deps.capabilitySecret, 'utf8'))
  if (deps.previousCapabilitySecret) {
    capabilityKeys.push(Buffer.from(deps.previousCapabilitySecret, 'utf8'))
  }
  if (capabilityKeys.length === 0) capabilityKeys.push(Buffer.from(deps.randomBytes(32)))

  function capabilityTokenWith(key: Buffer, machineId: string, clientRequestId: string): string {
    return createHmac('sha256', key).update(`${machineId}:${clientRequestId}`).digest('base64url')
  }

  function capabilityToken(machineId: string, clientRequestId: string): string {
    return capabilityTokenWith(capabilityKeys[0], machineId, clientRequestId)
  }

  /** For duplicates: recompute with whichever (current|previous) key produced the
   *  stored hash, so the response stays byte-identical across secret rotation. */
  function capabilityTokenMatching(
    machineId: string,
    clientRequestId: string,
    storedHash: string
  ): string {
    for (const key of capabilityKeys) {
      const token = capabilityTokenWith(key, machineId, clientRequestId)
      if (deps.sha256Hex(token) === storedHash) return token
    }
    return capabilityToken(machineId, clientRequestId)
  }

  /**
   * Reads the request body enforcing a REAL UTF-8 byte cap (finding #8): the
   * stream is consumed incrementally and cancelled the moment the running byte
   * count exceeds the cap — no full buffering of oversized bodies, and multi-byte
   * characters are counted as bytes, not JS code units. Returns null when over cap.
   */
  async function readBodyCapped(request: Request, maxBytes: number): Promise<string | null> {
    const stream: any = (request as any).body
    if (stream && typeof stream.getReader === 'function') {
      const reader = stream.getReader()
      const chunks: Buffer[] = []
      let total = 0
      try {
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          if (value) {
            const chunk = Buffer.from(value)
            total += chunk.byteLength
            if (total > maxBytes) {
              try { await reader.cancel() } catch { /* already errored */ }
              return null
            }
            chunks.push(chunk)
          }
        }
      } finally {
        try { reader.releaseLock() } catch { /* already released */ }
      }
      return Buffer.concat(chunks).toString('utf8')
    }
    // Non-stream fakes: still measure BYTES, not code units.
    const text = await request.text()
    return Buffer.byteLength(text, 'utf8') > maxBytes ? null : text
  }

  async function POST(request: Request): Promise<Response> {
    // ── ADDENDUM #5: reject oversized bodies BEFORE any parse ─────────────────
    const contentLength = request.headers.get('content-length')
    if (contentLength !== null && Number(contentLength) > MAX_BODY_BYTES) {
      return badInput('body')
    }

    let body: any
    try {
      // Missing/absent Content-Length with an oversized stream also rejects —
      // measured in UTF-8 BYTES, cancelled mid-stream (finding #8).
      const raw = await readBodyCapped(request, MAX_BODY_BYTES)
      if (raw === null) return badInput('body')
      body = JSON.parse(raw)
    } catch {
      return badInput('body')
    }
    if (body === null || typeof body !== 'object' || Array.isArray(body)) return badInput('body')

    // ── Shape ──────────────────────────────────────────────────────────────────
    const machineId = typeof body.machineId === 'string' ? body.machineId.trim().toUpperCase() : ''
    if (!MACHINE_ID_RE.test(machineId)) return badInput('machineId')
    const clientRequestId =
      typeof body.clientRequestId === 'string' ? body.clientRequestId.trim().toLowerCase() : ''
    if (!UUID_RE.test(clientRequestId)) return badInput('clientRequestId')
    const quoteRevision = body.quoteRevision
    if (typeof quoteRevision !== 'number' || !Number.isInteger(quoteRevision) || quoteRevision < 0) {
      return badInput('quoteRevision')
    }

    // ── 1. Per-restaurant enable flag (DEFAULT OFF). Unknown machine and disabled
    //       restaurant return an IDENTICAL 404 — no data leak (CONTRACT §2.2.1). ──
    const { data: machine } = await deps.supabase
      .from('machines')
      .select()
      .eq('machine_id', machineId)
      .maybeSingle()
    if (!machine || machine.remote_ordering_enabled !== true) return notFound()

    // ── 2. Durable throttle — atomic counter RPC, ZERO side effects on 429
    //       (ADDENDUM #7: 5/10min per IP+machine AND 30/h per machine, one call). ──
    const clientIp = deps.getClientIp(request)
    const { data: throttleData, error: throttleError } = await deps.supabase.rpc(
      'remote_order_check_throttle',
      { p_ip: clientIp, p_machine_id: machineId }
    )
    const decision = Array.isArray(throttleData) ? throttleData[0] : throttleData
    if (throttleError || !decision) {
      // Fail closed: no throttle verdict means no write.
      return jsonResponse({ error: 'db_failure' }, 503)
    }
    if (decision.allowed !== true) {
      const retryAfter = Number(decision.retryAfter ?? decision.retry_after_seconds ?? 600) || 600
      return jsonResponse({ error: 'rate_limited' }, 429, { 'retry-after': String(retryAfter) })
    }

    // ── 3. Caps ────────────────────────────────────────────────────────────────
    const orderType = ORDER_TYPE_MAP[String(body.orderType ?? '').toLowerCase().trim()]
    if (!orderType) return badInput('orderType')
    const tableNumber = typeof body.tableNumber === 'string' ? body.tableNumber.trim().slice(0, 50) : ''
    if (orderType === 'local' && !tableNumber) return badInput('tableNumber')
    const customerName = typeof body.customerName === 'string' ? body.customerName.trim().slice(0, 100) : ''
    if (!customerName) return badInput('customerName')
    const customerPhone =
      typeof body.customerPhone === 'string' ? body.customerPhone.trim().slice(0, 50) : ''
    const note = typeof body.note === 'string' ? body.note : ''
    if (note.length > MAX_NOTE) return badInput('note')

    const items = body.items
    if (!Array.isArray(items) || items.length === 0 || items.length > MAX_LINES) {
      return badInput('items')
    }
    let totalUnits = 0
    const requested: Array<{ menuItemId: number; quantity: number }> = []
    for (const item of items) {
      if (!item || typeof item !== 'object') return badInput('items')
      const menuItemId = (item as any).menuItemId
      const quantity = (item as any).quantity
      if (typeof menuItemId !== 'number' || !Number.isInteger(menuItemId)) return badInput('items')
      if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity < 1) {
        return badInput('items')
      }
      totalUnits += quantity
      requested.push({ menuItemId, quantity })
    }
    if (totalUnits > MAX_UNITS) return badInput('items')

    // ── 4. Catalog / pricing revision check. Server computes ALL prices from the
    //       synced catalog — client-supplied prices are never trusted. ───────────
    const entries = await loadCatalogEntries(deps.supabase, machineId)
    const currentRevision = Number(machine.catalog_revision ?? 0)
    if (currentRevision !== quoteRevision) {
      const quoted = entriesAt(entries, quoteRevision)
      const current = entriesAt(entries, currentRevision)
      const changedLines: Array<{
        menuItemId: number
        name: string
        oldPrice: number | null
        newPrice: number | null
        active: boolean
      }> = []
      const seen = new Set<number>()
      for (const line of requested) {
        if (seen.has(line.menuItemId)) continue
        seen.add(line.menuItemId)
        const oldEntry = quoted.get(line.menuItemId)
        const newEntry = current.get(line.menuItemId)
        const oldPrice = oldEntry ? oldEntry.price : null
        const newPrice = newEntry ? newEntry.price : null
        const active = newEntry ? newEntry.active : false
        const oldActive = oldEntry ? oldEntry.active : false
        if (oldPrice !== newPrice || oldActive !== active) {
          changedLines.push({
            menuItemId: line.menuItemId,
            name: newEntry?.name ?? oldEntry?.name ?? '',
            oldPrice,
            newPrice,
            active
          })
        }
      }
      return jsonResponse({ error: 'stale_quote', currentRevision, changedLines }, 409)
    }

    const catalog = entriesAt(entries, quoteRevision)
    let quotedTotal = 0
    const persistedLines: Array<{
      menuItemId: number
      quantity: number
      unitPrice: number
      name: string
    }> = []
    for (const line of requested) {
      const entry = catalog.get(line.menuItemId)
      if (!entry || !entry.active || !Number.isFinite(entry.price)) return badInput('items')
      quotedTotal += entry.price * line.quantity
      // ADDENDUM #4: quoted unit prices are stored per line in the submission row.
      persistedLines.push({
        menuItemId: line.menuItemId,
        quantity: line.quantity,
        unitPrice: entry.price,
        name: entry.name
      })
    }
    if (quotedTotal > MAX_QUOTED_TOTAL) return badInput('quotedTotal')

    // ── 5. Insert `submitted` row; duplicate (machine_id, client_request_id) is
    //       idempotent and returns the ORIGINAL response byte-for-byte (ADDENDUM #1). ──
    const statusToken = capabilityToken(machineId, clientRequestId)
    const statusTokenHash = deps.sha256Hex(statusToken)
    const nowIso = deps.now().toISOString()
    const expiresIso = new Date(deps.now().getTime() + TTL_MS).toISOString()

    const { data: inserted, error: insertError } = await deps.supabase
      .from('remote_orders_v2')
      .insert({
        machine_id: machineId,
        client_request_id: clientRequestId,
        status: 'submitted',
        order_type: orderType,
        table_number: tableNumber || null,
        customer_name: customerName,
        customer_phone: customerPhone || null,
        note: note || null,
        items: persistedLines,
        quote_revision: quoteRevision,
        quoted_total: quotedTotal,
        status_token_hash: statusTokenHash,
        created_at: nowIso,
        expires_at: expiresIso
      })
      .select()
      .single()

    if (insertError) {
      if (String(insertError.code) === '23505') {
        const { data: existing } = await deps.supabase
          .from('remote_orders_v2')
          .select()
          .eq('machine_id', machineId)
          .eq('client_request_id', clientRequestId)
          .maybeSingle()
        if (!existing) return jsonResponse({ error: 'db_failure' }, 503)
        // ADDENDUM #6: requestId (server row id) MAY be returned; machineId and
        // clientRequestId are NEVER echoed. No daily number at submit time.
        // Finding #9: a duplicate ALWAYS returns the immutable ORIGINAL submission
        // response — status 'submitted' — regardless of later lifecycle. Current
        // truth is only ever served by the capability status endpoint.
        return jsonResponse(
          {
            requestId: existing.id,
            statusToken: capabilityTokenMatching(machineId, clientRequestId, existing.status_token_hash),
            status: 'submitted',
            expiresAt: existing.expires_at,
            quotedTotal: existing.quoted_total
          },
          200
        )
      }
      return jsonResponse({ error: 'db_failure' }, 503)
    }

    return jsonResponse(
      {
        requestId: inserted.id,
        statusToken,
        status: 'submitted',
        expiresAt: expiresIso,
        quotedTotal
      },
      201
    )
  }

  return { POST }
}

// ─── Production wiring (same code path; deps resolved lazily so tests can import
//     this module without env/Supabase) ─────────────────────────────────────────
let productionRoute: RemoteOrderRouteHandlers | null = null

async function getProductionRoute(): Promise<RemoteOrderRouteHandlers> {
  if (!productionRoute) {
    const { supabase, isConfigured } = await import('../../../lib/supabase')
    if (!isConfigured) throw new Error('Supabase service role is not configured')
    const previous = process.env.SERVER_CAPABILITY_SECRET_PREVIOUS
    productionRoute = createRemoteOrderRoute({
      supabase,
      now: () => new Date(),
      getClientIp: (request: Request) =>
        request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown',
      randomBytes: (length: number) => new Uint8Array(nodeRandomBytes(length)),
      sha256Hex: (value: string) => createHash('sha256').update(value).digest('hex'),
      capabilitySecret: process.env.SERVER_CAPABILITY_SECRET,
      previousCapabilitySecret: capabilitySecretProblem(previous) === null ? previous : undefined
    })
  }
  return productionRoute
}

export async function POST(request: Request): Promise<Response> {
  // Finding #7: FAIL CLOSED when the capability secret is missing/short. A random
  // per-instance key would break duplicate-token stability across serverless
  // instances and open a duplicate-order path — refuse to serve instead.
  if (capabilitySecretProblem(process.env.SERVER_CAPABILITY_SECRET) !== null) {
    console.error(
      '[remote-order] SERVER_CAPABILITY_SECRET missing or <32 bytes — refusing to accept submissions.'
    )
    return jsonResponse({ error: 'config_error' }, 500)
  }
  try {
    const route = await getProductionRoute()
    return await route.POST(request)
  } catch {
    return jsonResponse({ error: 'db_failure' }, 503)
  }
}
