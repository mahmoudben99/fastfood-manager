import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { X, ShoppingCart, TrendingUp, DollarSign, Package } from 'lucide-react'
import { formatCurrency } from '../../utils/formatCurrency'
import { useAppStore } from '../../store/appStore'

interface DayRecapModalProps {
  isOpen: boolean
  onClose: () => void
}

interface ProfitSummary {
  total_revenue: number
  order_count: number
  total_stock_cost: number
  total_worker_cost: number
  net_profit: number
}

interface TopItem {
  name: string
  name_ar?: string
  name_fr?: string
  total_quantity: number
  total_revenue: number
  category_name: string
}

interface OrderTypeEntry {
  order_type: string
  count: number
  revenue: number
}

export function DayRecapModal({ isOpen, onClose }: DayRecapModalProps) {
  const { t } = useTranslation()
  const { foodLanguage } = useAppStore()
  const [summary, setSummary] = useState<ProfitSummary | null>(null)
  const [topItems, setTopItems] = useState<TopItem[]>([])
  const [orderTypes, setOrderTypes] = useState<OrderTypeEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [currentTime, setCurrentTime] = useState(new Date())

  useEffect(() => {
    if (!isOpen) return

    const loadData = async () => {
      setLoading(true)
      const today = new Date().toISOString().split('T')[0]
      try {
        const [sum, top, types] = await Promise.all([
          window.api.analytics.getProfitSummary(today, today),
          window.api.analytics.getTopSellingItems(today, today, 3),
          window.api.analytics.getOrderTypeBreakdown(today, today)
        ])
        setSummary(sum)
        setTopItems(top)
        setOrderTypes(types)
      } catch (err) {
        console.error('Failed to load day recap:', err)
      } finally {
        setLoading(false)
      }
    }

    loadData()
    setCurrentTime(new Date())

    const timer = setInterval(() => setCurrentTime(new Date()), 60_000)
    return () => clearInterval(timer)
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleEsc)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleEsc)
      document.body.style.overflow = ''
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  const formattedDate = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })

  const formattedTime = currentTime.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit'
  })

  const getItemName = (item: TopItem): string => {
    if (foodLanguage === 'ar' && item.name_ar) return item.name_ar
    if (foodLanguage === 'fr' && item.name_fr) return item.name_fr
    return item.name
  }

  const hasOrders = summary && summary.order_count > 0

  const rankColors = ['text-yellow-400', 'text-gray-300', 'text-amber-600']
  const rankLabels = ['#1', '#2', '#3']

  return (
    <div className="fixed inset-0 flex items-center justify-center" style={{ zIndex: 50 }}>
      <div className="fixed inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-gray-900 text-white rounded-xl shadow-2xl max-w-2xl w-full mx-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
          <div>
            <h2 className="text-xl font-bold">Day Recap</h2>
            <p className="text-sm text-gray-400 mt-0.5">{formattedDate}</p>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-400">{formattedTime}</span>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-5 overflow-y-auto flex-1 space-y-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-8 w-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : !hasOrders ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400">
              <ShoppingCart className="h-12 w-12 mb-3 opacity-40" />
              <p className="text-lg">No orders yet today</p>
            </div>
          ) : (
            <>
              {/* Stat Cards */}
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-gray-800 rounded-xl p-4 text-center">
                  <div className="flex items-center justify-center mb-2">
                    <DollarSign className="h-5 w-5 text-orange-400" />
                  </div>
                  <p className="text-2xl font-bold text-orange-400">
                    {formatCurrency(summary!.total_revenue)}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">Total Revenue</p>
                </div>

                <div className="bg-gray-800 rounded-xl p-4 text-center">
                  <div className="flex items-center justify-center mb-2">
                    <ShoppingCart className="h-5 w-5 text-blue-400" />
                  </div>
                  <p className="text-2xl font-bold text-blue-400">
                    {summary!.order_count}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">Orders</p>
                </div>

                <div className="bg-gray-800 rounded-xl p-4 text-center">
                  <div className="flex items-center justify-center mb-2">
                    <TrendingUp className="h-5 w-5 text-green-400" />
                  </div>
                  <p
                    className={`text-2xl font-bold ${
                      summary!.net_profit >= 0 ? 'text-green-400' : 'text-red-400'
                    }`}
                  >
                    {formatCurrency(summary!.net_profit)}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">Net Profit</p>
                </div>
              </div>

              {/* Order Types */}
              {orderTypes.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wide mb-3">
                    Order Types
                  </h3>
                  <div className="grid grid-cols-3 gap-3">
                    {orderTypes.map((ot) => (
                      <div
                        key={ot.order_type}
                        className="bg-gray-800/60 border border-gray-700 rounded-lg px-4 py-3 flex items-center justify-between"
                      >
                        <span className="text-sm text-gray-300 capitalize">
                          {ot.order_type}
                        </span>
                        <div className="text-right">
                          <span className="text-sm font-semibold text-white">{ot.count}</span>
                          <p className="text-xs text-gray-500">{formatCurrency(ot.revenue)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Top 3 Items */}
              {topItems.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wide mb-3">
                    Top {topItems.length} Items
                  </h3>
                  <div className="space-y-2">
                    {topItems.map((item, idx) => (
                      <div
                        key={idx}
                        className="bg-gray-800/60 border border-gray-700 rounded-lg px-4 py-3 flex items-center gap-4"
                      >
                        <span className={`text-lg font-bold w-8 ${rankColors[idx] || 'text-gray-400'}`}>
                          {rankLabels[idx] || `#${idx + 1}`}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-white truncate">
                            {getItemName(item)}
                          </p>
                          <p className="text-xs text-gray-500">{item.category_name}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-semibold text-white">
                            {item.total_quantity} sold
                          </p>
                          <p className="text-xs text-gray-400">
                            {formatCurrency(item.total_revenue)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
