'use client'

import { useState, useMemo } from 'react'

interface Props {
  installations: any[]
  dailyStats: any[]
  topItems: any[]
  yesterdayStr: string
  weekStr: string
}

type SortKey = 'name' | 'today' | 'week'

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount) + ' DA'
}

export function OverviewClient({ installations, dailyStats, topItems, yesterdayStr, weekStr }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('week')
  const [sortAsc, setSortAsc] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // Build restaurant data
  const restaurants = useMemo(() => {
    const map = new Map<string, {
      id: string; name: string; version: string; joined: string; lastSeen: string;
      todaySells: number; todayRevenue: number;
      weekSells: number; weekRevenue: number;
      dailyData: { date: string; orders: number; revenue: number }[];
      topItems: { name: string; qty: number; revenue: number }[];
    }>()

    for (const inst of installations) {
      map.set(inst.machine_id, {
        id: inst.machine_id,
        name: inst.restaurant_name || 'Unknown',
        version: inst.app_version || '?',
        joined: inst.created_at || inst.updated_at,
        lastSeen: inst.updated_at,
        todaySells: 0, todayRevenue: 0,
        weekSells: 0, weekRevenue: 0,
        dailyData: [],
        topItems: []
      })
    }

    // Aggregate daily stats
    for (const stat of dailyStats) {
      const r = map.get(stat.machine_id)
      if (!r) continue

      r.dailyData.push({ date: stat.date, orders: stat.order_count, revenue: Number(stat.total_revenue) })

      if (stat.date === yesterdayStr) {
        r.todaySells += stat.order_count
        r.todayRevenue += Number(stat.total_revenue)
      }
      if (stat.date >= weekStr) {
        r.weekSells += stat.order_count
        r.weekRevenue += Number(stat.total_revenue)
      }
    }

    // Aggregate top items per restaurant
    for (const item of topItems) {
      const r = map.get(item.machine_id)
      if (!r) continue
      const existing = r.topItems.find(t => t.name === item.menu_item_name)
      if (existing) {
        existing.qty += item.quantity_sold
        existing.revenue += Number(item.revenue)
      } else {
        r.topItems.push({ name: item.menu_item_name, qty: item.quantity_sold, revenue: Number(item.revenue) })
      }
    }

    // Sort top items
    for (const r of Array.from(map.values())) {
      r.topItems.sort((a, b) => b.qty - a.qty)
      r.dailyData.sort((a, b) => a.date.localeCompare(b.date))
    }

    return Array.from(map.values())
  }, [installations, dailyStats, topItems, yesterdayStr, weekStr])

  // Sorted list
  const sorted = useMemo(() => {
    const list = [...restaurants]
    list.sort((a, b) => {
      let diff = 0
      if (sortKey === 'name') diff = a.name.localeCompare(b.name)
      else if (sortKey === 'today') diff = a.todaySells - b.todaySells
      else diff = a.weekSells - b.weekSells
      return sortAsc ? diff : -diff
    })
    return list
  }, [restaurants, sortKey, sortAsc])

  const selected = selectedId ? restaurants.find(r => r.id === selectedId) : null

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc)
    else { setSortKey(key); setSortAsc(false) }
  }

  const arrow = (key: SortKey) => sortKey === key ? (sortAsc ? ' ↑' : ' ↓') : ''

  // Totals
  const totalToday = restaurants.reduce((s, r) => s + r.todaySells, 0)
  const totalWeek = restaurants.reduce((s, r) => s + r.weekSells, 0)
  const totalWeekRevenue = restaurants.reduce((s, r) => s + r.weekRevenue, 0)

  // Detail view chart
  const chartData = selected?.dailyData.slice(-14) || []
  const maxRev = Math.max(...chartData.map(d => d.revenue), 1)

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Overview</h1>

      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl border p-5">
          <p className="text-sm text-gray-500">Restaurants</p>
          <p className="text-2xl font-bold text-blue-600">{restaurants.length}</p>
        </div>
        <div className="bg-white rounded-xl border p-5">
          <p className="text-sm text-gray-500">Yesterday&apos;s Orders (All)</p>
          <p className="text-2xl font-bold text-orange-600">{totalToday}</p>
        </div>
        <div className="bg-white rounded-xl border p-5">
          <p className="text-sm text-gray-500">This Week Revenue</p>
          <p className="text-2xl font-bold text-green-600">{formatCurrency(totalWeekRevenue)}</p>
          <p className="text-xs text-gray-400">{totalWeek} orders</p>
        </div>
      </div>

      {/* Back button when viewing detail */}
      {selected && (
        <button
          onClick={() => setSelectedId(null)}
          className="mb-4 text-sm text-orange-600 hover:text-orange-700 font-medium flex items-center gap-1"
        >
          ← Back to list
        </button>
      )}

      {/* TABLE VIEW */}
      {!selected && (
        <div className="bg-white rounded-xl border overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                <th className="px-5 py-3 cursor-pointer hover:text-gray-900" onClick={() => handleSort('name')}>
                  Restaurant{arrow('name')}
                </th>
                <th className="px-5 py-3">Date Joined</th>
                <th className="px-5 py-3">Version</th>
                <th className="px-5 py-3 cursor-pointer hover:text-gray-900 text-right" onClick={() => handleSort('today')}>
                  Yesterday Sells{arrow('today')}
                </th>
                <th className="px-5 py-3 cursor-pointer hover:text-gray-900 text-right" onClick={() => handleSort('week')}>
                  Week Sells{arrow('week')}
                </th>
                <th className="px-5 py-3 text-right">Week Revenue</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sorted.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-gray-400 text-sm">
                    No restaurants yet. Data syncs daily from each app.
                  </td>
                </tr>
              ) : (
                sorted.map(r => (
                  <tr
                    key={r.id}
                    onClick={() => setSelectedId(r.id)}
                    className="hover:bg-orange-50 cursor-pointer transition-colors"
                  >
                    <td className="px-5 py-3">
                      <p className="font-medium text-gray-900 text-sm">{r.name}</p>
                    </td>
                    <td className="px-5 py-3 text-sm text-gray-500">
                      {new Date(r.joined).toLocaleDateString('en', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </td>
                    <td className="px-5 py-3">
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">v{r.version}</span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <span className={`font-bold text-sm ${r.todaySells > 0 ? 'text-blue-600' : 'text-gray-300'}`}>
                        {r.todaySells}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <span className={`font-bold text-sm ${r.weekSells > 0 ? 'text-orange-600' : 'text-gray-300'}`}>
                        {r.weekSells}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <span className={`font-bold text-sm ${r.weekRevenue > 0 ? 'text-green-600' : 'text-gray-300'}`}>
                        {formatCurrency(r.weekRevenue)}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* DETAIL VIEW */}
      {selected && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl border p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xl font-bold text-gray-900">{selected.name}</h2>
                <p className="text-sm text-gray-500">v{selected.version} · Machine: {selected.id.slice(0, 8)}...</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-gray-500">This Week</p>
                <p className="text-2xl font-bold text-orange-600">{formatCurrency(selected.weekRevenue)}</p>
                <p className="text-sm text-gray-500">{selected.weekSells} orders</p>
              </div>
            </div>

            {/* Daily chart */}
            {chartData.length > 0 ? (
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Daily Revenue (Last 14 Days)</h3>
                <div className="flex items-end gap-1 h-40">
                  {chartData.map(d => {
                    const height = Math.max(4, (d.revenue / maxRev) * 100)
                    const day = new Date(d.date + 'T00:00:00').toLocaleDateString('en', { weekday: 'short', day: 'numeric' })
                    return (
                      <div key={d.date} className="flex-1 flex flex-col items-center gap-1">
                        <span className="text-[10px] text-gray-400">{d.orders}</span>
                        <div
                          className="w-full bg-orange-500 rounded-t-md hover:bg-orange-600 transition-all"
                          style={{ height: `${height}%` }}
                          title={`${d.date}: ${formatCurrency(d.revenue)} (${d.orders} orders)`}
                        />
                        <span className="text-[10px] text-gray-500">{day}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : (
              <p className="text-gray-400 text-sm">No daily data yet.</p>
            )}
          </div>

          {/* Top 3 items */}
          <div className="bg-white rounded-xl border p-6">
            <h3 className="font-semibold text-gray-900 mb-4">Most Sold Items (Last 7 Days)</h3>
            {selected.topItems.length === 0 ? (
              <p className="text-gray-400 text-sm">No item data yet.</p>
            ) : (
              <div className="space-y-3">
                {selected.topItems.slice(0, 3).map((item, i) => (
                  <div key={item.name} className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg">
                    <span className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${
                      i === 0 ? 'bg-yellow-100 text-yellow-700' :
                      i === 1 ? 'bg-gray-200 text-gray-600' :
                      'bg-orange-100 text-orange-700'
                    }`}>
                      #{i + 1}
                    </span>
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">{item.name}</p>
                      <p className="text-xs text-gray-500">{formatCurrency(item.revenue)} revenue</p>
                    </div>
                    <p className="text-lg font-bold text-gray-900">{item.qty} sold</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
