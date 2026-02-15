import { useState, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { TrendingUp, TrendingDown, DollarSign, ShoppingCart, CalendarRange } from 'lucide-react'
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { formatCurrency } from '../../utils/formatCurrency'
import { removeRepeatedPrefix } from '../../utils/removeRepeatedPrefix'

const COLORS = ['#f97316', '#3b82f6', '#22c55e', '#eab308', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6']

type PeriodType = 'today' | 'week' | 'month' | '3months' | 'custom'

export function AnalyticsDashboard() {
  const { t } = useTranslation()
  const [period, setPeriod] = useState<PeriodType>('month')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [summary, setSummary] = useState<any>(null)
  const [revenueData, setRevenueData] = useState<any[]>([])
  const [topItems, setTopItems] = useState<any[]>([])
  const [categoryData, setCategoryData] = useState<any[]>([])
  const [workerPerf, setWorkerPerf] = useState<any[]>([])

  useEffect(() => {
    if (period !== 'custom') loadAnalytics()
  }, [period])

  const getDateRange = (): [string, string] => {
    if (period === 'custom' && customStart && customEnd) {
      return [customStart, customEnd]
    }

    const today = new Date()
    const end = today.toISOString().split('T')[0]
    let start: string

    if (period === 'today') {
      start = end
    } else if (period === 'week') {
      const weekAgo = new Date(today)
      weekAgo.setDate(weekAgo.getDate() - 7)
      start = weekAgo.toISOString().split('T')[0]
    } else if (period === '3months') {
      const threeMonthsAgo = new Date(today)
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3)
      start = threeMonthsAgo.toISOString().split('T')[0]
    } else {
      const monthAgo = new Date(today)
      monthAgo.setMonth(monthAgo.getMonth() - 1)
      start = monthAgo.toISOString().split('T')[0]
    }
    return [start, end]
  }

  const loadAnalytics = async () => {
    const [start, end] = getDateRange()
    const [sum, rev, top, cat, perf] = await Promise.all([
      window.api.analytics.getProfitSummary(start, end),
      window.api.analytics.getRevenueByDay(start, end),
      window.api.analytics.getTopSellingItems(start, end, 10),
      window.api.analytics.getRevenueByCategory(start, end),
      window.api.analytics.getWorkerPerformance(start, end)
    ])
    setSummary(sum)
    setRevenueData(rev)
    setTopItems(top)
    setCategoryData(cat)
    setWorkerPerf(perf)
  }

  const applyCustomRange = () => {
    if (customStart && customEnd) {
      loadAnalytics()
    }
  }

  const periodButtons: { key: PeriodType; label: string }[] = [
    { key: 'today', label: t('analytics.today') },
    { key: 'week', label: t('analytics.thisWeek') },
    { key: 'month', label: t('analytics.thisMonth') },
    { key: '3months', label: t('analytics.last3Months', { defaultValue: 'Last 3 Months' }) },
    { key: 'custom', label: t('analytics.custom', { defaultValue: 'Custom' }) }
  ]

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-gray-900">{t('analytics.title')}</h1>
        <div className="flex gap-2">
          {periodButtons.map((p) => (
            <Button
              key={p.key}
              variant={period === p.key ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => setPeriod(p.key)}
            >
              {p.key === 'custom' && <CalendarRange className="h-3.5 w-3.5" />}
              {p.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Custom date range picker */}
      {period === 'custom' && (
        <div className="flex items-center gap-3 mb-4 bg-white border rounded-xl px-4 py-3">
          <label className="text-sm text-gray-600 font-medium">{t('analytics.from', { defaultValue: 'From' })}:</label>
          <input
            type="date"
            value={customStart}
            onChange={(e) => setCustomStart(e.target.value)}
            className="border rounded-lg px-3 py-1.5 text-sm"
          />
          <label className="text-sm text-gray-600 font-medium">{t('analytics.to', { defaultValue: 'To' })}:</label>
          <input
            type="date"
            value={customEnd}
            onChange={(e) => setCustomEnd(e.target.value)}
            className="border rounded-lg px-3 py-1.5 text-sm"
          />
          <Button size="sm" onClick={applyCustomRange} disabled={!customStart || !customEnd}>
            {t('analytics.apply', { defaultValue: 'Apply' })}
          </Button>
        </div>
      )}

      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-4 gap-4 mb-6">
          <Card className="!p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <DollarSign className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-xs text-gray-500">{t('analytics.revenue')}</p>
                <p className="text-lg font-bold">{formatCurrency(summary.total_revenue)}</p>
              </div>
            </div>
          </Card>
          <Card className="!p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-100 rounded-lg">
                <TrendingDown className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <p className="text-xs text-gray-500">{t('analytics.costs')}</p>
                <p className="text-lg font-bold">
                  {formatCurrency(summary.total_stock_cost + summary.total_worker_cost)}
                </p>
              </div>
            </div>
          </Card>
          <Card className="!p-4">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${summary.net_profit >= 0 ? 'bg-green-100' : 'bg-red-100'}`}>
                <TrendingUp className={`h-5 w-5 ${summary.net_profit >= 0 ? 'text-green-600' : 'text-red-600'}`} />
              </div>
              <div>
                <p className="text-xs text-gray-500">{t('analytics.profit')}</p>
                <p className={`text-lg font-bold ${summary.net_profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatCurrency(summary.net_profit)}
                </p>
              </div>
            </div>
          </Card>
          <Card className="!p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <ShoppingCart className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-xs text-gray-500">{t('analytics.orderCount')}</p>
                <p className="text-lg font-bold">{summary.order_count}</p>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Charts */}
      <div className="grid grid-cols-2 gap-6 mb-6">
        {/* Revenue trend */}
        <Card title={t('analytics.revenue')}>
          {revenueData.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={revenueData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Line type="monotone" dataKey="revenue" stroke="#f97316" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-center text-gray-400 py-8">{t('analytics.noData')}</p>
          )}
        </Card>

        {/* Revenue by category pie chart */}
        <Card title={t('analytics.byCategory')}>
          {categoryData.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={categoryData}
                  dataKey="total_revenue"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  label={(entry) => entry.name}
                >
                  {categoryData.map((_, index) => (
                    <Cell key={index} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-center text-gray-400 py-8">{t('analytics.noData')}</p>
          )}
        </Card>
      </div>

      {/* Top items */}
      <div className="grid grid-cols-2 gap-6 mb-6">
        <Card title={t('analytics.topItems')}>
          {topItems.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={(() => {
                // Simplify item names by removing repeated prefixes
                const names = topItems.map(item => item.name)
                const simplified = removeRepeatedPrefix(names, 0.4)
                return topItems.map(item => ({
                  ...item,
                  displayName: simplified.get(item.name) || item.name,
                  // Truncate if still too long (max 20 chars)
                  name: (simplified.get(item.name) || item.name).length > 20
                    ? (simplified.get(item.name) || item.name).substring(0, 17) + '...'
                    : simplified.get(item.name) || item.name
                }))
              })()} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" tick={{ fontSize: 12 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={140} />
                <Tooltip formatter={(value, name, props) => [value, props.payload.displayName]} />
                <Bar dataKey="total_quantity" fill="#f97316" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-center text-gray-400 py-8">{t('analytics.noData')}</p>
          )}
        </Card>

        {/* Worker performance */}
        <Card title={t('analytics.workerPerformance')}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-start px-3 py-2">{t('workers.name')}</th>
                  <th className="text-start px-3 py-2">{t('workers.role')}</th>
                  <th className="text-start px-3 py-2">{t('analytics.ordersHandled')}</th>
                  <th className="text-start px-3 py-2">{t('analytics.revenue')}</th>
                  <th className="text-start px-3 py-2">{t('analytics.totalPay')}</th>
                </tr>
              </thead>
              <tbody>
                {workerPerf.map((w: any) => (
                  <tr key={w.id} className="border-t">
                    <td className="px-3 py-2 font-medium">{w.name}</td>
                    <td className="px-3 py-2">{t(`workers.roles.${w.role}`)}</td>
                    <td className="px-3 py-2">{w.orders_handled || 0}</td>
                    <td className="px-3 py-2">{formatCurrency(w.total_revenue || 0)}</td>
                    <td className="px-3 py-2">{formatCurrency(w.total_pay || 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {workerPerf.length === 0 && (
              <p className="text-center text-gray-400 py-8">{t('analytics.noData')}</p>
            )}
          </div>
        </Card>
      </div>
    </div>
  )
}
