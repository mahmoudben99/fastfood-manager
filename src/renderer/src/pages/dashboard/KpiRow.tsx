import { useTranslation } from 'react-i18next'
import { Receipt, ShoppingBag, Target, TrendingUp } from 'lucide-react'
import type { DashboardSummary } from '../../../../shared/insights'
import { Money, Sparkline, StatCard } from '../../components/ui'
import { formatNumber, weekdayOf } from '../insights/shared/format'

interface KpiRowProps {
  summary: DashboardSummary | null
  loading: boolean
}

/** Today so far vs the same weekday last week at the same time, 14-day sparklines. */
export function KpiRow({ summary, loading }: KpiRowProps) {
  const { t } = useTranslation()
  const s = summary
  const day = s ? t(`days.${weekdayOf(s.date)}`) : ''
  const deltaLabel = s ? t('dashboard.kpi.vsLastWeek', { day }) : undefined
  const spark = s?.sparkline ?? []
  const forecast = s?.forecastToday
  const reached = forecast && forecast.expectedRevenue > 0 ? Math.round(((s?.today.revenue ?? 0) / forecast.expectedRevenue) * 100) : null

  return (
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
      <StatCard
        label={t('dashboard.kpi.revenue')}
        value={<Money value={s?.today.revenue ?? 0} decimals={0} />}
        icon={<TrendingUp />}
        loading={loading}
        delta={s?.deltaPct.revenue}
        deltaLabel={s?.deltaPct.revenue === null ? t('dashboard.kpi.noCompare') : deltaLabel}
        sparkline={<Sparkline data={spark.map((d) => d.revenue)} />}
      />
      <StatCard
        label={t('dashboard.kpi.orders')}
        value={formatNumber(s?.today.orders ?? 0, 0)}
        icon={<ShoppingBag />}
        tone="info"
        loading={loading}
        delta={s?.deltaPct.orders}
        deltaLabel={s?.deltaPct.orders === null ? t('dashboard.kpi.noCompare') : deltaLabel}
        sparkline={<Sparkline color="var(--info)" data={spark.map((d) => d.orders)} />}
      />
      <StatCard
        label={t('dashboard.kpi.avgTicket')}
        value={<Money value={s?.today.avgTicket ?? 0} decimals={0} />}
        icon={<Receipt />}
        tone="success"
        loading={loading}
        delta={s?.deltaPct.avgTicket}
        deltaLabel={s?.deltaPct.avgTicket === null ? t('dashboard.kpi.noCompare') : deltaLabel}
        sparkline={<Sparkline color="var(--success)" data={spark.map((d) => (d.orders > 0 ? d.revenue / d.orders : 0))} />}
      />
      <StatCard
        label={t('dashboard.kpi.expected')}
        value={forecast && forecast.method !== 'none' ? <Money value={forecast.expectedRevenue} decimals={0} /> : '—'}
        icon={<Target />}
        tone="warning"
        loading={loading}
        deltaLabel={
          forecast && forecast.method !== 'none'
            ? t('dashboard.kpi.expectedOrders', { n: forecast.expectedOrders })
            : t('dashboard.kpi.expectedNone')
        }
        sparkline={
          reached !== null ? (
            <div className="px-1 pb-1 pt-2">
              <div className="flex items-baseline justify-between text-xs mb-1.5">
                <span className="text-muted">{t('dashboard.kpi.reached')}</span>
                <span className="num font-bold text-ink">{reached}%</span>
              </div>
              <div
                className="h-2 rounded-full bg-surface-2 overflow-hidden"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.min(100, reached)}
              >
                <div className="h-full rounded-full bg-ember" style={{ width: `${Math.min(100, reached)}%` }} />
              </div>
            </div>
          ) : undefined
        }
      />
    </div>
  )
}
