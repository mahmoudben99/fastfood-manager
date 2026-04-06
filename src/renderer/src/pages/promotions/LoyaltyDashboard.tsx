import { useState, useEffect } from 'react'
import { Search, ArrowUpDown, Phone, ShoppingCart, DollarSign, Star, ArrowLeft, Copy } from 'lucide-react'
import { formatCurrency } from '../../utils/formatCurrency'
import { useAppStore } from '../../store/appStore'

interface Customer {
  id: number
  phone: string
  name: string | null
  total_spent: number
  order_count: number
  last_order_date: string | null
  notes: string | null
}

type SortKey = 'total_spent' | 'order_count' | 'last_order'

export function LoyaltyDashboard() {
  const { foodLanguage } = useAppStore()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<SortKey>('total_spent')
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [customerOrders, setCustomerOrders] = useState<any[]>([])
  const [favoriteItems, setFavoriteItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadCustomers()
  }, [sortBy])

  const loadCustomers = async () => {
    setLoading(true)
    const data = await window.api.customers.getAll(sortBy)
    setCustomers(data)
    setLoading(false)
  }

  const handleSearch = async () => {
    if (!search.trim()) {
      loadCustomers()
      return
    }
    const results = await window.api.customers.search(search)
    setCustomers(results)
  }

  useEffect(() => {
    const timer = setTimeout(handleSearch, 300)
    return () => clearTimeout(timer)
  }, [search])

  const viewCustomer = async (customer: Customer) => {
    setSelectedCustomer(customer)
    const [orders, favorites] = await Promise.all([
      window.api.customers.getOrders(customer.id),
      window.api.customers.getFavorites(customer.id)
    ])
    setCustomerOrders(orders)
    setFavoriteItems(favorites)
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '—'
    return new Date(dateStr).toLocaleDateString('en', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  const cycleSortBy = () => {
    const order: SortKey[] = ['total_spent', 'order_count', 'last_order']
    const idx = order.indexOf(sortBy)
    setSortBy(order[(idx + 1) % order.length])
  }

  const sortLabel = sortBy === 'total_spent' ? 'Total Spent' : sortBy === 'order_count' ? 'Orders' : 'Last Order'

  // Detail view
  if (selectedCustomer) {
    return (
      <div>
        <button
          onClick={() => setSelectedCustomer(null)}
          className="flex items-center gap-1 text-sm text-orange-600 hover:text-orange-700 font-medium mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to customers
        </button>

        {/* Customer header */}
        <div className="bg-white rounded-xl border p-6 mb-4">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-xl font-bold text-gray-900">
                {selectedCustomer.name || selectedCustomer.phone}
              </h2>
              <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                <span className="flex items-center gap-1"><Phone className="h-3.5 w-3.5" /> {selectedCustomer.phone}</span>
                <span className="flex items-center gap-1"><ShoppingCart className="h-3.5 w-3.5" /> {selectedCustomer.order_count} orders</span>
                <span className="flex items-center gap-1"><DollarSign className="h-3.5 w-3.5" /> {formatCurrency(selectedCustomer.total_spent)} spent</span>
              </div>
              {selectedCustomer.last_order_date && (
                <p className="text-xs text-gray-400 mt-1">Last order: {formatDate(selectedCustomer.last_order_date)}</p>
              )}
            </div>
            <button
              onClick={() => {
                const url = `https://wa.me/${selectedCustomer.phone.replace(/[^0-9]/g, '')}`
                window.open(url, '_blank')
              }}
              className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg text-sm font-medium hover:bg-green-600"
            >
              WhatsApp
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Favorite items */}
          <div className="bg-white rounded-xl border p-5">
            <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <Star className="h-4 w-4 text-yellow-500" />
              Favorite Items
            </h3>
            {favoriteItems.length === 0 ? (
              <p className="text-sm text-gray-400">No order data yet</p>
            ) : (
              <div className="space-y-2">
                {favoriteItems.map((item: any, i: number) => (
                  <div key={i} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-2">
                      <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                        i === 0 ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-500'
                      }`}>{i + 1}</span>
                      <span className="text-sm font-medium">{item.name}</span>
                    </div>
                    <span className="text-sm text-gray-500">{item.total_quantity}x</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent orders */}
          <div className="bg-white rounded-xl border p-5">
            <h3 className="font-semibold text-gray-900 mb-3">Recent Orders</h3>
            {customerOrders.length === 0 ? (
              <p className="text-sm text-gray-400">No orders yet</p>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {customerOrders.map((order: any) => (
                  <div key={order.id} className="flex items-center justify-between p-2.5 bg-gray-50 rounded-lg">
                    <div>
                      <p className="text-sm font-medium">Order #{order.daily_number}</p>
                      <p className="text-xs text-gray-500">
                        {formatDate(order.order_date)} {formatTime(order.created_at)}
                      </p>
                    </div>
                    <span className="font-bold text-sm text-orange-600">{formatCurrency(order.total)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // List view
  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by phone or name..."
            className="w-full ps-10 pe-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
        </div>
        <button
          onClick={cycleSortBy}
          className="flex items-center gap-2 px-3 py-2 text-sm font-medium bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
        >
          <ArrowUpDown className="h-4 w-4" />
          Sort: {sortLabel}
        </button>
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-400">Loading...</div>
      ) : customers.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Phone className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p>No customers tracked yet</p>
          <p className="text-sm mt-1">Customers are automatically tracked when orders include a phone number</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase">
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3 text-right">Orders</th>
                <th className="px-4 py-3 text-right">Total Spent</th>
                <th className="px-4 py-3 text-right">Last Order</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {customers.map((c) => (
                <tr
                  key={c.id}
                  onClick={() => viewCustomer(c)}
                  className="hover:bg-orange-50 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900 text-sm">{c.name || c.phone}</p>
                    {c.name && <p className="text-xs text-gray-500">{c.phone}</p>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="font-bold text-sm text-blue-600">{c.order_count}</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="font-bold text-sm text-orange-600">{formatCurrency(c.total_spent)}</span>
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-gray-500">
                    {formatDate(c.last_order_date)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
