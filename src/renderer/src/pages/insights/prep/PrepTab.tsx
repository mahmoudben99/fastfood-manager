import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChefHat, Printer, Send, ShoppingCart, Sparkles } from 'lucide-react'
import type { ShoppingList } from '../../../../../shared/insights'
import { Badge, Button, Card, EmptyState, Money, SegmentedControl, Skeleton, cn, toast } from '../../../components/ui'
import { categoryColor } from '../../../theme/categoryColors'
import { addDays, formatNumber, longDate, signedPct, today, useLocalName } from '../shared/format'
import { usePrepActions } from '../shared/usePrepActions'
import { ShoppingTable } from './ShoppingTable'

type Day = 'today' | 'tomorrow'

const CONFIDENCE = { high: 'success', medium: 'info', low: 'warning' } as const

/** What to prepare and what to buy for today or tomorrow, from the same-weekday forecast. */
export function PrepTab() {
  const { t, i18n } = useTranslation()
  const nameOf = useLocalName()
  const [day, setDay] = useState<Day>('today')
  const [list, setList] = useState<ShoppingList | null>(null)
  const [loading, setLoading] = useState(true)
  const { print, send, busy } = usePrepActions()
  const date = day === 'today' ? today() : addDays(today(), 1)

  useEffect(() => {
    let alive = true
    setLoading(true)
    window.api.insights.getShoppingList(date)
      .then((l) => { if (alive) setList(l) })
      .catch((e) => toast.error(t('insights.loadError'), { description: e instanceof Error ? e.message : String(e) }))
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [date, t])

  const f = list?.forecast
  const basis = !f ? '' : f.method === 'weekday'
    ? t('insights.prep.basisWeekday', { n: f.sampleDays.length })
    : f.method === 'daily_average' ? t('insights.prep.basisDaily', { n: f.sampleDays.length }) : t('insights.prep.basisNone')

  return (
    <div className={cn('space-y-6', loading && list && 'opacity-70')}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl
          value={day}
          onChange={setDay}
          options={[{ value: 'today', label: t('insights.prep.today') }, { value: 'tomorrow', label: t('insights.prep.tomorrow') }]}
        />
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" icon={<Send />} cooldownMs={800} loading={busy === 'send'} onClick={() => void send(date)}>
            {t('insights.prep.send')}
          </Button>
          <Button icon={<Printer />} cooldownMs={800} loading={busy === 'print'} onClick={() => void print(date)}>
            {t('insights.prep.print')}
          </Button>
        </div>
      </div>

      {!list ? <Skeleton className="h-80 rounded-2xl" /> : (
        <>
          <section className="rounded-2xl bg-surface border border-line shadow-e1 p-5 flex flex-wrap items-center gap-x-10 gap-y-4">
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-muted capitalize">{longDate(list.date, i18n.language)}</p>
              <p className="mt-1 text-sm text-ink-2 max-w-md">{basis}</p>
            </div>
            {f && f.method !== 'none' && (
              <>
                <div>
                  <p className="text-[13px] font-medium text-muted">{t('insights.prep.expectedOrders')}</p>
                  <p className="num text-kpi text-ink">≈ {f.expectedOrders}</p>
                </div>
                <div>
                  <p className="text-[13px] font-medium text-muted">{t('insights.prep.expectedRevenue')}</p>
                  <p className="text-kpi text-ink">≈ <Money value={f.expectedRevenue} decimals={0} /></p>
                </div>
                <div className="flex flex-wrap gap-2 ms-auto">
                  <Badge variant={CONFIDENCE[f.confidence]} size="md" dot>{t(`insights.prep.confidence.${f.confidence}`)}</Badge>
                  {f.trendFactor !== 1 && (
                    <Badge variant="neutral" size="md">{t('insights.prep.trend', { pct: signedPct((f.trendFactor - 1) * 100) })}</Badge>
                  )}
                </div>
              </>
            )}
          </section>

          <div className="grid xl:grid-cols-5 gap-4 items-start">
            <Card className="xl:col-span-2" icon={<ChefHat />} title={t('insights.prep.planTitle')} padding={false}>
              {f && f.items.length > 0 ? (
                <>
                  <ul className="grid md:grid-cols-2 xl:grid-cols-1 -mb-px">
                    {f.items.map((item) => (
                      <li key={item.menuItemId} className="flex items-center gap-3 px-5 py-3 border-b border-line md:odd:border-e xl:odd:border-e-0">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: categoryColor(item.categoryId) }} />
                        <span className="min-w-0 flex-1 truncate font-medium text-ink"><bdi>{nameOf(item)}</bdi></span>
                        <span className="num text-xs text-muted">{formatNumber(item.expected)}</span>
                        <span className={cn('num min-w-12 rounded-lg px-2.5 py-1 text-center text-base font-bold', item.rounded > 0 ? 'bg-surface-2 text-ink' : 'bg-surface-2/60 text-muted')}>
                          {item.rounded > 0 ? `×${item.rounded}` : '<1'}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {(f.options?.length ?? 0) > 0 && (
                    <div className="border-t border-line px-5 py-4">
                      <p className="text-xs font-semibold text-muted mb-2">{t('insights.prep.optionsTitle')}</p>
                      <div className="flex flex-wrap gap-2">
                        {f.options!.map((o) => (
                          <Badge key={o.optionId} variant="neutral" size="md"><bdi>{nameOf(o)}</bdi> <span className="num">×{Math.round(o.expected)}</span></Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <EmptyState compact icon={<Sparkles />} title={t('insights.prep.noHistoryTitle')} description={t('insights.prep.noHistoryBody')} />
              )}
            </Card>

            <Card
              className="xl:col-span-3"
              icon={<ShoppingCart />}
              title={t('insights.prep.shoppingTitle')}
              actions={list.totalEstCost > 0 ? (
                <div className="text-end">
                  <p className="text-[11px] font-medium text-muted">{t('insights.prep.estTotal')}</p>
                  <Money value={list.totalEstCost} decimals={0} className="text-lg font-bold text-ink" />
                </div>
              ) : undefined}
              padding={false}
            >
              <ShoppingTable list={list} />
            </Card>
          </div>
        </>
      )}
    </div>
  )
}
