import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { RefreshCw } from 'lucide-react'
import { IconButton, PageHeader, toast } from '../../components/ui'
import { localToday } from '../../utils/localDate'
import { HistoryFilters } from './parts/HistoryFilters'
import { HistoryStats } from './parts/HistoryStats'
import { OrderDetailDrawer } from './parts/OrderDetailDrawer'
import { OrdersTable, PAGE_SIZE } from './parts/OrdersTable'
import { isOngoing, stripIpcPrefix } from './parts/labels'
import type { HistoryOrder, PeriodPreset, StatusFilter } from './parts/types'

const DAY_MS = 86_400_000
const PRESET_DAYS: Record<Exclude<PeriodPreset, 'custom'>, number> = { today: 0, yesterday: 1, week: 6, month: 29 }

function matchesStatus(order: HistoryOrder, filter: StatusFilter): boolean {
  if (filter === 'all') return true
  if (filter === 'ongoing') return isOngoing(order.status)
  if (filter === 'unpaid') {
    return order.status !== 'cancelled' && (order.payment_status === 'unpaid' || order.payment_status === 'partial')
  }
  return order.status === filter
}

/** Order number, phone (digits or as typed), customer name or table. */
function matchesSearch(order: HistoryOrder, raw: string): boolean {
  const q = raw.trim().toLowerCase().replace(/^#/, '')
  if (!q) return true
  const digits = q.replace(/\D/g, '')
  const phone = order.customer_phone?.toLowerCase() ?? ''
  return (
    String(order.daily_number).includes(q) ||
    phone.includes(q) ||
    (digits.length >= 3 && phone.replace(/\D/g, '').includes(digits)) ||
    (order.customer_name?.toLowerCase().includes(q) ?? false) ||
    (order.table_number?.toLowerCase().includes(q) ?? false)
  )
}

export function OrdersHistory() {
  const { t } = useTranslation()
  const [orders, setOrders] = useState<HistoryOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState<PeriodPreset>('today')
  const [startDate, setStartDate] = useState(localToday())
  const [endDate, setEndDate] = useState(localToday())
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [visible, setVisible] = useState(PAGE_SIZE)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const request = useRef(0)

  const loadOrders = useCallback(async () => {
    const mine = ++request.current
    try {
      const data = await window.api.orders.getByDateRange(startDate, endDate)
      if (mine === request.current) setOrders(Array.isArray(data) ? data : [])
    } catch (error) {
      if (mine === request.current) toast.error(t('orderHistory.toast.actionFailed', { message: stripIpcPrefix(error) }))
    } finally {
      if (mine === request.current) setLoading(false)
    }
  }, [startDate, endDate, t])

  useEffect(() => {
    setLoading(true)
    void loadOrders()
  }, [loadOrders])

  useEffect(() => setVisible(PAGE_SIZE), [startDate, endDate, statusFilter, searchQuery])

  const applyPeriod = (next: PeriodPreset) => {
    setPeriod(next)
    if (next === 'custom') return
    const start = localToday(new Date(Date.now() - PRESET_DAYS[next] * DAY_MS))
    setStartDate(start)
    setEndDate(next === 'yesterday' ? start : localToday())
  }

  const searched = useMemo(() => orders.filter((order) => matchesSearch(order, searchQuery)), [orders, searchQuery])
  const counts = useMemo(() => {
    const result: Record<StatusFilter, number> = { all: 0, ongoing: 0, completed: 0, cancelled: 0, unpaid: 0 }
    for (const order of searched) {
      for (const key of Object.keys(result) as StatusFilter[]) if (matchesStatus(order, key)) result[key]++
    }
    return result
  }, [searched])
  const filteredOrders = useMemo(
    () => searched.filter((order) => matchesStatus(order, statusFilter)),
    [searched, statusFilter]
  )

  const clearFilters = () => {
    setSearchQuery('')
    setStatusFilter('all')
  }

  return (
    <div>
      <PageHeader
        title={t('nav.ordersHistory')}
        actions={
          <IconButton
            icon={<RefreshCw />}
            label={t('orderHistory.refresh')}
            variant="secondary"
            size="lg"
            onClick={() => { setLoading(true); void loadOrders() }}
          />
        }
      />

      <HistoryStats orders={orders} loading={loading} />

      <HistoryFilters
        period={period}
        onPeriod={applyPeriod}
        startDate={startDate}
        endDate={endDate}
        onStartDate={setStartDate}
        onEndDate={setEndDate}
        status={statusFilter}
        onStatus={setStatusFilter}
        counts={counts}
        search={searchQuery}
        onSearch={setSearchQuery}
      />

      <OrdersTable
        orders={filteredOrders.slice(0, visible)}
        total={filteredOrders.length}
        loading={loading}
        filtered={orders.length > 0}
        multiDay={startDate !== endDate}
        selectedId={selectedId}
        onOpen={(order) => setSelectedId(order.id)}
        onClearFilters={clearFilters}
        onShowMore={() => setVisible((v) => v + PAGE_SIZE)}
      />

      <OrderDetailDrawer orderId={selectedId} onClose={() => setSelectedId(null)} onChanged={() => void loadOrders()} />
    </div>
  )
}
