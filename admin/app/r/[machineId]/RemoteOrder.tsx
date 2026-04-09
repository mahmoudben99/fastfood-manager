'use client'

import { useState, useRef, useEffect } from 'react'
import { supabaseBrowser } from '@/lib/supabase-browser'

/* ═══════════════════════════════════
   TYPES
═══════════════════════════════════ */
interface Category { id: number | string; name: string; emoji?: string }
interface MenuItem { id: number | string; name: string; price: number; emoji?: string; category_id: number | string }
interface CartItem { item: MenuItem; quantity: number }

/* ═══════════════════════════════════
   COMPONENT
═══════════════════════════════════ */
export function RemoteOrder({ machineId }: { machineId: string }) {
  const [loading, setLoading] = useState(true)
  const [retryCount, setRetryCount] = useState(0)
  const [notFound, setNotFound] = useState(false)
  const [restaurantName, setRestaurantName] = useState('')
  const [categories, setCategories] = useState<Category[]>([])
  const [items, setItems] = useState<MenuItem[]>([])
  const [selectedCategory, setSelectedCategory] = useState<string | number | null>(null)
  const [cart, setCart] = useState<CartItem[]>([])
  const [showCart, setShowCart] = useState(false)
  const [showOrderForm, setShowOrderForm] = useState(false)
  const [orderType, setOrderType] = useState<'dine-in' | 'takeaway'>('dine-in')
  const [tableNumber, setTableNumber] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [orderResult, setOrderResult] = useState<{ ok: boolean; orderId?: string } | null>(null)
  const categoryScrollRef = useRef<HTMLDivElement>(null)
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const MAX_RETRIES = 3

  useEffect(() => {
    fetchData()
    return () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current)
    }
  }, [])

  async function fetchData() {
    try {
      // Fetch restaurant info
      const { data: installation } = await supabaseBrowser
        .from('installations')
        .select('restaurant_name, phone')
        .eq('machine_id', machineId)
        .single()

      if (!installation) {
        handleRetry()
        return
      }

      setRestaurantName(installation.restaurant_name || 'Restaurant')

      // Fetch menu
      const { data: menuData } = await supabaseBrowser
        .from('menu_sync')
        .select('categories, items')
        .eq('machine_id', machineId)
        .single()

      if (!menuData) {
        handleRetry()
        return
      }

      setCategories(menuData.categories || [])
      setItems(menuData.items || [])
      if (menuData.categories?.length > 0) {
        setSelectedCategory(menuData.categories[0].id)
      }
      setLoading(false)
      setRetryCount(0)
    } catch {
      handleRetry()
    }
  }

  function handleRetry() {
    const nextRetry = retryCount + 1
    if (nextRetry >= MAX_RETRIES) {
      setNotFound(true)
      setLoading(false)
      return
    }
    setRetryCount(nextRetry)
    retryTimerRef.current = setTimeout(() => fetchData(), 3000)
  }

  const filteredItems = items.filter(it => String(it.category_id) === String(selectedCategory))
  const cartTotal = cart.reduce((sum, ci) => sum + ci.item.price * ci.quantity, 0)
  const cartCount = cart.reduce((sum, ci) => sum + ci.quantity, 0)

  function addToCart(item: MenuItem) {
    setCart(prev => {
      const existing = prev.find(ci => ci.item.id === item.id)
      if (existing) return prev.map(ci => ci.item.id === item.id ? { ...ci, quantity: ci.quantity + 1 } : ci)
      return [...prev, { item, quantity: 1 }]
    })
  }

  function removeFromCart(itemId: number | string) {
    setCart(prev => {
      const existing = prev.find(ci => ci.item.id === itemId)
      if (!existing) return prev
      if (existing.quantity <= 1) return prev.filter(ci => ci.item.id !== itemId)
      return prev.map(ci => ci.item.id === itemId ? { ...ci, quantity: ci.quantity - 1 } : ci)
    })
  }

  function clearCart() {
    setCart([])
    setShowCart(false)
  }

  function getCartQty(itemId: number | string) {
    return cart.find(ci => ci.item.id === itemId)?.quantity || 0
  }

  async function submitOrder() {
    if (cart.length === 0) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/remote-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          machineId,
          items: cart.map(ci => ({ id: ci.item.id, name: ci.item.name, price: ci.item.price, quantity: ci.quantity, emoji: ci.item.emoji })),
          orderType,
          tableNumber: orderType === 'dine-in' ? tableNumber : undefined,
          customerPhone: customerPhone || undefined,
          customerName: customerName || undefined,
        }),
      })
      const data = await res.json()
      if (data.ok) {
        setOrderResult({ ok: true, orderId: data.orderId })
        setCart([])
        setShowCart(false)
        setShowOrderForm(false)
      } else {
        setOrderResult({ ok: false })
      }
    } catch {
      setOrderResult({ ok: false })
    } finally {
      setSubmitting(false)
    }
  }

  // Loading state
  if (loading) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        background: '#0a0a0f', color: '#fff', fontFamily: 'system-ui, -apple-system, sans-serif',
      }}>
        <div style={{
          width: 40, height: 40, border: '3px solid rgba(255,255,255,0.1)',
          borderTopColor: '#f97316', borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }} />
        <p style={{ color: '#aaa', fontSize: 14, marginTop: 16 }}>Loading...</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  // Not found (after 3 retries)
  if (notFound) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', padding: 24,
        background: '#0a0a0f', color: '#fff', fontFamily: 'system-ui, -apple-system, sans-serif',
      }}>
        <div style={{ fontSize: 64, marginBottom: 16 }}>🍔</div>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Restaurant Not Found</h1>
        <p style={{ color: '#aaa', fontSize: 14, marginBottom: 24, textAlign: 'center' }}>
          This link is invalid or the restaurant hasn&apos;t set up yet.
        </p>
        <button
          onClick={() => { setNotFound(false); setLoading(true); setRetryCount(0); fetchData() }}
          style={{
            background: '#f97316', border: 'none', color: '#fff', padding: '12px 24px',
            borderRadius: 12, fontSize: 15, fontWeight: 600, cursor: 'pointer',
          }}
        >
          Try Again
        </button>
      </div>
    )
  }

  // Order confirmation screen
  if (orderResult) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', padding: 24,
        background: '#0a0a0f', color: '#fff', fontFamily: 'system-ui, -apple-system, sans-serif',
      }}>
        {orderResult.ok ? (
          <>
            <div style={{ fontSize: 64, marginBottom: 16 }}>✅</div>
            <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Order Placed!</h1>
            <p style={{ color: '#aaa', fontSize: 14, marginBottom: 24, textAlign: 'center' }}>
              Your order has been sent to {restaurantName}
            </p>
            {orderResult.orderId && (
              <div style={{
                background: '#f97316', color: '#fff', padding: '16px 32px', borderRadius: 16,
                fontSize: 20, fontWeight: 800, marginBottom: 32,
              }}>
                #{String(orderResult.orderId).slice(-4).toUpperCase()}
              </div>
            )}
            <button
              onClick={() => setOrderResult(null)}
              style={{
                background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)',
                color: '#fff', padding: '12px 32px', borderRadius: 12, fontSize: 16,
                fontWeight: 600, cursor: 'pointer',
              }}
            >
              New Order
            </button>
          </>
        ) : (
          <>
            <div style={{ fontSize: 64, marginBottom: 16 }}>❌</div>
            <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Order Failed</h1>
            <p style={{ color: '#aaa', fontSize: 14, marginBottom: 24 }}>Something went wrong. Please try again.</p>
            <button
              onClick={() => setOrderResult(null)}
              style={{
                background: '#f97316', border: 'none', color: '#fff', padding: '12px 32px',
                borderRadius: 12, fontSize: 16, fontWeight: 600, cursor: 'pointer',
              }}
            >
              Try Again
            </button>
          </>
        )}
      </div>
    )
  }

  // Order form overlay
  if (showOrderForm) {
    return (
      <div style={{
        minHeight: '100vh', background: '#0a0a0f', color: '#fff',
        fontFamily: 'system-ui, -apple-system, sans-serif', padding: 0,
      }}>
        {/* Header */}
        <div style={{
          position: 'sticky', top: 0, zIndex: 10, background: '#1a1a1a',
          display: 'flex', alignItems: 'center', padding: '0 16px', height: 56, gap: 12,
        }}>
          <button
            onClick={() => setShowOrderForm(false)}
            style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', borderRadius: 8, padding: '6px 12px', fontSize: 16, cursor: 'pointer' }}
          >
            ←
          </button>
          <span style={{ fontWeight: 700, fontSize: 16 }}>Confirm Order</span>
        </div>

        <div style={{ padding: 20, maxWidth: 500, margin: '0 auto' }}>
          {/* Order type */}
          <div style={{ marginBottom: 24 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: '#aaa', marginBottom: 8, display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Order Type</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {(['dine-in', 'takeaway'] as const).map(type => (
                <button
                  key={type}
                  onClick={() => setOrderType(type)}
                  style={{
                    flex: 1, padding: '12px 16px', borderRadius: 12, border: 'none',
                    background: orderType === type ? '#f97316' : 'rgba(255,255,255,0.08)',
                    color: '#fff', fontWeight: 600, fontSize: 14, cursor: 'pointer',
                    transition: 'background 0.15s',
                  }}
                >
                  {type === 'dine-in' ? '🍽️ Dine In' : '📦 Takeaway'}
                </button>
              ))}
            </div>
          </div>

          {/* Table number (dine-in only) */}
          {orderType === 'dine-in' && (
            <div style={{ marginBottom: 24 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: '#aaa', marginBottom: 8, display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Table Number</label>
              <input
                type="text"
                value={tableNumber}
                onChange={e => setTableNumber(e.target.value)}
                placeholder="e.g. 5"
                style={{
                  width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.15)',
                  background: 'rgba(255,255,255,0.05)', color: '#fff', fontSize: 16, outline: 'none',
                }}
              />
            </div>
          )}

          {/* Customer name */}
          <div style={{ marginBottom: 24 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: '#aaa', marginBottom: 8, display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Your Name (optional)</label>
            <input
              type="text"
              value={customerName}
              onChange={e => setCustomerName(e.target.value)}
              placeholder="Name"
              style={{
                width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.15)',
                background: 'rgba(255,255,255,0.05)', color: '#fff', fontSize: 16, outline: 'none',
              }}
            />
          </div>

          {/* Phone */}
          <div style={{ marginBottom: 24 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: '#aaa', marginBottom: 8, display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Phone (optional)</label>
            <input
              type="tel"
              value={customerPhone}
              onChange={e => setCustomerPhone(e.target.value)}
              placeholder="Phone number"
              style={{
                width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.15)',
                background: 'rgba(255,255,255,0.05)', color: '#fff', fontSize: 16, outline: 'none',
              }}
            />
          </div>

          {/* Order summary */}
          <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 16, padding: 16, marginBottom: 24, border: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#aaa', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Order Summary</div>
            {cart.map(ci => (
              <div key={String(ci.item.id)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', fontSize: 14 }}>
                <span>{ci.quantity}x {ci.item.emoji || ''} {ci.item.name}</span>
                <span style={{ color: '#f97316', fontWeight: 600 }}>{(ci.item.price * ci.quantity).toLocaleString()} DA</span>
              </div>
            ))}
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', marginTop: 12, paddingTop: 12, display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 16 }}>
              <span>Total</span>
              <span style={{ color: '#f97316' }}>{cartTotal.toLocaleString()} DA</span>
            </div>
          </div>

          {/* Submit */}
          <button
            onClick={submitOrder}
            disabled={submitting}
            style={{
              width: '100%', padding: '16px', borderRadius: 14, border: 'none',
              background: submitting ? '#666' : '#f97316', color: '#fff',
              fontSize: 16, fontWeight: 700, cursor: submitting ? 'default' : 'pointer',
              opacity: submitting ? 0.7 : 1,
            }}
          >
            {submitting ? 'Placing Order...' : `Place Order - ${cartTotal.toLocaleString()} DA`}
          </button>
        </div>
      </div>
    )
  }

  // Cart overlay
  if (showCart) {
    return (
      <div style={{
        minHeight: '100vh', background: '#0a0a0f', color: '#fff',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}>
        {/* Header */}
        <div style={{
          position: 'sticky', top: 0, zIndex: 10, background: '#1a1a1a',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', height: 56,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              onClick={() => setShowCart(false)}
              style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', borderRadius: 8, padding: '6px 12px', fontSize: 16, cursor: 'pointer' }}
            >
              ←
            </button>
            <span style={{ fontWeight: 700, fontSize: 16 }}>Your Cart ({cartCount})</span>
          </div>
          {cart.length > 0 && (
            <button
              onClick={clearCart}
              style={{ background: 'none', border: 'none', color: '#f44', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
            >
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
            {cart.map(ci => (
              <div key={String(ci.item.id)} style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px',
                borderBottom: '1px solid rgba(255,255,255,0.06)',
              }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 10, background: 'rgba(255,255,255,0.06)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, flexShrink: 0,
                }}>
                  {ci.item.emoji || '🍽️'}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ci.item.name}</div>
                  <div style={{ fontSize: 13, color: '#f97316', fontWeight: 600, marginTop: 2 }}>{(ci.item.price * ci.quantity).toLocaleString()} DA</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  <button
                    onClick={() => removeFromCart(ci.item.id)}
                    style={{
                      width: 32, height: 32, borderRadius: 8, border: '1px solid rgba(255,255,255,0.15)',
                      background: 'none', color: '#fff', fontSize: 18, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    −
                  </button>
                  <span style={{ fontSize: 14, fontWeight: 800, color: '#f97316', minWidth: 20, textAlign: 'center' }}>{ci.quantity}</span>
                  <button
                    onClick={() => addToCart(ci.item)}
                    style={{
                      width: 32, height: 32, borderRadius: 8, border: 'none',
                      background: '#f97316', color: '#fff', fontSize: 18, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    +
                  </button>
                </div>
              </div>
            ))}

            {/* Checkout bar */}
            <div style={{
              position: 'fixed', bottom: 0, left: 0, right: 0,
              background: '#1a1a1a', borderTop: '1px solid rgba(255,255,255,0.1)',
              padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <div>
                <div style={{ fontSize: 12, color: '#aaa' }}>Total</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#f97316' }}>{cartTotal.toLocaleString()} DA</div>
              </div>
              <button
                onClick={() => setShowOrderForm(true)}
                style={{
                  background: '#f97316', border: 'none', color: '#fff', padding: '12px 24px',
                  borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: 'pointer',
                }}
              >
                Checkout →
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  // Main menu view
  return (
    <div style={{
      minHeight: '100vh', background: '#0a0a0f', color: '#fff',
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      {/* Header */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 10, background: '#1a1a1a',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 16px', height: 56,
      }}>
        <div style={{ fontWeight: 700, fontSize: 16, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1, minWidth: 0 }}>
          {restaurantName}
        </div>
        <button
          onClick={() => setShowCart(true)}
          style={{
            background: '#f97316', border: 'none', color: '#fff', borderRadius: 20,
            padding: '7px 14px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
          }}
        >
          🛒
          {cartCount > 0 && (
            <span style={{
              background: '#fff', color: '#f97316', borderRadius: '50%',
              width: 20, height: 20, fontSize: 11, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {cartCount}
            </span>
          )}
        </button>
      </div>

      {/* Category tabs */}
      <div
        ref={categoryScrollRef}
        style={{
          position: 'sticky', top: 56, zIndex: 9, background: '#111118',
          display: 'flex', overflowX: 'auto', gap: 6, padding: '10px 12px',
          scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch',
        }}
      >
        {categories.map(cat => (
          <button
            key={String(cat.id)}
            onClick={() => setSelectedCategory(cat.id)}
            style={{
              flexShrink: 0, padding: '8px 16px', borderRadius: 20,
              border: String(selectedCategory) === String(cat.id) ? '1.5px solid #f97316' : '1.5px solid rgba(255,255,255,0.1)',
              background: String(selectedCategory) === String(cat.id) ? 'rgba(249,115,22,0.15)' : 'rgba(255,255,255,0.04)',
              color: String(selectedCategory) === String(cat.id) ? '#f97316' : '#aaa',
              fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
              transition: 'all 0.15s',
            }}
          >
            {cat.emoji ? `${cat.emoji} ` : ''}{cat.name}
          </button>
        ))}
      </div>

      {/* Items grid */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
        gap: 10, padding: 12, paddingBottom: cartCount > 0 ? 80 : 12,
      }}>
        {filteredItems.map(item => {
          const qty = getCartQty(item.id)
          return (
            <div
              key={String(item.id)}
              onClick={() => addToCart(item)}
              style={{
                background: qty > 0 ? 'rgba(249,115,22,0.08)' : 'rgba(255,255,255,0.04)',
                border: qty > 0 ? '1.5px solid rgba(249,115,22,0.3)' : '1px solid rgba(255,255,255,0.06)',
                borderRadius: 14, padding: 16, cursor: 'pointer',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                position: 'relative', transition: 'transform 0.1s',
              }}
            >
              {qty > 0 && (
                <div style={{
                  position: 'absolute', top: 8, right: 8, background: '#f97316', color: '#fff',
                  width: 22, height: 22, borderRadius: '50%', fontSize: 11, fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {qty}
                </div>
              )}
              <div style={{ fontSize: 32, lineHeight: 1 }}>{item.emoji || '🍽️'}</div>
              <div style={{ fontSize: 13, fontWeight: 600, textAlign: 'center', lineHeight: 1.2, color: '#fff' }}>{item.name}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#f97316' }}>{item.price.toLocaleString()} DA</div>
            </div>
          )
        })}
      </div>

      {/* Floating cart bar */}
      {cartCount > 0 && (
        <div
          onClick={() => setShowCart(true)}
          style={{
            position: 'fixed', bottom: 12, left: 12, right: 12, zIndex: 100,
            background: '#f97316', borderRadius: 16, padding: '14px 20px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            cursor: 'pointer', boxShadow: '0 8px 32px rgba(249,115,22,0.4)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{
              background: 'rgba(255,255,255,0.25)', borderRadius: '50%',
              width: 28, height: 28, fontSize: 13, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {cartCount}
            </span>
            <span style={{ fontWeight: 600, fontSize: 15 }}>View Cart</span>
          </div>
          <span style={{ fontWeight: 700, fontSize: 16 }}>{cartTotal.toLocaleString()} DA</span>
        </div>
      )}
    </div>
  )
}
