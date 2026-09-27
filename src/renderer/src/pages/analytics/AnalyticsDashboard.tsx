import { Suspense, lazy, useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BarChart3, CalendarRange, Receipt, ShoppingCart, TrendingDown, TrendingUp, Truck, Wallet } from 'lucide-react'
import { Button, Money, PageHeader, SegmentedControl, Skeleton, StatCard, cn, toast } from '../../components/ui'
import { localToday } from '../../utils/localDate'
import { addDays } from '../insights/shared/format'
import { PaymentsCard } from './PaymentsCard'
import { TopItemsList } from './TopItemsList'
import { WorkersTable } from './WorkersTable'
import type { AnalyticsData, TrendPoint } from './types'

// recharts is only pulled in with the chart cards (its own chunk, after the numbers show).
const AnalyticsCharts = lazy(() => import('./AnalyticsCharts'))

type PeriodType = 'today' | 'week' | 'month' | '3months' | 'custom'

/** orders.order_date is the restaurant-LOCAL day (see utils/localDate). */
function rangeFor(period: Exclude<PeriodType, 'custom'>): [string, string] {
  const end = localToday()
  if (period === 'today') return [end, end]
  if (period === 'week') return [addDays(end, -6), end]
  if (period === 'month') return [addDays(end, -29), end]
  return [addDays(end, -89), end]
}

async function load(start: string, end: string): Promise<AnalyticsData> {
  const single = start === end
  const [summary, byDay, top, categories, workers, methods, methodConfig, hours, categoryList] = await Promise.all([
    window.api.analytics.getProfitSummary(start, end),
    single ? Promise.resolve([]) : window.api.analytics.getRevenueByDay(start, end),
    window.api.analytics.getTopSellingItems(start, end, 8),
    window.api.analytics.getRevenueByCategory(start, end),
    window.api.analytics.getWorkerPerformance(start, end),
    window.api.payments.salesByMethod(start, end).catch(() => []),
    window.api.payments.getMethods().catch(() => []),
    single ? window.api.insights.getRushHours(start, end).catch(() => null) : Promise.resolve(null),
    window.api.categories.getAll().catch(() => []) as Promise<{ id: number; name: string }[]>
  ])
  const trend: TrendPoint[] = single
    ? (hours?.byHour ?? []).map((h) => ({ key: String(h.hour), label: `${String(h.hour).padStart(2, '0')}:00`, revenue: h.revenue, orders: h.orders }))
    : (byDay as { date: string; revenue: number; order_count: number }[]).map((d) => ({ key: d.date, label: d.date.slice(5).split('-').reverse().join('/'), revenue: d.revenue, orders: d.order_count }))
  return { summary, trend, hourly: single, top, categories, workers, methods, methodLabels: Object.fromEntries(methodConfig.map((m) => [m.id, m.label ?? ''])),
    categoryIds: Object.fromEntries(categoryList.map((c) => [c.name, c.id]))
  }
}

export function AnalyticsDashboard() {
  const { t } = useTranslation()
  const [period, setPeriod] = useState<PeriodType>('month')
  const [custom, setCustom] = useState<[string, string]>(() => rangeFor('month'))
  const [range, setRange] = useState<[string, string]>(() => rangeFor('month'))
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async (start: string, end: string) => {
    setLoading(true)
    try {
      setData(await load(start, end))
    } catch (e) {
      toast.error(t('analytics.loadError'), { description: e instanceof Error ? e.message : String(e) })
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => { void refresh(range[0], range[1]) }, [range, refresh])

  const choose = (p: PeriodType) => {
    setPeriod(p)
    if (p !== 'custom') setRange(rangeFor(p))
  }
  const customInvalid = !custom[0] || !custom[1] || custom[0] > custom[1]
  const s = data?.summary
  const avgTicket = s && s.order_count > 0 ? s.total_revenue / s.order_count : 0

  return (
    <div className="max-w-[1600px] space-y-6">
      <PageHeader
        icon={<BarChart3 />}
        title={t('analytics.title')}
        actions={
          <SegmentedControl
            value={period}
            onChange={choose}
            ariaLabel={t('analytics.dateRange')}
            options={[
              { value: 'today', label: t('analytics.today') },
              { value: 'week', label: t('analytics.last7') },
              { value: 'month', label: t('analytics.last30') },
              { value: '3months', label: t('analytics.last90') },
              { value: 'custom', label: t('analytics.custom'), icon: <CalendarRange /> }
            ]}
          />
        }
      />

      {period === 'custom' && (
        <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-line bg-surface px-5 py-4 animate-fade-in">
          {(['from', 'to'] as const).map((which, i) => (
            <label key={which} className="text-sm font-medium text-ink-2">
              <span className="block mb-1.5">{t(`analytics.${which}`)}</span>
              <input
                type="date"
                data-ui="input"
                value={custom[i]}
                max={localToday()}
                onChange={(e) => setCustom((c) => (i === 0 ? [e.target.value, c[1]] : [c[0], e.target.value]))}
                className="min-h-11 rounded-xl border border-line-strong bg-surface dark:bg-surface-2 px-3 text-ink"
              />
            </label>
          ))}
          <Button disabled={customInvalid} onClick={() => setRange(custom)}>{t('analytics.apply')}</Button>
        </div>
      )}

      <div className={cn('grid grid-cols-2 xl:grid-cols-4 gap-4', loading && data && 'opacity-70')}>
        <StatCard
          label={t('analytics.revenue')}
          value={<Money value={s?.total_revenue ?? 0} decimals={0} />}
          icon={<TrendingUp />}
          loading={!data}
          deltaLabel={t('analytics.revenueHint')}
          footer={
            <span className="flex items-center gap-2">
              <Truck className="h-4 w-4 text-faint" />
              {t('analytics.deliveryFees')}
              <Money value={s?.total_delivery_fees ?? 0} decimals={0} className="ms-auto font-semibold text-ink-2" />
            </span>
          }
        />
        <StatCard
          label={t('analytics.costs')}
          value={<Money value={(s?.total_stock_cost ?? 0) + (s?.total_worker_cost ?? 0)} decimals={0} />}
          icon={<TrendingDown />}
          tone="danger"
          loading={!data}
          footer={
            <span className="flex flex-col gap-1">
              <span className="flex items-center justify-between gap-2">{t('analytics.stockCost')} <Money value={s?.total_stock_cost ?? 0} decimals={0} className="font-semibold text-ink-2" /></span>
              <span className="flex items-center justify-between gap-2">{t('analytics.workerCost')} <Money value={s?.total_worker_cost ?? 0} decimals={0} className="font-semibold text-ink-2" /></span>
            </span>
          }
        />
        <StatCard
          label={t('analytics.profit')}
          value={<Money value={s?.net_profit ?? 0} decimals={0} className={s && s.net_profit < 0 ? 'text-danger-ink' : undefined} />}
          icon={<Wallet />}
          tone={s && s.net_profit < 0 ? 'danger' : 'success'}
          loading={!data}
          deltaLabel={s && s.total_revenue > 0 ? t('analytics.marginHint', { pct: Math.round((s.net_profit / s.total_revenue) * 100) }) : undefined}
        />
        <StatCard
          label={t('analytics.orderCount')}
          value={String(s?.order_count ?? 0)}
          icon={<ShoppingCart />}
          tone="info"
          loading={!data}
          footer={
            <span className="flex items-center gap-2">
              <Receipt className="h-4 w-4 text-faint" />
              {t('analytics.avgTicket')}
              <Money value={avgTicket} decimals={0} className="ms-auto font-semibold text-ink-2" />
            </span>
          }
        />
      </div>

      {!data ? (
        <Skeleton className="h-80 rounded-2xl" />
      ) : (
        <>
          <Suspense fallback={<div className="grid xl:grid-cols-5 gap-4"><Skeleton className="xl:col-span-3 h-80 rounded-2xl" /><Skeleton className="xl:col-span-2 h-80 rounded-2xl" /></div>}>
            <AnalyticsCharts data={data} />
          </Suspense>
          <div className="grid xl:grid-cols-5 gap-4 items-start">
            <TopItemsList className="xl:col-span-3" items={data.top} categoryIds={data.categoryIds} />
            <PaymentsCard className="xl:col-span-2" methods={data.methods} labels={data.methodLabels} />
          </div>
          <WorkersTable workers={data.workers} />
        </>
      )}
    </div>
  )
}
