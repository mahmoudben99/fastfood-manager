import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, BookOpen, Coins, Percent, ScatterChart, TrendingUp, UtensilsCrossed } from 'lucide-react'
import type { MenuProfitReport } from '../../../../../shared/insights'
import { Button, Card, EmptyState, Skeleton, StatCard, cn, toast } from '../../../components/ui'
import { RangePicker, initialRange, type RangeValue } from '../shared/RangePicker'
import { signedPct, useLocalName, formatNumber } from '../shared/format'
import { QuadrantChart } from './QuadrantChart'
import { ProfitTable } from './ProfitTable'
import { QUADRANTS } from './quadrants'

/** Menu profit check: what each dish really earns, which ones to push, fix or drop. */
export function MenuProfitTab() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const nameOf = useLocalName()
  const [range, setRange] = useState<RangeValue>(() => initialRange('30d'))
  const [report, setReport] = useState<MenuProfitReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<number | null>(null)

  useEffect(() => {
    let alive = true
    setLoading(true)
    window.api.insights.getMenuProfit(range.range.start, range.range.end)
      .then((r) => { if (alive) setReport(r) })
      .catch((e) => toast.error(t('insights.loadError'), { description: e instanceof Error ? e.message : String(e) }))
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [range, t])

  const stats = useMemo(() => {
    if (!report) return null
    const sold = report.items.filter((i) => !i.isCombo && i.marginDa !== null && i.qtySold > 0)
    const revenue = sold.reduce((sum, i) => sum + i.price * i.qtySold, 0)
    const margin = sold.reduce((sum, i) => sum + (i.marginDa as number) * i.qtySold, 0)
    return { avgMarginPct: revenue > 0 ? Math.round((margin / revenue) * 100) : null, quadrantItems: sold.filter((i) => i.quadrant).length }
  }, [report])

  if (loading && !report) return <Skeleton className="h-96 rounded-2xl" />
  if (!report || report.items.length === 0) {
    return (
      <EmptyState
        icon={<UtensilsCrossed />}
        title={t('insights.profit.emptyTitle')}
        description={t('insights.profit.emptyBody')}
        action={<Button onClick={() => navigate('/admin/menu')}>{t('insights.profit.openMenu')}</Button>}
      />
    )
  }

  const topIncrease = report.priceIncreases[0]
  return (
    <div className={cn('space-y-6', loading && 'opacity-70')}>
      <div className="flex flex-wrap items-center justify-end gap-3">
        <RangePicker value={range} onChange={setRange} />
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          label={t('insights.profit.stats.avgMargin')}
          value={stats?.avgMarginPct === null || !stats ? '—' : `${stats.avgMarginPct}%`}
          icon={<Percent />}
          tone="success"
        />
        <StatCard
          label={t('insights.profit.stats.lowMargin')}
          value={formatNumber(report.counts.lowMargin, 0)}
          icon={<AlertTriangle />}
          tone={report.counts.lowMargin > 0 ? 'danger' : 'neutral'}
          deltaLabel={t('insights.profit.stats.lowMarginHint', { pct: report.marginWarnPct })}
        />
        <StatCard
          label={t('insights.profit.stats.noRecipe')}
          value={formatNumber(report.counts.noRecipe, 0)}
          icon={<BookOpen />}
          tone={report.counts.noRecipe > 0 ? 'warning' : 'neutral'}
        />
        <StatCard
          label={t('insights.profit.stats.costUp')}
          value={formatNumber(report.counts.costIncrease, 0)}
          icon={<TrendingUp />}
          tone={report.counts.costIncrease > 0 ? 'warning' : 'neutral'}
          deltaLabel={
            topIncrease
              ? t('insights.profit.stats.costUpTop', { name: nameOf(topIncrease), pct: signedPct(topIncrease.pct) })
              : t('insights.profit.stats.costUpNone')
          }
        />
      </div>

      <div className="grid xl:grid-cols-5 gap-4 items-start">
        <Card className="xl:col-span-3" icon={<ScatterChart />} title={t('insights.profit.chartTitle')} subtitle={t('insights.profit.chartSubtitle')}>
          {stats && stats.quadrantItems >= 2 ? (
            <QuadrantChart report={report} selectedId={selectedId} onSelect={setSelectedId} />
          ) : (
            <EmptyState compact icon={<ScatterChart />} title={t('insights.profit.chartEmptyTitle')} description={t('insights.profit.chartEmptyBody')} />
          )}
        </Card>
        <Card className="xl:col-span-2" icon={<Coins />} title={t('insights.profit.adviceTitle')}>
          <ul className="space-y-3">
            {QUADRANTS.map((q) => {
              const names = report.items.filter((i) => i.quadrant === q.id).sort((a, b) => b.revenue - a.revenue).slice(0, 3)
              const count = report.counts[q.id]
              return (
                <li key={q.id} className="flex gap-3 rounded-xl border border-line p-3">
                  <span className={cn('h-10 w-10 shrink-0 rounded-xl flex items-center justify-center text-xl', q.zone)} aria-hidden="true">{q.emoji}</span>
                  <div className="min-w-0">
                    <p className="font-semibold text-ink">
                      {t(`insights.profit.quadrant.${q.id}.name`)} <span className={cn('num ms-1 text-sm', q.ink)}>{count}</span>
                    </p>
                    <p className="text-sm text-muted leading-snug">{t(`insights.profit.quadrant.${q.id}.advice`)}</p>
                    {names.length > 0 && <p className="mt-1 text-xs text-ink-2 truncate"><bdi>{names.map(nameOf).join(' · ')}</bdi></p>}
                  </div>
                </li>
              )
            })}
          </ul>
        </Card>
      </div>

      <Card padding={false} title={t('insights.profit.tableTitle')}>
        <ProfitTable report={report} selectedId={selectedId} onSelect={setSelectedId} />
      </Card>
    </div>
  )
}
