import { useTranslation } from 'react-i18next'
import { LineChart as LineIcon, PieChart as PieIcon } from 'lucide-react'
import { Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Card, EmptyState, Money } from '../../components/ui'
import { categoryColor } from '../../theme/categoryColors'
import { formatAmount } from '../../components/ui/Money'
import { useLocalName } from '../insights/shared/format'
import type { AnalyticsData, TrendPoint } from './types'

function compact(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (Math.abs(value) >= 1000) return `${Math.round(value / 1000)}k`
  return String(Math.round(value))
}

function TrendTooltip({ active, payload }: { active?: boolean; payload?: { payload: TrendPoint }[] }) {
  const { t } = useTranslation()
  if (!active || !payload?.length) return null
  const point = payload[0].payload
  return (
    <div className="rounded-xl bg-inverse text-on-inverse px-3 py-2 text-xs shadow-e3">
      <p className="font-semibold">{point.label}</p>
      <p className="num mt-0.5">{formatAmount(point.revenue, 0)} · {t('analytics.ordersN', { n: point.orders })}</p>
    </div>
  )
}

/** Revenue trend (area) + revenue by category (donut). Lazy chunk: the only recharts user. */
export default function AnalyticsCharts({ data }: { data: AnalyticsData }) {
  const { t } = useTranslation()
  const nameOf = useLocalName()
  const categoryTotal = data.categories.reduce((sum, c) => sum + (c.total_revenue || 0), 0)

  return (
    <div className="grid xl:grid-cols-5 gap-4">
      <Card
        className="xl:col-span-3"
        icon={<LineIcon />}
        title={data.hourly ? t('analytics.trendHourly') : t('analytics.trend')}
      >
        {data.trend.length === 0 ? (
          <EmptyState compact icon={<LineIcon />} title={t('analytics.noData')} description={t('analytics.noDataHint')} />
        ) : (
          <div dir="ltr" className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.trend} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="an-rev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" style={{ stopColor: 'var(--accent)', stopOpacity: 0.32 }} />
                    <stop offset="100%" style={{ stopColor: 'var(--accent)', stopOpacity: 0 }} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="var(--line)" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: 'var(--muted)' }} minTickGap={16} />
                <YAxis tickLine={false} axisLine={false} width={44} tick={{ fontSize: 11, fill: 'var(--muted)' }} tickFormatter={compact} />
                <Tooltip content={<TrendTooltip />} cursor={{ stroke: 'var(--line-strong)' }} />
                <Area type="monotone" dataKey="revenue" stroke="var(--primary)" strokeWidth={2.5} fill="url(#an-rev)" isAnimationActive={false} dot={false} activeDot={{ r: 4, fill: 'var(--primary)', stroke: 'var(--surface)' }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      <Card className="xl:col-span-2" icon={<PieIcon />} title={t('analytics.byCategory')}>
        {data.categories.length === 0 || categoryTotal <= 0 ? (
          <EmptyState compact icon={<PieIcon />} title={t('analytics.noData')} description={t('analytics.noDataHint')} />
        ) : (
          <div className="flex flex-col sm:flex-row xl:flex-col 2xl:flex-row items-center gap-5">
            <div dir="ltr" className="h-40 w-40 shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={data.categories} dataKey="total_revenue" nameKey="name" innerRadius="62%" outerRadius="100%" paddingAngle={2} stroke="var(--surface)" strokeWidth={2} isAnimationActive={false}>
                    {data.categories.map((c) => <Cell key={c.name} fill={categoryColor(data.categoryIds[c.name] ?? c.name)} />)}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="w-full min-w-0 flex-1 space-y-2.5">
              {data.categories.slice(0, 6).map((c) => (
                <li key={c.name} className="flex items-center gap-2.5 text-sm">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: categoryColor(data.categoryIds[c.name] ?? c.name) }} />
                  <span className="min-w-0 flex-1 truncate text-ink-2"><bdi>{nameOf(c)}</bdi></span>
                  <span className="num text-xs text-muted">{Math.round((c.total_revenue / categoryTotal) * 100)}%</span>
                  <Money value={c.total_revenue} decimals={0} className="font-semibold text-ink" />
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>
    </div>
  )
}
