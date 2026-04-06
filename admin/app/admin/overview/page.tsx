import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

async function getOverviewData() {
  // Get all installations with their latest stats
  const { data: installations } = await supabase
    .from('installations')
    .select('machine_id, restaurant_name, phone, app_version, updated_at')
    .order('updated_at', { ascending: false })

  // Get last 30 days of daily stats
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const dateStr = thirtyDaysAgo.toISOString().split('T')[0]

  const { data: dailyStats } = await supabase
    .from('daily_stats')
    .select('*')
    .gte('date', dateStr)
    .order('date', { ascending: false })

  // Get top items across all restaurants (last 7 days)
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
  const weekStr = sevenDaysAgo.toISOString().split('T')[0]

  const { data: topItems } = await supabase
    .from('daily_top_items')
    .select('*')
    .gte('date', weekStr)
    .order('quantity_sold', { ascending: false })
    .limit(50)

  return { installations: installations || [], dailyStats: dailyStats || [], topItems: topItems || [] }
}

export default async function OverviewPage() {
  const { installations, dailyStats, topItems } = await getOverviewData()

  // Aggregate totals
  const totalRevenue = dailyStats.reduce((sum: number, s: any) => sum + Number(s.total_revenue), 0)
  const totalOrders = dailyStats.reduce((sum: number, s: any) => sum + s.order_count, 0)
  const activeRestaurants = new Set(dailyStats.map((s: any) => s.machine_id)).size

  // Per-restaurant summary (last 30 days)
  const restaurantMap = new Map<string, { name: string; version: string; lastSeen: string; revenue: number; orders: number; avgOrder: number; days: number }>()

  for (const inst of installations as any[]) {
    restaurantMap.set(inst.machine_id, {
      name: inst.restaurant_name || 'Unknown',
      version: inst.app_version || '?',
      lastSeen: inst.updated_at,
      revenue: 0,
      orders: 0,
      avgOrder: 0,
      days: 0
    })
  }

  for (const stat of dailyStats as any[]) {
    const r = restaurantMap.get(stat.machine_id)
    if (r) {
      r.revenue += Number(stat.total_revenue)
      r.orders += stat.order_count
      r.days += 1
    }
  }

  restaurantMap.forEach(r => {
    r.avgOrder = r.orders > 0 ? Math.round(r.revenue / r.orders) : 0
  })

  const restaurants = Array.from(restaurantMap.entries())
    .map(([id, data]) => ({ id, ...data }))
    .sort((a, b) => b.revenue - a.revenue)

  // Aggregate top items across restaurants
  const itemAgg = new Map<string, { name: string; qty: number; revenue: number }>()
  for (const item of topItems as any[]) {
    const existing = itemAgg.get(item.menu_item_name) || { name: item.menu_item_name, qty: 0, revenue: 0 }
    existing.qty += item.quantity_sold
    existing.revenue += Number(item.revenue)
    itemAgg.set(item.menu_item_name, existing)
  }
  const globalTopItems = Array.from(itemAgg.values()).sort((a, b) => b.qty - a.qty).slice(0, 10)

  // Revenue by day (last 30 days aggregated across all restaurants)
  const revenueByDay = new Map<string, { revenue: number; orders: number }>()
  for (const stat of dailyStats as any[]) {
    const existing = revenueByDay.get(stat.date) || { revenue: 0, orders: 0 }
    existing.revenue += Number(stat.total_revenue)
    existing.orders += stat.order_count
    revenueByDay.set(stat.date, existing)
  }
  const dailyChartData = Array.from(revenueByDay.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-14) // last 14 days

  const maxRevenue = Math.max(...dailyChartData.map(([, d]) => d.revenue), 1)

  function formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount) + ' DA'
  }

  function timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 60) return `${mins}m ago`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    return `${days}d ago`
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Overview</h1>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-xl border p-5">
          <p className="text-sm text-gray-500">Total Revenue (30d)</p>
          <p className="text-2xl font-bold text-orange-600">{formatCurrency(totalRevenue)}</p>
        </div>
        <div className="bg-white rounded-xl border p-5">
          <p className="text-sm text-gray-500">Total Orders (30d)</p>
          <p className="text-2xl font-bold text-blue-600">{totalOrders.toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-xl border p-5">
          <p className="text-sm text-gray-500">Active Restaurants</p>
          <p className="text-2xl font-bold text-green-600">{activeRestaurants}</p>
        </div>
        <div className="bg-white rounded-xl border p-5">
          <p className="text-sm text-gray-500">Avg Order Value</p>
          <p className="text-2xl font-bold text-purple-600">{totalOrders > 0 ? formatCurrency(Math.round(totalRevenue / totalOrders)) : '—'}</p>
        </div>
      </div>

      {/* Revenue chart (simple bar chart) */}
      {dailyChartData.length > 0 && (
        <div className="bg-white rounded-xl border p-5 mb-8">
          <h2 className="font-semibold text-gray-900 mb-4">Daily Revenue (Last 14 Days)</h2>
          <div className="flex items-end gap-1 h-40">
            {dailyChartData.map(([date, data]) => {
              const height = Math.max(4, (data.revenue / maxRevenue) * 100)
              const day = new Date(date + 'T00:00:00').toLocaleDateString('en', { weekday: 'short', day: 'numeric' })
              return (
                <div key={date} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-[10px] text-gray-400">{formatCurrency(data.revenue)}</span>
                  <div
                    className="w-full bg-orange-500 rounded-t-md transition-all hover:bg-orange-600"
                    style={{ height: `${height}%` }}
                    title={`${date}: ${formatCurrency(data.revenue)} (${data.orders} orders)`}
                  />
                  <span className="text-[10px] text-gray-500">{day}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Two columns: restaurants + top items */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Restaurants table */}
        <div className="bg-white rounded-xl border p-5">
          <h2 className="font-semibold text-gray-900 mb-4">Restaurants ({restaurants.length})</h2>
          {restaurants.length === 0 ? (
            <p className="text-gray-400 text-sm">No data yet. Stats sync daily from each restaurant.</p>
          ) : (
            <div className="space-y-3">
              {restaurants.map((r) => (
                <div key={r.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <p className="font-medium text-gray-900 text-sm">{r.name}</p>
                    <p className="text-xs text-gray-500">v{r.version} &middot; Last seen {timeAgo(r.lastSeen)}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-orange-600 text-sm">{formatCurrency(r.revenue)}</p>
                    <p className="text-xs text-gray-500">{r.orders} orders &middot; {r.days}d synced</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Global top items */}
        <div className="bg-white rounded-xl border p-5">
          <h2 className="font-semibold text-gray-900 mb-4">Top Items (Last 7 Days)</h2>
          {globalTopItems.length === 0 ? (
            <p className="text-gray-400 text-sm">No item data yet.</p>
          ) : (
            <div className="space-y-2">
              {globalTopItems.map((item, i) => (
                <div key={item.name} className="flex items-center justify-between p-2.5 rounded-lg hover:bg-gray-50">
                  <div className="flex items-center gap-3">
                    <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                      i === 0 ? 'bg-yellow-100 text-yellow-700' :
                      i === 1 ? 'bg-gray-100 text-gray-600' :
                      i === 2 ? 'bg-orange-100 text-orange-700' :
                      'bg-gray-50 text-gray-500'
                    }`}>
                      {i + 1}
                    </span>
                    <span className="text-sm font-medium text-gray-900">{item.name}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-bold text-gray-900">{item.qty} sold</span>
                    <span className="text-xs text-gray-400 ml-2">{formatCurrency(item.revenue)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
