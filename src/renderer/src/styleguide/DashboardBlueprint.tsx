import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Clock, Receipt, ShoppingBag, TrendingUp } from 'lucide-react'
import { Card, Money, SegmentedControl, Sparkline, StatCard } from '../components/ui'
import { categoryColor } from '../theme/categoryColors'

/**
 * Living blueprint of the v4 admin dashboard: <=4 KPI cards (tabular values, delta chip, cheap SVG
 * sparkline), then a CSS bar chart and a ranked list. No recharts needed for the overview.
 */

const HOURS = [11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22]
const BY_HOUR = [6, 18, 24, 12, 5, 4, 7, 14, 22, 27, 19, 8]
const TOP = [
  { name: 'Double Burger', cat: 1, qty: 64, revenue: 32000 },
  { name: 'Tacos Poulet', cat: 3, qty: 51, revenue: 22950 },
  { name: 'Margherita', cat: 2, qty: 33, revenue: 21450 },
  { name: 'Coca-Cola', cat: 4, qty: 88, revenue: 10560 },
  { name: 'Tiramisu', cat: 5, qty: 21, revenue: 7350 }
]

export function DashboardBlueprint() {
  const { t } = useTranslation()
  const [period, setPeriod] = useState<'today' | 'week' | 'month'>('today')
  const maxHour = Math.max(...BY_HOUR)
  const maxTop = Math.max(...TOP.map((i) => i.revenue))

  return (
    <div className="rounded-3xl border border-line bg-canvas p-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-2xl font-extrabold tracking-tight text-ink">{t('ui.sg.sampleTitle')}</h3>
          <p className="text-sm text-muted">{t('ui.sg.sampleBody')}</p>
        </div>
        <SegmentedControl
          value={period}
          onChange={setPeriod}
          options={[
            { value: 'today', label: t('ui.sg.today') },
            { value: 'week', label: t('ui.sg.week') },
            { value: 'month', label: t('ui.sg.month') }
          ]}
        />
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          label={t('ui.sg.revenue')}
          value={<Money value={148750} decimals={0} />}
          icon={<TrendingUp />}
          delta={12.4}
          deltaLabel={t('ui.sg.vsYesterday')}
          sparkline={<Sparkline data={[8, 12, 9, 14, 13, 18, 16, 22, 21, 26]} />}
        />
        <StatCard
          label={t('ui.sg.orders')}
          value="186"
          icon={<ShoppingBag />}
          tone="info"
          delta={4}
          deltaLabel={t('ui.sg.vsYesterday')}
          sparkline={<Sparkline color="var(--info)" data={[12, 10, 14, 13, 15, 14, 17, 16, 18, 19]} />}
        />
        <StatCard
          label={t('ui.sg.avgTicket')}
          value={<Money value={800} decimals={0} />}
          icon={<Receipt />}
          tone="success"
          delta={-2.1}
          deltaLabel={t('ui.sg.vsYesterday')}
          sparkline={<Sparkline color="var(--success)" data={[9, 8, 9, 10, 9, 8, 8, 9, 8, 8]} />}
        />
        <StatCard
          label={t('ui.sg.prepTime')}
          value="7:40"
          icon={<Clock />}
          tone="warning"
          delta={-8}
          invertDelta
          deltaLabel={t('ui.sg.vsYesterday')}
          sparkline={<Sparkline color="var(--warning)" data={[11, 10, 10, 9, 9, 9, 8, 8, 8, 7]} />}
        />
      </div>

      <div className="grid lg:grid-cols-5 gap-4">
        <Card title={t('ui.sg.byHour')} className="lg:col-span-3">
          <div className="h-48 flex items-end gap-2">
            {BY_HOUR.map((v, i) => (
              <div key={HOURS[i]} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end">
                <span className="num text-[11px] font-semibold text-muted">{v}</span>
                <div
                  className={i === BY_HOUR.indexOf(maxHour) ? 'w-full rounded-t-lg bg-ember' : 'w-full rounded-t-lg bg-primary-soft-2'}
                  style={{ height: `${(v / maxHour) * 78}%` }}
                />
                <span className="num text-[11px] text-faint">{HOURS[i]}h</span>
              </div>
            ))}
          </div>
        </Card>
        <Card title={t('ui.sg.topItems')} className="lg:col-span-2">
          <ol className="space-y-3.5">
            {TOP.map((item, i) => (
              <li key={item.name} className="flex items-center gap-3">
                <span className="num w-5 text-sm font-bold text-faint">{i + 1}</span>
                <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: categoryColor(item.cat) }} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-semibold text-ink truncate">{item.name}</span>
                    <span className="text-sm font-bold text-ink">
                      <Money value={item.revenue} decimals={0} />
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 rounded-full bg-surface-2 overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${(item.revenue / maxTop) * 100}%`, background: categoryColor(item.cat) }}
                    />
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </Card>
      </div>
    </div>
  )
}
