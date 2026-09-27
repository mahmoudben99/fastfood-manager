import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CalendarDays, Clock3, Coffee, Flame, Grid3x3, TrendingUp, Users } from 'lucide-react'
import type { RushHourCell, RushHoursReport } from '../../../../../shared/insights'
import { Badge, Card, EmptyState, Skeleton, StatCard, cn, toast } from '../../../components/ui'
import { RangePicker, initialRange, type RangeValue } from '../shared/RangePicker'
import { WEEK_ORDER, formatNumber, hourLabel, hourRange } from '../shared/format'
import { Heatmap } from './Heatmap'

function HourList({ cells, tone }: { cells: RushHourCell[]; tone: 'peak' | 'quiet' }) {
  const { t } = useTranslation()
  return (
    <ol className="space-y-2">
      {cells.map((cell, i) => (
        <li key={`${cell.weekday}:${cell.hour}`} className="flex items-center gap-3">
          <span className={cn('num h-7 w-7 shrink-0 rounded-lg text-xs font-bold flex items-center justify-center',
            tone === 'peak' ? 'bg-primary-soft text-primary-ink' : 'bg-surface-2 text-ink-2')}>{i + 1}</span>
          <span className="min-w-0 flex-1 text-sm text-ink">
            <span className="font-semibold">{t(`days.${cell.weekday}`)}</span>{' '}
            <bdi dir="ltr" className="num text-ink-2">{hourRange(cell.hour, cell.hour + 1)}</bdi>
          </span>
          <span className="num text-sm font-bold text-ink">{formatNumber(cell.avgOrders)}</span>
        </li>
      ))}
    </ol>
  )
}

/** Weekday × hour heatmap, best / quiet hours and plain staffing hints. */
export function RushHoursTab() {
  const { t } = useTranslation()
  const [range, setRange] = useState<RangeValue>(() => initialRange('30d'))
  const [report, setReport] = useState<RushHoursReport | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    setLoading(true)
    window.api.insights.getRushHours(range.range.start, range.range.end)
      .then((r) => { if (alive) setReport(r) })
      .catch((e) => toast.error(t('insights.loadError'), { description: e instanceof Error ? e.message : String(e) }))
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [range, t])

  const highlights = useMemo(() => {
    if (!report || report.cells.length === 0) return null
    const busiestHour = [...report.byHour].sort((a, b) => b.avgOrdersPerDay - a.avgOrdersPerDay)[0]
    const perDay = WEEK_ORDER.map((weekday) => ({
      weekday,
      avg: report.openDays[weekday] > 0
        ? report.cells.filter((c) => c.weekday === weekday).reduce((sum, c) => sum + c.orders, 0) / report.openDays[weekday]
        : 0
    }))
    const busiestDay = [...perDay].sort((a, b) => b.avg - a.avg)[0]
    const openDays = report.openDays.reduce((a, b) => a + b, 0)
    const orders = report.cells.reduce((sum, c) => sum + c.orders, 0)
    return { busiestHour, busiestDay, perDayAvg: openDays > 0 ? orders / openDays : 0 }
  }, [report])

  /** The strongest rushes (≤ 6) then the calmest quiet runs (≤ 4): enough to plan a week. */
  const staffing = useMemo(() => {
    if (!report) return []
    const peaks = report.staffing.filter((b) => b.level === 'peak').sort((a, b) => b.loadFactor - a.loadFactor).slice(0, 6)
    const quiet = report.staffing.filter((b) => b.level === 'quiet').sort((a, b) => a.loadFactor - b.loadFactor).slice(0, 4)
    return [...peaks, ...quiet]
  }, [report])

  return (
    <div className={cn('space-y-6', loading && report && 'opacity-70')}>
      <div className="flex flex-wrap items-center justify-end gap-3">
        <RangePicker value={range} onChange={setRange} presets={['30d', '90d']} />
      </div>

      {!report ? <Skeleton className="h-96 rounded-2xl" /> : report.cells.length === 0 ? (
        <EmptyState icon={<Clock3 />} title={t('insights.rush.emptyTitle')} description={t('insights.rush.emptyBody')} />
      ) : (
        <>
          {highlights && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <StatCard
                label={t('insights.rush.busiestHour')}
                value={<bdi dir="ltr">{hourLabel(highlights.busiestHour.hour)}</bdi>}
                icon={<Flame />}
                deltaLabel={t('insights.rush.perDay', { n: formatNumber(highlights.busiestHour.avgOrdersPerDay) })}
              />
              <StatCard
                label={t('insights.rush.busiestDay')}
                value={t(`days.${highlights.busiestDay.weekday}`)}
                icon={<CalendarDays />}
                tone="info"
                deltaLabel={t('insights.rush.perDay', { n: formatNumber(highlights.busiestDay.avg) })}
              />
              <StatCard
                label={t('insights.rush.average')}
                value={formatNumber(highlights.perDayAvg)}
                icon={<TrendingUp />}
                tone="success"
              />
            </div>
          )}

          <div className="grid xl:grid-cols-5 gap-4 items-start">
            <Card className="xl:col-span-3" icon={<Grid3x3 />} title={t('insights.rush.heatmapTitle')} subtitle={t('insights.rush.heatmapSubtitle')}>
              <Heatmap report={report} />
            </Card>
            <div className="xl:col-span-2 space-y-4">
              <Card icon={<Flame />} title={t('insights.rush.bestTitle')}>
                <HourList cells={report.best} tone="peak" />
              </Card>
              <Card icon={<Coffee />} title={t('insights.rush.worstTitle')}>
                {report.worst.length > 0 ? <HourList cells={report.worst} tone="quiet" /> : <p className="text-sm text-muted">{t('insights.rush.worstNone')}</p>}
              </Card>
            </div>
          </div>

          <Card icon={<Users />} title={t('insights.rush.staffingTitle')} padding={false}>
            {staffing.length === 0 ? (
              <p className="px-5 py-6 text-sm text-muted">{t('insights.rush.staffingNone')}</p>
            ) : (
              <ul className="grid 2xl:grid-cols-2 divide-y 2xl:divide-y-0 divide-line">
                {staffing.map((block) => (
                  <li key={`${block.weekday}:${block.fromHour}:${block.level}`} className="flex items-start gap-3 px-5 py-3 2xl:border-b 2xl:border-line">
                    <span className="w-24 shrink-0">
                      <Badge variant={block.level === 'peak' ? 'primary' : 'neutral'} size="md" icon={block.level === 'peak' ? <Flame /> : <Coffee />}>
                        {t(`insights.rush.level.${block.level}`)}
                      </Badge>
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-ink">
                        {t(`days.${block.weekday}`)} <bdi dir="ltr" className="num text-ink-2">{hourRange(block.fromHour, block.toHour)}</bdi>
                      </p>
                      <p className="text-sm text-muted">
                        {block.level === 'peak'
                          ? t('insights.rush.peakHint', { factor: formatNumber(block.loadFactor), n: formatNumber(block.avgOrders) })
                          : t('insights.rush.quietHint', { n: formatNumber(block.avgOrders) })}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  )
}
