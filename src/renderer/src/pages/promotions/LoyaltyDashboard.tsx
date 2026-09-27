import { KeyboardEvent, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronRight, Phone, Repeat, Search, SearchX, Users, Wallet, X } from 'lucide-react'
import { Card, EmptyState, IconButton, Input, Money, SegmentedControl, Skeleton, cn } from '../../components/ui'
import { VirtualKeyboard } from '../../components/VirtualKeyboard'
import { useAppStore } from '../../store/appStore'
import { StatStrip } from '../orders-history/parts/StatStrip'
import { CustomerDetail, type Customer, type FavoriteRow } from './parts/CustomerDetail'
import { formatDay, type MenuItemLite } from './parts/promoTypes'

type SortKey = 'total_spent' | 'order_count' | 'last_order'

const HEAD = 'sticky top-0 z-10 h-11 whitespace-nowrap border-b border-line bg-surface-2 px-4 text-xs font-semibold text-muted'

export function LoyaltyDashboard({ menuItems = [] }: { menuItems?: MenuItemLite[] }) {
  const { t } = useTranslation()
  const isTouch = useAppStore((s) => s.inputMode) === 'touchscreen'
  const [customers, setCustomers] = useState<Customer[]>([])
  const [allCustomers, setAllCustomers] = useState<Customer[]>([])
  const [search, setSearch] = useState('')
  const [keyboard, setKeyboard] = useState(false)
  const [sortBy, setSortBy] = useState<SortKey>('total_spent')
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [customerOrders, setCustomerOrders] = useState<any[]>([])
  const [favoriteItems, setFavoriteItems] = useState<FavoriteRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void loadCustomers()
  }, [sortBy])

  const loadCustomers = async () => {
    setLoading(true)
    try {
      const data = await window.api.customers.getAll(sortBy)
      setCustomers(data)
      setAllCustomers(data)
    } finally {
      setLoading(false)
    }
  }

  const handleSearch = async () => {
    if (!search.trim()) {
      void loadCustomers()
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

  const stats = useMemo(() => {
    const spent = allCustomers.reduce((sum, c) => sum + (Number(c.total_spent) || 0), 0)
    return {
      count: allCustomers.length,
      repeat: allCustomers.filter((c) => c.order_count >= 2).length,
      spent,
      average: allCustomers.length ? spent / allCustomers.length : 0
    }
  }, [allCustomers])

  if (selectedCustomer) {
    return (
      <CustomerDetail
        customer={selectedCustomer}
        orders={customerOrders}
        favorites={favoriteItems}
        menuItems={menuItems}
        onBack={() => setSelectedCustomer(null)}
      />
    )
  }

  const onRowKey = (e: KeyboardEvent<HTMLTableRowElement>, c: Customer) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      void viewCustomer(c)
    }
  }

  return (
    <div className="space-y-4">
      <StatStrip
        loading={loading && allCustomers.length === 0}
        items={[
          { label: t('loyalty.stats.customers'), value: stats.count, icon: <Users />, tone: 'info' },
          { label: t('loyalty.stats.repeat'), value: stats.repeat, icon: <Repeat />, tone: 'success' },
          { label: t('loyalty.totalSpent'), value: <Money value={stats.spent} decimals={0} />, icon: <Wallet /> },
          { label: t('loyalty.stats.average'), value: <Money value={stats.average} decimals={0} />, icon: <Wallet />, tone: 'neutral' }
        ]}
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-[14rem] flex-1">
          <Input
            leading={<Search />}
            value={search}
            readOnly={isTouch}
            onClick={isTouch ? () => setKeyboard(true) : undefined}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('loyalty.searchPlaceholder')}
            aria-label={t('loyalty.searchPlaceholder')}
            trailing={search ? <IconButton icon={<X />} label={t('orderHistory.clearSearch')} size="sm" onClick={() => setSearch('')} /> : undefined}
          />
        </div>
        <SegmentedControl
          value={sortBy}
          onChange={setSortBy}
          ariaLabel={t('loyalty.sortLabel')}
          options={[
            { value: 'total_spent', label: t('loyalty.totalSpent') },
            { value: 'order_count', label: t('loyalty.orders') },
            { value: 'last_order', label: t('loyalty.lastOrder') }
          ]}
        />
      </div>

      {!loading && customers.length === 0 ? (
        <Card padding={false}>
          {search.trim() ? (
            <EmptyState compact icon={<SearchX />} title={t('loyalty.noMatch', { query: search.trim() })} />
          ) : (
            <EmptyState icon={<Phone />} title={t('loyalty.noCustomers')} description={t('loyalty.noCustomersShort')} />
          )}
        </Card>
      ) : (
        <Card padding={false} className="overflow-hidden">
          <div className="max-h-[60vh] overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className={cn(HEAD, 'text-start')}>{t('loyalty.customer')}</th>
                  <th className={cn(HEAD, 'text-end')}>{t('loyalty.orders')}</th>
                  <th className={cn(HEAD, 'text-end')}>{t('loyalty.totalSpent')}</th>
                  <th className={cn(HEAD, 'text-end')}>{t('loyalty.lastOrder')}</th>
                  <th className={cn(HEAD, 'w-10')} aria-hidden="true" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {loading
                  ? Array.from({ length: 5 }, (_, i) => (
                      <tr key={i} className="h-12">
                        <td className="px-4"><Skeleton className="h-4 w-36" /></td>
                        <td className="px-4"><Skeleton className="ms-auto h-4 w-8" /></td>
                        <td className="px-4"><Skeleton className="ms-auto h-4 w-20" /></td>
                        <td className="px-4"><Skeleton className="ms-auto h-4 w-20" /></td>
                        <td />
                      </tr>
                    ))
                  : customers.map((c) => (
                      <tr
                        key={c.id}
                        tabIndex={0}
                        onClick={() => void viewCustomer(c)}
                        onKeyDown={(e) => onRowKey(e, c)}
                        className="h-12 cursor-pointer outline-none hover:bg-surface-2 focus-visible:bg-surface-2 active:bg-surface-3"
                      >
                        <td className="px-4 py-1.5">
                          <p className="font-semibold text-ink"><bdi>{c.name || c.phone}</bdi></p>
                          {c.name && <p className="num text-xs text-muted"><bdi dir="ltr">{c.phone}</bdi></p>}
                        </td>
                        <td className="num px-4 text-end font-bold text-ink">{c.order_count}</td>
                        <td className="px-4 text-end font-bold text-ink"><Money value={c.total_spent} /></td>
                        <td className="num px-4 text-end text-muted">{formatDay(c.last_order_date)}</td>
                        <td className="pe-3 text-muted"><ChevronRight className="h-4 w-4 rtl:-scale-x-100" /></td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {isTouch && keyboard && (
        <VirtualKeyboard visible type="text" extended value={search} onChange={setSearch} onClose={() => setKeyboard(false)} />
      )}
    </div>
  )
}
