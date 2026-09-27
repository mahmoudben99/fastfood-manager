import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Ban, Receipt, ShoppingBag, TrendingUp } from 'lucide-react'
import { Money } from '../../../components/ui'
import { StatStrip } from './StatStrip'
import type { HistoryOrder } from './types'

/** Period KPIs from the loaded orders (cancelled orders excluded from money). */
export function HistoryStats({ orders, loading }: { orders: HistoryOrder[]; loading: boolean }) {
  const { t } = useTranslation()
  const stats = useMemo(() => {
    const live = orders.filter((o) => o.status !== 'cancelled')
    const revenue = live.reduce((sum, o) => sum + (Number(o.total) || 0), 0)
    const toCollect = live.filter((o) => o.payment_status === 'unpaid' || o.payment_status === 'partial').length
    return {
      count: live.length,
      revenue,
      average: live.length ? revenue / live.length : 0,
      cancelled: orders.length - live.length,
      toCollect
    }
  }, [orders])

  return (
    <StatStrip
      className="mb-5"
      loading={loading}
      items={[
        { label: t('orderHistory.stats.orders'), value: stats.count, icon: <ShoppingBag />, tone: 'info' },
        {
          label: t('orderHistory.stats.revenueShort'),
          value: <Money value={stats.revenue} decimals={0} />,
          icon: <TrendingUp />,
          note: stats.toCollect > 0 ? t('orderHistory.stats.toCollect', { count: stats.toCollect }) : undefined
        },
        { label: t('orderHistory.stats.avgTicket'), value: <Money value={stats.average} decimals={0} />, icon: <Receipt />, tone: 'success' },
        {
          label: t('orderHistory.stats.cancelled'),
          value: stats.cancelled,
          icon: <Ban />,
          tone: stats.cancelled > 0 ? 'danger' : 'neutral'
        }
      ]}
    />
  )
}
