import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Clock3 } from 'lucide-react'
import type { DashboardHour } from '../../../../shared/insights'
import { Card, EmptyState, Money, cn } from '../../components/ui'
import { hourLabel, weekdayOf } from '../insights/shared/format'

interface HourlyCardProps {
  hourly: DashboardHour[]
  date: string
  /** Local 'HH:MM' of the summary. */
  asOf: string
  className?: string
}

/** 12 400 → "12.4k" (bar labels only; the exact value is in the title). */
function compact(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10_000 ? 0 : 1)}k`
  return String(Math.round(value))
}

/**
 * Today's revenue per hour (solid bars; the busiest hour in ember) over the usual profile of this
 * weekday (dashed ghost bars). CSS only — no chart library. Time runs left→right in every language.
 */
export function HourlyCard({ hourly, date, asOf, className = '' }: HourlyCardProps) {
  const { t } = useTranslation()
  const nowHour = Number(asOf.slice(0, 2))
  const { hours, max, peak } = useMemo(() => {
    const active = hourly.filter((h) => h.orders > 0 || h.usualOrders > 0).map((h) => h.hour)
    if (active.length === 0) return { hours: [] as DashboardHour[], max: 0, peak: null as DashboardHour | null }
    let from = Math.min(...active, nowHour)
    let to = Math.max(...active, nowHour)
    while (to - from < 9) {
      if (from > 0) from--
      if (to - from < 9 && to < 23) to++
      if (from === 0 && to === 23) break
    }
    const hours = hourly.slice(from, to + 1)
    const max = Math.max(1, ...hours.map((h) => Math.max(h.revenue, h.usualRevenue)))
    const peak = hours.reduce<DashboardHour | null>((best, h) => (h.revenue > (best?.revenue ?? 0) ? h : best), null)
    return { hours, max, peak }
  }, [hourly, nowHour])

  const day = t(`days.${weekdayOf(date)}`)
  return (
    <Card
      className={className}
      icon={<Clock3 />}
      title={t('dashboard.hourly.title')}
      subtitle={
        peak ? (
          <>
            {t('dashboard.hourly.peak', { hour: hourLabel(peak.hour) })} · <Money value={peak.revenue} decimals={0} />
          </>
        ) : (
          t('dashboard.hourly.subtitle')
        )
      }
      actions={
        <div className="hidden sm:flex items-center gap-3 text-xs text-muted">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-primary-soft-2 ring-1 ring-primary/40" />
            {t('dashboard.hourly.today')}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm border border-dashed border-ink-2/50" />
            {t('dashboard.hourly.usual', { day })}
          </span>
        </div>
      }
    >
      {hours.length === 0 ? (
        <EmptyState compact icon={<Clock3 />} title={t('dashboard.hourly.emptyTitle')} description={t('dashboard.hourly.emptyBody')} />
      ) : (
        <div dir="ltr" className="h-52 flex items-end gap-1.5">
          {hours.map((h) => {
            const isPeak = peak?.hour === h.hour && h.revenue > 0
            const future = h.hour > nowHour
            const title = `${hourLabel(h.hour)} — ${t('dashboard.hourly.tooltip', {
              orders: h.orders, usual: h.usualOrders, revenue: Math.round(h.revenue), usualRevenue: Math.round(h.usualRevenue)
            })}`
            return (
              <div key={h.hour} className="flex-1 min-w-0 h-full flex flex-col items-center justify-end gap-1.5" title={title}>
                <span className={cn('num text-[11px] font-semibold leading-none', isPeak ? 'text-primary-ink' : 'text-muted', h.revenue === 0 && 'invisible')}>
                  {compact(h.revenue)}
                </span>
                <div className="relative w-full flex-1 flex items-end">
                  {h.usualRevenue > 0 && (
                    <div
                      className="absolute inset-x-0 bottom-0 rounded-t-md border border-b-0 border-dashed border-ink-2/35"
                      style={{ height: `${(h.usualRevenue / max) * 100}%` }}
                    />
                  )}
                  <div
                    className={cn(
                      'relative w-full rounded-t-md',
                      isPeak ? 'bg-ember' : 'bg-primary-soft-2',
                      future && 'opacity-0'
                    )}
                    style={{ height: `${(h.revenue / max) * 100}%` }}
                  />
                </div>
                <span className={cn('num text-[11px] leading-none', h.hour === nowHour ? 'font-bold text-ink' : 'text-faint')}>
                  {String(h.hour).padStart(2, '0')}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}
