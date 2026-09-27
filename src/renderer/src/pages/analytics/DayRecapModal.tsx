import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { ShoppingCart, TrendingUp, Truck, Wallet } from 'lucide-react'
import { paymentMethodLabel, type CashLang } from '../../../../shared/cash'
import { EmptyState, Modal, Money, Skeleton, cn } from '../../components/ui'
import { localToday } from '../../utils/localDate'
import { longDate, useLocalName } from '../insights/shared/format'
import type { MethodRow, ProfitSummary, TopItemRow } from './types'

interface DayRecapModalProps {
  isOpen: boolean
  onClose: () => void
}

interface OrderTypeEntry {
  order_type: string
  count: number
  revenue: number
}

interface Recap {
  summary: ProfitSummary
  top: TopItemRow[]
  types: OrderTypeEntry[]
  methods: MethodRow[]
}

const RANK = ['bg-ember text-on-primary', 'bg-surface-3 text-ink', 'bg-primary-soft text-primary-ink']

function Kpi({ icon, label, value, tone }: { icon: ReactNode; label: string; value: ReactNode; tone: string }) {
  return (
    <div className="rounded-2xl border border-line bg-surface-2/60 p-4">
      <div className={cn('mb-3 h-9 w-9 rounded-xl flex items-center justify-center [&_svg]:h-[18px] [&_svg]:w-[18px]', tone)}>{icon}</div>
      <p className="text-[13px] font-medium text-muted">{label}</p>
      <div className="num text-kpi text-ink">{value}</div>
    </div>
  )
}

/** Today's recap from the order screen: revenue, orders, profit, order types, payments, top 3. */
export function DayRecapModal({ isOpen, onClose }: DayRecapModalProps) {
  const { t, i18n } = useTranslation()
  const nameOf = useLocalName()
  const [recap, setRecap] = useState<Recap | null>(null)
  const [loading, setLoading] = useState(true)
  const [time, setTime] = useState(() => new Date())
  const lang = (['en', 'fr', 'ar'].includes(i18n.language) ? i18n.language : 'en') as CashLang

  useEffect(() => {
    if (!isOpen) return
    let alive = true
    // Restaurant-LOCAL day, matching orders.order_date (UTC would show yesterday before 01:00).
    const today = localToday()
    setLoading(true)
    setTime(new Date())
    Promise.all([
      window.api.analytics.getProfitSummary(today, today),
      window.api.analytics.getTopSellingItems(today, today, 3),
      window.api.analytics.getOrderTypeBreakdown(today, today),
      window.api.payments.salesByMethod(today, today).catch(() => [])
    ])
      .then(([summary, top, types, methods]) => { if (alive) setRecap({ summary, top, types, methods }) })
      .catch((err) => console.error('Failed to load day recap:', err))
      .finally(() => { if (alive) setLoading(false) })
    const timer = setInterval(() => setTime(new Date()), 60_000)
    return () => { alive = false; clearInterval(timer) }
  }, [isOpen])

  const s = recap?.summary
  const hasOrders = Boolean(s && s.order_count > 0)
  const clock = `${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}`

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="lg"
      title={t('dayRecap.title')}
      description={<span className="capitalize">{longDate(localToday(), i18n.language)} · <span className="num">{clock}</span></span>}
    >
      {loading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}</div>
          <Skeleton className="h-24 rounded-2xl" />
        </div>
      ) : !hasOrders || !s || !recap ? (
        <EmptyState compact icon={<ShoppingCart />} title={t('dayRecap.noOrders')} description={t('dayRecap.noOrdersHint')} />
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-3 gap-3">
            <Kpi icon={<TrendingUp />} tone="bg-primary-soft text-primary-ink" label={t('dayRecap.totalRevenue')} value={<Money value={s.total_revenue} decimals={0} />} />
            <Kpi icon={<ShoppingCart />} tone="bg-info-soft text-info-ink" label={t('dayRecap.orders')} value={s.order_count} />
            <Kpi
              icon={<Wallet />}
              tone={s.net_profit >= 0 ? 'bg-success-soft text-success-ink' : 'bg-danger-soft text-danger-ink'}
              label={t('dayRecap.netProfit')}
              value={<Money value={s.net_profit} decimals={0} className={s.net_profit < 0 ? 'text-danger-ink' : undefined} />}
            />
          </div>
          {s.total_delivery_fees > 0 && (
            <p className="-mt-3 flex items-center gap-2 text-xs text-muted">
              <Truck className="h-4 w-4 text-faint" />
              {t('dayRecap.deliveryFees')} <Money value={s.total_delivery_fees} decimals={0} className="font-semibold text-ink-2" />
            </p>
          )}

          <div className="grid sm:grid-cols-2 gap-6">
            {recap.types.length > 0 && (
              <section>
                <h3 className="mb-2 text-sm font-semibold text-ink">{t('dayRecap.orderTypes')}</h3>
                <ul className="space-y-2">
                  {recap.types.map((ot) => (
                    <li key={ot.order_type} className="flex items-center justify-between gap-3 rounded-xl border border-line px-3.5 py-2.5">
                      <span className="text-sm text-ink-2">{t(`orders.${ot.order_type}`, { defaultValue: ot.order_type })}</span>
                      <span className="text-end">
                        <span className="num block text-sm font-bold text-ink">{ot.count}</span>
                        <Money value={ot.revenue} decimals={0} className="text-xs text-muted" />
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {recap.methods.length > 0 && (
              <section>
                <h3 className="mb-2 text-sm font-semibold text-ink">{t('dayRecap.payments')}</h3>
                <ul className="space-y-2">
                  {recap.methods.filter((m) => Math.abs(m.amount) > 0.004).map((m) => (
                    <li key={m.method} className="flex items-center justify-between gap-3 rounded-xl border border-line px-3.5 py-2.5">
                      <span className="text-sm text-ink-2">{paymentMethodLabel(m.method, lang)}</span>
                      <Money value={m.amount} decimals={0} className="text-sm font-bold text-ink" />
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>

          {recap.top.length > 0 && (
            <section>
              <h3 className="mb-2 text-sm font-semibold text-ink">{t('dayRecap.topItems', { count: recap.top.length })}</h3>
              <ul className="space-y-2">
                {recap.top.map((item, idx) => (
                  <li key={`${item.name}-${idx}`} className="flex items-center gap-4 rounded-xl border border-line px-3.5 py-2.5">
                    <span className={cn('num h-8 w-8 shrink-0 rounded-lg text-sm font-bold flex items-center justify-center', RANK[idx] ?? 'bg-surface-2 text-ink-2')}>{idx + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink"><bdi>{nameOf(item)}</bdi></p>
                      <p className="text-xs text-muted">{item.category_name}</p>
                    </div>
                    <div className="text-end shrink-0">
                      <p className="text-sm font-semibold text-ink">{t('dayRecap.itemSold', { count: item.total_quantity })}</p>
                      <Money value={item.total_revenue} decimals={0} className="text-xs text-muted" />
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </Modal>
  )
}
