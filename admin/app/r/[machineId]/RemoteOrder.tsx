'use client'

/**
 * WP-G — Customer remote-order page (staff-approved flow, CONTRACT §2.2/§2.3).
 *
 * - Catalog comes from /api/public/catalog/<machineId> (no direct Supabase reads:
 *   anon table access is gone in Phase B). 404 = restaurant unknown OR disabled.
 * - One clientRequestId is generated per checkout and REUSED on every retry, so
 *   the submission is idempotent end-to-end.
 * - After a 201 the page NEVER says "Order Placed": it shows a pending screen and
 *   polls /api/remote-order/status?token=<capability> every 5 s. The REAL POS
 *   daily number is rendered only once the staff accepts.
 * - A 409 stale_quote refreshes the catalog and requires explicit re-confirmation.
 */

import { useState, useRef, useEffect, useCallback } from 'react'

/* ═══════════════════════════════════
   TYPES
═══════════════════════════════════ */
interface Category { id: number | string; name: string; emoji?: string }
interface MenuItem { menuItemId: number; name: string; price: number; emoji?: string; categoryId: number | string | null }
interface CartItem { item: MenuItem; quantity: number }
interface Catalog {
  restaurantName: string
  currency: string
  revision: number
  categories: Category[]
  items: MenuItem[]
}
type OrderPhase =
  | { kind: 'pending'; token: string; quotedTotal?: number }
  | { kind: 'accepted'; dailyNumber: number | null }
  | { kind: 'rejected'; reason: string | null }
  | { kind: 'expired' }

const MAX_RETRIES = 3
const MAX_LINES = 20
const MAX_UNITS = 50
const POLL_MS = 5000
const POLL_BACKOFF_MAX_MS = 60000
/** Consecutive 404s tolerated before concluding the capability is gone. 5xx and
 *  network failures NEVER count — those keep the token and keep polling. */
const POLL_MAX_NOT_FOUND = 4

function newRequestId(): string {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  } catch { /* fall through */ }
  const bytes = new Uint8Array(16)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(bytes)
  else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/* ═══════════════════════════════════
   COMPONENT
═══════════════════════════════════ */
export function RemoteOrder({ machineId }: { machineId: string }) {
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [selectedCategory, setSelectedCategory] = useState<string | number | null>(null)
  const [cart, setCart] = useState<CartItem[]>([])
  const [showCart, setShowCart] = useState(false)
  const [showOrderForm, setShowOrderForm] = useState(false)
  const [orderType, setOrderType] = useState<'dine-in' | 'takeaway'>('dine-in')
  const [tableNumber, setTableNumber] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [staleNotice, setStaleNotice] = useState(false)
  const [phase, setPhase] = useState<OrderPhase | null>(null)
  const [connectionLost, setConnectionLost] = useState(false)

  // FIX (SOL §4.7): the old handleRetry closed over the initial retryCount state,
  // so an outage looped forever without ever reaching MAX_RETRIES. A ref always
  // reads/writes the CURRENT count regardless of which render scheduled the retry.
  const retryCountRef = useRef(0)
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // One idempotency key per checkout; reused across retries, reset after a
  // terminal outcome or an explicit "new order".
  const clientRequestIdRef = useRef<string>(newRequestId())
  const tokenStorageKey = `ffm-remote-order-token:${machineId}`

  const fetchCatalog = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch(`/api/public/catalog/${encodeURIComponent(machineId)}`, { cache: 'no-store' })
      if (res.status === 404) {
        setNotFound(true)
        setLoading(false)
        return false
      }
      if (!res.ok) throw new Error(`catalog ${res.status}`)
      const data = (await res.json()) as Catalog
      setCatalog(data)
      setSelectedCategory((prev) => prev ?? data.categories[0]?.id ?? null)
      setLoading(false)
      retryCountRef.current = 0
      return true
    } catch {
      retryCountRef.current += 1
      if (retryCountRef.current >= MAX_RETRIES) {
        setNotFound(true)
        setLoading(false)
        return false
      }
      retryTimerRef.current = setTimeout(() => { void fetchCatalog() }, 3000)
      return false
    }
  }, [machineId])

  useEffect(() => {
    // Resume a pending submission across refreshes (capability only, never ids).
    try {
      const saved = sessionStorage.getItem(tokenStorageKey)
      if (saved) setPhase({ kind: 'pending', token: saved })
    } catch { /* storage unavailable */ }
    void fetchCatalog()
    return () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Status polling by capability token ──────────────────────────────────────
  // Self-scheduling loop (never an overlapping setInterval): the next poll is
  // queued only after the previous one COMPLETES, each request is abortable,
  // failures back off exponentially (bounded), and terminal statuses stop the
  // loop. A 5xx/offline response is INCONCLUSIVE: the capability token is kept
  // and polling continues — the customer is never told a terminal state the
  // server didn't assert.
  useEffect(() => {
    if (!phase || phase.kind !== 'pending') return
    const token = phase.token
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null
    let controller: AbortController | null = null
    let failures = 0
    let notFounds = 0
    const startedAt = Date.now()

    const backoffMs = () => Math.min(POLL_MS * 2 ** Math.min(failures, 4), POLL_BACKOFF_MAX_MS)
    const schedule = (ms: number) => {
      if (!cancelled) timer = setTimeout(() => { void poll() }, ms)
    }

    const poll = async () => {
      if (cancelled) return
      // After 2× the order TTL with no server-asserted terminal state, warn the
      // customer that the connection is unreliable (we keep polling slowly —
      // no terminal state is ever synthesized client-side).
      setConnectionLost(Date.now() - startedAt > 30 * 60_000 || failures >= 3)
      controller = new AbortController()
      try {
        const res = await fetch(`/api/remote-order/status?token=${encodeURIComponent(token)}`, {
          cache: 'no-store',
          signal: controller.signal
        })
        if (cancelled) return
        if (res.status === 200) {
          failures = 0
          notFounds = 0
          const data = await res.json()
          if (data.status === 'accepted') {
            clearSavedToken()
            setPhase({ kind: 'accepted', dailyNumber: data.dailyNumber ?? null })
            return
          }
          if (data.status === 'rejected') {
            clearSavedToken()
            setPhase({ kind: 'rejected', reason: data.rejectedReason ?? null })
            return
          }
          if (data.status === 'expired') {
            clearSavedToken()
            setPhase({ kind: 'expired' })
            return
          }
          schedule(POLL_MS) // still submitted
          return
        }
        if (res.status === 404) {
          // A capability that stops resolving after a successful submit is
          // ambiguous (rotation edge / replication lag) — retry a few times
          // before concluding the request is gone.
          notFounds += 1
          failures += 1
          if (notFounds >= POLL_MAX_NOT_FOUND) {
            clearSavedToken()
            setPhase({ kind: 'expired' })
            return
          }
          schedule(backoffMs())
          return
        }
        // 5xx / 503 db_failure: inconclusive — KEEP the token, back off, retry.
        failures += 1
        schedule(backoffMs())
      } catch {
        if (cancelled) return
        failures += 1
        schedule(backoffMs())
      }
    }

    void poll()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
      try { controller?.abort() } catch { /* already settled */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase?.kind === 'pending' ? (phase as any).token : null])

  function clearSavedToken() {
    try { sessionStorage.removeItem(tokenStorageKey) } catch { /* ignore */ }
  }

  const items = catalog?.items ?? []
  const categories = catalog?.categories ?? []
  const currency = catalog?.currency ?? 'DA'
  const restaurantName = catalog?.restaurantName ?? 'Restaurant'
  const filteredItems = items.filter((it) => String(it.categoryId) === String(selectedCategory))
  const cartTotal = cart.reduce((sum, ci) => sum + ci.item.price * ci.quantity, 0)
  const cartCount = cart.reduce((sum, ci) => sum + ci.quantity, 0)

  function addToCart(item: MenuItem) {
    setCart((prev) => {
      const existing = prev.find((ci) => ci.item.menuItemId === item.menuItemId)
      const units = prev.reduce((sum, ci) => sum + ci.quantity, 0)
      if (units >= MAX_UNITS) return prev
      if (existing) return prev.map((ci) => (ci.item.menuItemId === item.menuItemId ? { ...ci, quantity: ci.quantity + 1 } : ci))
      if (prev.length >= MAX_LINES) return prev
      return [...prev, { item, quantity: 1 }]
    })
  }

  function removeFromCart(menuItemId: number) {
    setCart((prev) => {
      const existing = prev.find((ci) => ci.item.menuItemId === menuItemId)
      if (!existing) return prev
      if (existing.quantity <= 1) return prev.filter((ci) => ci.item.menuItemId !== menuItemId)
      return prev.map((ci) => (ci.item.menuItemId === menuItemId ? { ...ci, quantity: ci.quantity - 1 } : ci))
    })
  }

  function clearCart() {
    setCart([])
    setShowCart(false)
  }

  function getCartQty(menuItemId: number) {
    return cart.find((ci) => ci.item.menuItemId === menuItemId)?.quantity || 0
  }

  /** Re-price the cart against a freshly fetched catalog after a 409 stale_quote. */
  function repriceCart(fresh: Catalog) {
    setCart((prev) => {
      const next: CartItem[] = []
      for (const ci of prev) {
        const updated = fresh.items.find((it) => it.menuItemId === ci.item.menuItemId)
        if (updated) next.push({ item: updated, quantity: ci.quantity })
        // dropped items are simply removed — the customer re-reviews the cart
      }
      return next
    })
  }

  async function submitOrder() {
    if (cart.length === 0 || submitting || !catalog) return
    if (!customerName.trim()) { setFormError('Please enter your name.'); return }
    if (orderType === 'dine-in' && !tableNumber.trim()) { setFormError('Please enter your table number.'); return }
    setSubmitting(true)
    setFormError(null)
    try {
      const res = await fetch('/api/remote-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          machineId,
          clientRequestId: clientRequestIdRef.current,
          quoteRevision: catalog.revision,
          orderType: orderType === 'dine-in' ? 'local' : 'takeout',
          tableNumber: orderType === 'dine-in' ? tableNumber.trim() : undefined,
          customerName: customerName.trim(),
          customerPhone: customerPhone.trim() || undefined,
          note: note.trim() ? note.trim().slice(0, 300) : undefined,
          items: cart.map((ci) => ({ menuItemId: ci.item.menuItemId, quantity: ci.quantity }))
        })
      })
      if (res.status === 201 || res.status === 200) {
        const data = await res.json()
        if (typeof data.statusToken === 'string' && data.statusToken) {
          try { sessionStorage.setItem(tokenStorageKey, data.statusToken) } catch { /* ignore */ }
          setStaleNotice(false)
          setShowCart(false)
          setShowOrderForm(false)
          setConnectionLost(false)
          // The SERVER-quoted total is authoritative — display it, not the cart math.
          setPhase({
            kind: 'pending',
            token: data.statusToken,
            quotedTotal: typeof data.quotedTotal === 'number' ? data.quotedTotal : undefined
          })
        } else {
          setFormError('Unexpected response. Please try again.')
        }
      } else if (res.status === 409) {
        // Prices/menu changed since this page loaded: refresh, re-render the cart
        // at the NEW prices, and require the customer to explicitly confirm again.
        const fresh = await fetch(`/api/public/catalog/${encodeURIComponent(machineId)}`, { cache: 'no-store' })
        if (fresh.ok) {
          const data = (await fresh.json()) as Catalog
          setCatalog(data)
          repriceCart(data)
          setStaleNotice(true)
        } else {
          setFormError('The menu changed. Please reload the page and try again.')
        }
      } else if (res.status === 429) {
        setFormError('Too many attempts. Please wait a moment and try again.')
      } else if (res.status === 404) {
        setNotFound(true)
      } else {
        const data = await res.json().catch(() => null)
        setFormError(
          data?.field === 'tableNumber'
            ? 'Please enter your table number.'
            : 'The order could not be submitted. Please review it and try again.'
        )
      }
    } catch {
      setFormError('No connection. Your order was NOT placed — please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  function startNewOrder() {
    clearSavedToken()
    clientRequestIdRef.current = newRequestId()
    setPhase(null)
    setCart([])
    setNote('')
    setStaleNotice(false)
    setFormError(null)
    setConnectionLost(false)
  }

  const shell: React.CSSProperties = {
    minHeight: '100vh', display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', padding: 24,
    background: '#0a0a0f', color: '#fff', fontFamily: 'system-ui, -apple-system, sans-serif'
  }

  // ── Order lifecycle screens (pending / accepted / rejected / expired) ────────
  if (phase) {
    if (phase.kind === 'pending') {
      return (
        <div style={shell}>
          <div style={{
            width: 48, height: 48, border: '3px solid rgba(255,255,255,0.1)',
            borderTopColor: '#f97316', borderRadius: '50%', animation: 'spin 0.8s linear infinite', marginBottom: 20
          }} />
          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Waiting for confirmation…</h1>
          <p style={{ color: '#aaa', fontSize: 14, textAlign: 'center', maxWidth: 320 }}>
            {restaurantName} has received your request. Your order is <b>not confirmed yet</b> —
            keep this page open, it updates automatically.
          </p>
          {phase.quotedTotal != null && (
            <p style={{ color: '#f97316', fontSize: 16, fontWeight: 700, marginTop: 12 }}>
              Total: {phase.quotedTotal.toLocaleString()} {currency}
            </p>
          )}
          {connectionLost && (
            <p style={{
              color: '#fdba74', fontSize: 13, marginTop: 16, textAlign: 'center', maxWidth: 320,
              background: 'rgba(249,115,22,0.12)', border: '1px solid rgba(249,115,22,0.4)',
              borderRadius: 12, padding: '10px 14px'
            }}>
              Connection is unstable — we keep checking. If this lasts, please
              confirm your order with the restaurant directly.
            </p>
          )}
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        </div>
      )
    }
    if (phase.kind === 'accepted') {
      return (
        <div style={shell}>
          <div style={{ fontSize: 64, marginBottom: 16 }}>✅</div>
          <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Order Confirmed!</h1>
          <p style={{ color: '#aaa', fontSize: 14, marginBottom: 24, textAlign: 'center' }}>
            {restaurantName} accepted your order.
          </p>
          {phase.dailyNumber != null && (
            <div style={{
              background: '#f97316', color: '#fff', padding: '16px 32px', borderRadius: 16,
              fontSize: 26, fontWeight: 800, marginBottom: 12
            }}>
              #{phase.dailyNumber}
            </div>
          )}
          <p style={{ color: '#777', fontSize: 12, marginBottom: 28 }}>This is your order number at the counter.</p>
          <button onClick={startNewOrder} style={{
            background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)',
            color: '#fff', padding: '12px 32px', borderRadius: 12, fontSize: 16, fontWeight: 600, cursor: 'pointer'
          }}>
            New Order
          </button>
        </div>
      )
    }
    if (phase.kind === 'rejected') {
      return (
        <div style={shell}>
          <div style={{ fontSize: 64, marginBottom: 16 }}>❌</div>
          <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Order Declined</h1>
          <p style={{ color: '#aaa', fontSize: 14, marginBottom: 24, textAlign: 'center', maxWidth: 320 }}>
            {phase.reason ? `Reason: ${phase.reason}` : `${restaurantName} could not take this order right now.`}
          </p>
          <button onClick={startNewOrder} style={{
            background: '#f97316', border: 'none', color: '#fff', padding: '12px 32px',
            borderRadius: 12, fontSize: 16, fontWeight: 600, cursor: 'pointer'
          }}>
            Start Over
          </button>
        </div>
      )
    }
    return (
      <div style={shell}>
        <div style={{ fontSize: 64, marginBottom: 16 }}>⌛</div>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Request Expired</h1>
        <p style={{ color: '#aaa', fontSize: 14, marginBottom: 24, textAlign: 'center', maxWidth: 320 }}>
          The restaurant did not confirm in time (or the menu changed). You were not charged — please order again.
        </p>
        <button onClick={startNewOrder} style={{
          background: '#f97316', border: 'none', color: '#fff', padding: '12px 32px',
          borderRadius: 12, fontSize: 16, fontWeight: 600, cursor: 'pointer'
        }}>
          Start Over
        </button>
      </div>
    )
  }

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={shell}>
        <div style={{
          width: 40, height: 40, border: '3px solid rgba(255,255,255,0.1)',
          borderTopColor: '#f97316', borderRadius: '50%', animation: 'spin 0.8s linear infinite'
        }} />
        <p style={{ color: '#aaa', fontSize: 14, marginTop: 16 }}>Loading...</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  // ── Not found / disabled ─────────────────────────────────────────────────────
  if (notFound || !catalog) {
    return (
      <div style={shell}>
        <div style={{ fontSize: 64, marginBottom: 16 }}>🍔</div>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Ordering Unavailable</h1>
        <p style={{ color: '#aaa', fontSize: 14, marginBottom: 24, textAlign: 'center', maxWidth: 320 }}>
          This link is invalid, or the restaurant hasn&apos;t enabled online ordering.
        </p>
        <button
          onClick={() => { setNotFound(false); setLoading(true); retryCountRef.current = 0; void fetchCatalog() }}
          style={{
            background: '#f97316', border: 'none', color: '#fff', padding: '12px 24px',
            borderRadius: 12, fontSize: 15, fontWeight: 600, cursor: 'pointer'
          }}
        >
          Try Again
        </button>
      </div>
    )
  }

  // ── Order form ───────────────────────────────────────────────────────────────
  if (showOrderForm) {
    const inputStyle: React.CSSProperties = {
      width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.15)',
      background: 'rgba(255,255,255,0.05)', color: '#fff', fontSize: 16, outline: 'none'
    }
    const labelStyle: React.CSSProperties = {
      fontSize: 13, fontWeight: 600, color: '#aaa', marginBottom: 8, display: 'block',
      textTransform: 'uppercase', letterSpacing: '0.05em'
    }
    return (
      <div style={{ minHeight: '100vh', background: '#0a0a0f', color: '#fff', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
        <div style={{
          position: 'sticky', top: 0, zIndex: 10, background: '#1a1a1a',
          display: 'flex', alignItems: 'center', padding: '0 16px', height: 56, gap: 12
        }}>
          <button onClick={() => setShowOrderForm(false)}
            style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', borderRadius: 8, padding: '6px 12px', fontSize: 16, cursor: 'pointer' }}>
            ←
          </button>
          <span style={{ fontWeight: 700, fontSize: 16 }}>Confirm Order</span>
        </div>

        <div style={{ padding: 20, maxWidth: 500, margin: '0 auto' }}>
          {staleNotice && (
            <div style={{
              background: 'rgba(249,115,22,0.12)', border: '1px solid rgba(249,115,22,0.5)',
              borderRadius: 12, padding: '12px 14px', marginBottom: 20, fontSize: 13, color: '#fdba74'
            }}>
              The menu or prices changed while you were ordering. Your cart has been updated to the
              current prices — please review the total and confirm again.
            </div>
          )}

          <div style={{ marginBottom: 24 }}>
            <label style={labelStyle}>Order Type</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {(['dine-in', 'takeaway'] as const).map((type) => (
                <button key={type} onClick={() => setOrderType(type)}
                  style={{
                    flex: 1, padding: '12px 16px', borderRadius: 12, border: 'none',
                    background: orderType === type ? '#f97316' : 'rgba(255,255,255,0.08)',
                    color: '#fff', fontWeight: 600, fontSize: 14, cursor: 'pointer', transition: 'background 0.15s'
                  }}>
                  {type === 'dine-in' ? '🍽️ Dine In' : '📦 Takeaway'}
                </button>
              ))}
            </div>
          </div>

          {orderType === 'dine-in' && (
            <div style={{ marginBottom: 24 }}>
              <label style={labelStyle}>Table Number *</label>
              <input type="text" value={tableNumber} onChange={(e) => setTableNumber(e.target.value)} placeholder="e.g. 5" style={inputStyle} />
            </div>
          )}

          <div style={{ marginBottom: 24 }}>
            <label style={labelStyle}>Your Name *</label>
            <input type="text" value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Name" style={inputStyle} />
          </div>

          <div style={{ marginBottom: 24 }}>
            <label style={labelStyle}>Phone (optional)</label>
            <input type="tel" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="Phone number" style={inputStyle} />
          </div>

          <div style={{ marginBottom: 24 }}>
            <label style={labelStyle}>Note (optional)</label>
            <textarea value={note} maxLength={300} onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. no onions" rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
          </div>

          <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 16, padding: 16, marginBottom: 24, border: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#aaa', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Order Summary</div>
            {cart.map((ci) => (
              <div key={ci.item.menuItemId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', fontSize: 14 }}>
                <span>{ci.quantity}x {ci.item.emoji || ''} {ci.item.name}</span>
                <span style={{ color: '#f97316', fontWeight: 600 }}>{(ci.item.price * ci.quantity).toLocaleString()} {currency}</span>
              </div>
            ))}
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', marginTop: 12, paddingTop: 12, display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 16 }}>
              <span>Total</span>
              <span style={{ color: '#f97316' }}>{cartTotal.toLocaleString()} {currency}</span>
            </div>
          </div>

          {formError && (
            <div style={{
              background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.4)',
              borderRadius: 12, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#fca5a5'
            }}>
              {formError}
            </div>
          )}

          <button onClick={() => { void submitOrder() }} disabled={submitting}
            style={{
              width: '100%', padding: '16px', borderRadius: 14, border: 'none',
              background: submitting ? '#666' : '#f97316', color: '#fff',
              fontSize: 16, fontWeight: 700, cursor: submitting ? 'default' : 'pointer', opacity: submitting ? 0.7 : 1
            }}>
            {submitting ? 'Sending…' : `Send Order Request - ${cartTotal.toLocaleString()} ${currency}`}
          </button>
          <p style={{ color: '#777', fontSize: 12, marginTop: 10, textAlign: 'center' }}>
            The restaurant confirms your order before it is prepared.
          </p>
        </div>
      </div>
    )
  }

  // ── Cart overlay ─────────────────────────────────────────────────────────────
  if (showCart) {
    return (
      <div style={{ minHeight: '100vh', background: '#0a0a0f', color: '#fff', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
        <div style={{
          position: 'sticky', top: 0, zIndex: 10, background: '#1a1a1a',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', height: 56
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={() => setShowCart(false)}
              style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', borderRadius: 8, padding: '6px 12px', fontSize: 16, cursor: 'pointer' }}>
              ←
            </button>
            <span style={{ fontWeight: 700, fontSize: 16 }}>Your Cart ({cartCount})</span>
          </div>
          {cart.length > 0 && (
            <button onClick={clearCart} style={{ background: 'none', border: 'none', color: '#f44', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              Clear All
            </button>
          )}
        </div>

        {cart.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 'calc(100vh - 56px)', color: '#666' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🛒</div>
            <p>Your cart is empty</p>
          </div>
        ) : (
          <div style={{ paddingBottom: 100 }}>
            {cart.map((ci) => (
              <div key={ci.item.menuItemId} style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px',
                borderBottom: '1px solid rgba(255,255,255,0.06)'
              }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 10, background: 'rgba(255,255,255,0.06)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, flexShrink: 0
                }}>
                  {ci.item.emoji || '🍽️'}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ci.item.name}</div>
                  <div style={{ fontSize: 13, color: '#f97316', fontWeight: 600, marginTop: 2 }}>{(ci.item.price * ci.quantity).toLocaleString()} {currency}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  <button onClick={() => removeFromCart(ci.item.menuItemId)}
                    style={{
                      width: 32, height: 32, borderRadius: 8, border: '1px solid rgba(255,255,255,0.15)',
                      background: 'none', color: '#fff', fontSize: 18, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                    −
                  </button>
                  <span style={{ fontSize: 14, fontWeight: 800, color: '#f97316', minWidth: 20, textAlign: 'center' }}>{ci.quantity}</span>
                  <button onClick={() => addToCart(ci.item)}
                    style={{
                      width: 32, height: 32, borderRadius: 8, border: 'none',
                      background: '#f97316', color: '#fff', fontSize: 18, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                    +
                  </button>
                </div>
              </div>
            ))}

            <div style={{
              position: 'fixed', bottom: 0, left: 0, right: 0,
              background: '#1a1a1a', borderTop: '1px solid rgba(255,255,255,0.1)',
              padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between'
            }}>
              <div>
                <div style={{ fontSize: 12, color: '#aaa' }}>Total</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#f97316' }}>{cartTotal.toLocaleString()} {currency}</div>
              </div>
              <button onClick={() => { setFormError(null); setShowOrderForm(true) }}
                style={{
                  background: '#f97316', border: 'none', color: '#fff', padding: '12px 24px',
                  borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: 'pointer'
                }}>
                Checkout →
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── Main menu view ───────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0f', color: '#fff', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <div style={{
        position: 'sticky', top: 0, zIndex: 10, background: '#1a1a1a',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', height: 56
      }}>
        <div style={{ fontWeight: 700, fontSize: 16, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1, minWidth: 0 }}>
          {restaurantName}
        </div>
        <button onClick={() => setShowCart(true)}
          style={{
            background: '#f97316', border: 'none', color: '#fff', borderRadius: 20,
            padding: '7px 14px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0
          }}>
          🛒
          {cartCount > 0 && (
            <span style={{
              background: '#fff', color: '#f97316', borderRadius: '50%',
              width: 20, height: 20, fontSize: 11, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              {cartCount}
            </span>
          )}
        </button>
      </div>

      <div style={{
        position: 'sticky', top: 56, zIndex: 9, background: '#111118',
        display: 'flex', overflowX: 'auto', gap: 6, padding: '10px 12px',
        scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch'
      }}>
        {categories.map((cat) => (
          <button key={String(cat.id)} onClick={() => setSelectedCategory(cat.id)}
            style={{
              flexShrink: 0, padding: '8px 16px', borderRadius: 20,
              border: String(selectedCategory) === String(cat.id) ? '1.5px solid #f97316' : '1.5px solid rgba(255,255,255,0.1)',
              background: String(selectedCategory) === String(cat.id) ? 'rgba(249,115,22,0.15)' : 'rgba(255,255,255,0.04)',
              color: String(selectedCategory) === String(cat.id) ? '#f97316' : '#aaa',
              fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.15s'
            }}>
            {cat.emoji ? `${cat.emoji} ` : ''}{cat.name}
          </button>
        ))}
      </div>

      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
        gap: 10, padding: 12, paddingBottom: cartCount > 0 ? 80 : 12
      }}>
        {filteredItems.map((item) => {
          const qty = getCartQty(item.menuItemId)
          return (
            <div key={item.menuItemId} onClick={() => addToCart(item)}
              style={{
                background: qty > 0 ? 'rgba(249,115,22,0.08)' : 'rgba(255,255,255,0.04)',
                border: qty > 0 ? '1.5px solid rgba(249,115,22,0.3)' : '1px solid rgba(255,255,255,0.06)',
                borderRadius: 14, padding: 16, cursor: 'pointer',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                position: 'relative', transition: 'transform 0.1s'
              }}>
              {qty > 0 && (
                <div style={{
                  position: 'absolute', top: 8, right: 8, background: '#f97316', color: '#fff',
                  width: 22, height: 22, borderRadius: '50%', fontSize: 11, fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                  {qty}
                </div>
              )}
              <div style={{ fontSize: 32, lineHeight: 1 }}>{item.emoji || '🍽️'}</div>
              <div style={{ fontSize: 13, fontWeight: 600, textAlign: 'center', lineHeight: 1.2, color: '#fff' }}>{item.name}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#f97316' }}>{item.price.toLocaleString()} {currency}</div>
            </div>
          )
        })}
      </div>

      {cartCount > 0 && (
        <div onClick={() => setShowCart(true)}
          style={{
            position: 'fixed', bottom: 12, left: 12, right: 12, zIndex: 100,
            background: '#f97316', borderRadius: 16, padding: '14px 20px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            cursor: 'pointer', boxShadow: '0 8px 32px rgba(249,115,22,0.4)'
          }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{
              background: 'rgba(255,255,255,0.25)', borderRadius: '50%',
              width: 28, height: 28, fontSize: 13, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              {cartCount}
            </span>
            <span style={{ fontWeight: 600, fontSize: 15 }}>View Cart</span>
          </div>
          <span style={{ fontWeight: 700, fontSize: 16 }}>{cartTotal.toLocaleString()} {currency}</span>
        </div>
      )}
    </div>
  )
}
