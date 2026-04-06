'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

// ── Types ──────────────────────────────────────────────────────

interface Order {
  id: string
  order_number: number
  items_summary: string
  total: number
  status: string
  order_type: string
  created_at: string
}

interface Stats {
  totalRevenue: number
  orderCount: number
  avgOrder: number
}

interface PopularItem {
  name: string
  count: number
}

interface DashboardData {
  orders: Order[]
  stats: Stats
  popularItems: PopularItem[]
}

interface DailyStat {
  date: string
  order_count: number
  total_revenue: number
  avg_order_value: number
}

// ── Helpers ────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diff = Math.max(0, Math.floor((now - then) / 1000))
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

function formatCurrency(amount: number): string {
  return amount.toLocaleString('en-US') + ' DA'
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  })
}

const SESSION_KEY = 'ffm-owner-session'
const SESSION_DURATION = 24 * 60 * 60 * 1000 // 24 hours

function getSession(machineId: string): boolean {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return false
    const session = JSON.parse(raw)
    if (session.machineId !== machineId) return false
    if (Date.now() - session.timestamp > SESSION_DURATION) {
      localStorage.removeItem(SESSION_KEY)
      return false
    }
    return true
  } catch {
    return false
  }
}

function saveSession(machineId: string) {
  localStorage.setItem(
    SESSION_KEY,
    JSON.stringify({ machineId, timestamp: Date.now() })
  )
}

// ── Status Badge ───────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const s = status.toLowerCase()
  let bg = 'bg-gray-700 text-gray-300'
  let label = status
  if (s === 'preparing' || s === 'pending') {
    bg = 'bg-orange-500/20 text-orange-400'
    label = 'Preparing'
  } else if (s === 'completed' || s === 'done') {
    bg = 'bg-green-500/20 text-green-400'
    label = 'Completed'
  } else if (s === 'cancelled') {
    bg = 'bg-red-500/20 text-red-400'
    label = 'Cancelled'
  }
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${bg}`}>
      {label}
    </span>
  )
}

// ── Order Type Badge ──────────────────────────────────────────

function OrderTypeBadge({ type }: { type: string }) {
  const t = (type || '').toLowerCase()
  let bg = 'bg-blue-500/20 text-blue-400'
  let label = 'Local'
  if (t === 'takeout' || t === 'takeaway') {
    bg = 'bg-purple-500/20 text-purple-400'
    label = 'Takeout'
  } else if (t === 'delivery') {
    bg = 'bg-cyan-500/20 text-cyan-400'
    label = 'Delivery'
  }
  return (
    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${bg}`}>
      {label}
    </span>
  )
}

// ── Password Login ────────────────────────────────────────────

function PasswordLogin({
  restaurantName,
  machineId,
  onSuccess
}: {
  restaurantName: string
  machineId: string
  onSuccess: () => void
}) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!password.trim()) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/owner/verify-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ machineId, pin: password })
      })
      if (res.ok) {
        saveSession(machineId)
        onSuccess()
      } else {
        setError('Wrong password. Try again.')
        setPassword('')
      }
    } catch {
      setError('Connection error. Try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-950 text-white px-6">
      <div className="w-full max-w-xs">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="w-16 h-16 bg-orange-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h1 className="text-lg font-bold">{restaurantName}</h1>
          <p className="text-gray-400 text-sm mt-1">Enter admin password</p>
        </div>

        {/* Password form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="password"
            value={password}
            onChange={(e) => { setPassword(e.target.value); setError('') }}
            placeholder="Admin password"
            autoFocus
            className="w-full h-12 rounded-xl bg-gray-800 border border-gray-700 px-4 text-white placeholder-gray-500 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-colors"
          />

          {/* Error */}
          {error && (
            <p className="text-red-400 text-sm text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || !password.trim()}
            className="w-full h-12 rounded-xl bg-orange-500 hover:bg-orange-600 active:bg-orange-700 text-white font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Verifying...' : 'Login'}
          </button>
        </form>
      </div>
    </div>
  )
}

// ── Stats Tab ─────────────────────────────────────────────────

function StatsTab({ machineId }: { machineId: string }) {
  const [period, setPeriod] = useState<'week' | 'month'>('week')
  const [stats, setStats] = useState<DailyStat[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/owner/stats?machineId=${machineId}&period=${period}`, { cache: 'no-store' })
      .then(res => res.ok ? res.json() : { days: [] })
      .then(data => { setStats(data.days || []); setLoading(false) })
      .catch(() => { setStats([]); setLoading(false) })
  }, [machineId, period])

  const totalRevenue = stats.reduce((s, d) => s + Number(d.total_revenue), 0)
  const totalOrders = stats.reduce((s, d) => s + Number(d.order_count), 0)
  const maxRevenue = Math.max(...stats.map(d => Number(d.total_revenue)), 1)

  return (
    <div className="space-y-5">
      {/* Period toggle */}
      <div className="flex gap-2">
        <button
          onClick={() => setPeriod('week')}
          className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
            period === 'week' ? 'bg-orange-500 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
          }`}
        >
          Last 7 Days
        </button>
        <button
          onClick={() => setPeriod('month')}
          className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
            period === 'month' ? 'bg-orange-500 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
          }`}
        >
          Last 30 Days
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-gray-900 rounded-xl p-3 text-center">
              <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">Total Revenue</p>
              <p className="text-lg font-bold text-orange-500">{formatCurrency(totalRevenue)}</p>
            </div>
            <div className="bg-gray-900 rounded-xl p-3 text-center">
              <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">Total Orders</p>
              <p className="text-lg font-bold">{totalOrders}</p>
            </div>
          </div>

          {/* Bar chart */}
          {stats.length > 0 ? (
            <div className="bg-gray-900 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-gray-300 mb-3">Revenue by Day</h3>
              <div className="space-y-2">
                {stats.map(day => {
                  const pct = maxRevenue > 0 ? (Number(day.total_revenue) / maxRevenue) * 100 : 0
                  const dateLabel = new Date(day.date + 'T12:00:00').toLocaleDateString('en-US', {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric'
                  })
                  return (
                    <div key={day.date}>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-gray-400">{dateLabel}</span>
                        <span className="text-gray-300">{formatCurrency(Number(day.total_revenue))}</span>
                      </div>
                      <div className="h-3 bg-gray-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-orange-500 rounded-full transition-all duration-300"
                          style={{ width: `${Math.max(pct, 1)}%` }}
                        />
                      </div>
                      <p className="text-[10px] text-gray-500 mt-0.5">{day.order_count} orders</p>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            <div className="bg-gray-900 rounded-xl p-8 text-center">
              <p className="text-gray-400 text-sm">No data for this period</p>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── Stock Alerts Tab (placeholder) ────────────────────────────

function StockAlertsTab() {
  return (
    <div className="bg-gray-900 rounded-xl p-8 text-center">
      <p className="text-3xl mb-3">&#x1F4E6;</p>
      <p className="text-gray-300 text-sm font-medium">Stock monitoring coming soon</p>
      <p className="text-gray-500 text-xs mt-2">You will be able to track ingredient levels and get low-stock alerts here.</p>
    </div>
  )
}

// ── Main Dashboard ─────────────────────────────────────────────

function Dashboard({
  machineId,
  restaurantName
}: {
  machineId: string
  restaurantName: string
}) {
  const [activeTab, setActiveTab] = useState<'today' | 'stats' | 'stock'>('today')
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date())
  const [secondsAgo, setSecondsAgo] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const prevOrderIdsRef = useRef<Set<string>>(new Set())
  const [newOrderIds, setNewOrderIds] = useState<Set<string>>(new Set())

  const fetchData = useCallback(async (isManual = false) => {
    if (isManual) setRefreshing(true)
    try {
      const res = await fetch(`/api/owner/data?machineId=${machineId}`, {
        cache: 'no-store'
      })
      if (res.ok) {
        const json: DashboardData = await res.json()
        // Detect new orders for animation
        const currentIds = new Set(json.orders.map((o: any) => o.id))
        if (prevOrderIdsRef.current.size > 0) {
          const fresh = new Set<string>()
          Array.from(currentIds).forEach((id: string) => {
            if (!prevOrderIdsRef.current.has(id)) fresh.add(id)
          })
          if (fresh.size > 0) {
            setNewOrderIds(fresh)
            setTimeout(() => setNewOrderIds(new Set()), 1500)
          }
        }
        prevOrderIdsRef.current = currentIds
        setData(json)
        setLastUpdated(new Date())
        setSecondsAgo(0)
      }
    } catch {
      // Silent fail on refresh
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [machineId])

  // Initial fetch + 30s auto-refresh
  useEffect(() => {
    fetchData()
    const interval = setInterval(() => fetchData(), 30000)
    return () => clearInterval(interval)
  }, [fetchData])

  // Update "seconds ago" counter
  useEffect(() => {
    const tick = setInterval(() => {
      setSecondsAgo(Math.floor((Date.now() - lastUpdated.getTime()) / 1000))
    }, 1000)
    return () => clearInterval(tick)
  }, [lastUpdated])

  const now = new Date()
  const dateStr = now.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  })

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950 text-white">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-400 text-sm">Loading dashboard...</p>
        </div>
      </div>
    )
  }

  const stats = data?.stats || { totalRevenue: 0, orderCount: 0, avgOrder: 0 }
  const orders = data?.orders || []
  const popularItems = data?.popularItems || []

  // Order count by type
  const nonCancelled = orders.filter(o => o.status !== 'cancelled')
  const localCount = nonCancelled.filter(o => !o.order_type || o.order_type === 'local' || o.order_type === 'dine_in').length
  const takeoutCount = nonCancelled.filter(o => o.order_type === 'takeout' || o.order_type === 'takeaway').length
  const deliveryCount = nonCancelled.filter(o => o.order_type === 'delivery').length

  const dashTabs = [
    { key: 'today' as const, label: 'Today' },
    { key: 'stats' as const, label: 'Stats' },
    { key: 'stock' as const, label: 'Stock' }
  ]

  return (
    <div className="min-h-screen bg-gray-950 text-white pb-8">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-gray-950/95 backdrop-blur-sm border-b border-gray-800 px-4 py-3">
        <div className="flex items-center justify-between max-w-lg mx-auto">
          <div>
            <h1 className="text-base font-bold truncate max-w-[200px]">{restaurantName}</h1>
            <p className="text-xs text-gray-400">{dateStr}</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[10px] text-gray-500">
              {secondsAgo < 5 ? 'Just now' : `${secondsAgo}s ago`}
            </span>
            <button
              onClick={() => fetchData(true)}
              disabled={refreshing}
              className="w-9 h-9 rounded-lg bg-gray-800 hover:bg-gray-700 active:bg-gray-600 flex items-center justify-center transition-colors disabled:opacity-50"
            >
              <svg
                className={`w-4 h-4 text-gray-300 ${refreshing ? 'animate-spin' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 max-w-lg mx-auto mt-3">
          {dashTabs.map(t => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${
                activeTab === t.key
                  ? 'bg-orange-500 text-white'
                  : 'bg-gray-800/50 text-gray-400 hover:bg-gray-800'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-4 space-y-5">
        {/* Today Tab */}
        {activeTab === 'today' && (
          <>
            {/* Stats Cards */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-gray-900 rounded-xl p-3 text-center">
                <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">Revenue</p>
                <p className="text-lg font-bold text-orange-500">
                  {formatCurrency(stats.totalRevenue)}
                </p>
              </div>
              <div className="bg-gray-900 rounded-xl p-3 text-center">
                <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">Orders</p>
                <p className="text-lg font-bold">{stats.orderCount}</p>
                {/* Order type badges */}
                {stats.orderCount > 0 && (
                  <div className="flex flex-wrap justify-center gap-1 mt-1">
                    {localCount > 0 && (
                      <span className="text-[9px] bg-blue-500/15 text-blue-400 px-1.5 py-0.5 rounded">{localCount} local</span>
                    )}
                    {takeoutCount > 0 && (
                      <span className="text-[9px] bg-purple-500/15 text-purple-400 px-1.5 py-0.5 rounded">{takeoutCount} takeout</span>
                    )}
                    {deliveryCount > 0 && (
                      <span className="text-[9px] bg-cyan-500/15 text-cyan-400 px-1.5 py-0.5 rounded">{deliveryCount} delivery</span>
                    )}
                  </div>
                )}
              </div>
              <div className="bg-gray-900 rounded-xl p-3 text-center">
                <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">Avg Order</p>
                <p className="text-lg font-bold">{formatCurrency(stats.avgOrder)}</p>
              </div>
            </div>

            {/* Popular Items */}
            {popularItems.length > 0 && (
              <div className="bg-gray-900 rounded-xl p-4">
                <h2 className="text-sm font-semibold text-gray-300 mb-3">Popular Today</h2>
                <div className="space-y-2">
                  {popularItems.map((item, i) => (
                    <div key={item.name} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500 w-4">{i + 1}.</span>
                        <span className="text-sm">{item.name}</span>
                      </div>
                      <span className="text-xs text-orange-400 font-medium bg-orange-500/10 px-2 py-0.5 rounded-full">
                        x{item.count}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Live Orders */}
            <div>
              <h2 className="text-sm font-semibold text-gray-300 mb-3">
                Today&apos;s Orders
                {orders.length > 0 && (
                  <span className="text-gray-500 font-normal ml-2">({orders.length})</span>
                )}
              </h2>

              {orders.length === 0 ? (
                <div className="bg-gray-900 rounded-xl p-8 text-center">
                  <p className="text-4xl mb-3">&#x1F4CB;</p>
                  <p className="text-gray-400 text-sm">No orders yet today</p>
                  <p className="text-gray-500 text-xs mt-1">Orders will appear here in real-time</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {orders.map(order => {
                    const isNew = newOrderIds.has(order.id)
                    return (
                      <div
                        key={order.id}
                        className={`bg-gray-900 rounded-xl p-3 transition-all duration-500 ${
                          isNew ? 'ring-1 ring-orange-500 bg-orange-500/5 animate-pulse' : ''
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-orange-500">
                              #{order.order_number}
                            </span>
                            <OrderTypeBadge type={order.order_type} />
                            <span className="text-[10px] text-gray-500">
                              {formatTime(order.created_at)} &middot; {timeAgo(order.created_at)}
                            </span>
                          </div>
                          <StatusBadge status={order.status} />
                        </div>
                        <div className="flex items-center justify-between">
                          <p className="text-xs text-gray-400 truncate max-w-[65%]">
                            {order.items_summary || 'No items'}
                          </p>
                          <p className="text-sm font-semibold">{formatCurrency(order.total)}</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </>
        )}

        {/* Stats Tab */}
        {activeTab === 'stats' && <StatsTab machineId={machineId} />}

        {/* Stock Alerts Tab */}
        {activeTab === 'stock' && <StockAlertsTab />}
      </div>
    </div>
  )
}

// ── Export ──────────────────────────────────────────────────────

export function OwnerDashboard({
  machineId,
  restaurantName
}: {
  machineId: string
  restaurantName: string
}) {
  const [authenticated, setAuthenticated] = useState(false)
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    setAuthenticated(getSession(machineId))
    setChecked(true)
  }, [machineId])

  if (!checked) return null

  if (!authenticated) {
    return (
      <PasswordLogin
        restaurantName={restaurantName}
        machineId={machineId}
        onSuccess={() => setAuthenticated(true)}
      />
    )
  }

  return <Dashboard machineId={machineId} restaurantName={restaurantName} />
}
