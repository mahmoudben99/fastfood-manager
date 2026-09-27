import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Banknote, CreditCard, HandCoins, ChartPie, Wallet } from 'lucide-react'
import { Card, EmptyState, Input, Money, SegmentedControl, Skeleton, StatCard } from '../../../components/ui'
import { daysAgo, localToday, useAsync, useMethodLabel } from '../cashShared'
import { UnpaidOrdersCard } from './UnpaidOrdersCard'
import { OrderLookupCard } from './OrderLookupCard'

type Preset = 'today' | 'yesterday' | 'week' | 'month' | 'custom'

function presetRange(preset: Preset): [string, string] | null {
  switch (preset) {
    case 'today': return [localToday(), localToday()]
    case 'yesterday': return [daysAgo(1), daysAgo(1)]
    case 'week': return [daysAgo(6), localToday()]
    case 'month': return [daysAgo(29), localToday()]
    default: return null
  }
}

/** Payments: collected by method for a date range, pay-later balances, order lookup (refund, invoice). */
export function PaymentsTab() {
  const { t } = useTranslation()
  const [preset, setPreset] = useState<Preset>('today')
  const [from, setFrom] = useState(localToday())
  const [to, setTo] = useState(localToday())
  const [version, setVersion] = useState(0)
  const bump = useCallback(() => setVersion((v) => v + 1), [])
  const methods = useAsync(() => window.api.payments.getMethods(), [])
  const methodLabel = useMethodLabel(methods.data)
  const sales = useAsync(() => window.api.payments.salesByMethod(from, to), [from, to, version])
  const unpaid = useAsync(() => window.api.payments.listUnpaid(), [version])

  const choose = (p: Preset): void => {
    setPreset(p)
    const range = presetRange(p)
    if (range) {
      setFrom(range[0])
      setTo(range[1])
    }
  }

  const rows = useMemo(() => (sales.data ?? []).filter((r) => r.amount !== 0 || r.count > 0), [sales.data])
  const total = rows.reduce((a, r) => a + r.amount, 0)
  const cash = rows.find((r) => r.method === 'cash')?.amount ?? 0
  const electronic = total - cash
  const dueCount = unpaid.data?.length ?? 0
  const dueAmount = (unpaid.data ?? []).reduce((a, r) => a + r.balance_due, 0)
  // LRI … PDI: keeps "61%" in one left-to-right run inside Arabic sentences.
  const share = (v: number): string =>
    total > 0 ? `${String.fromCharCode(0x2066)}${Math.round((v / total) * 100)}%${String.fromCharCode(0x2069)}` : '—'
  const max = Math.max(1, ...rows.map((r) => r.amount))
  const loadingKpi = sales.loading && !sales.data

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <SegmentedControl
          value={preset}
          onChange={choose}
          options={[
            { value: 'today', label: t('cashAdmin.range.today') },
            { value: 'yesterday', label: t('cashAdmin.range.yesterday') },
            { value: 'week', label: t('cashAdmin.range.week') },
            { value: 'month', label: t('cashAdmin.range.month') },
            { value: 'custom', label: t('cashAdmin.range.custom') }
          ]}
        />
        {preset === 'custom' && (
          <>
            <div className="w-40"><Input type="date" aria-label={t('cashAdmin.from')} value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></div>
            <div className="w-40"><Input type="date" aria-label={t('cashAdmin.to')} value={to} min={from} onChange={(e) => setTo(e.target.value)} /></div>
          </>
        )}
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard loading={loadingKpi} label={t('cashAdmin.payments.collected')} icon={<Wallet />} value={<Money value={total} decimals={0} />} />
        <StatCard loading={loadingKpi} tone="success" label={methodLabel('cash')} icon={<Banknote />} value={<Money value={cash} decimals={0} />}
          footer={t('cashAdmin.payments.share', { share: share(cash) })} />
        <StatCard loading={loadingKpi} tone="info" label={t('cashAdmin.payments.electronic')} icon={<CreditCard />} value={<Money value={electronic} decimals={0} />}
          footer={t('cashAdmin.payments.share', { share: share(electronic) })} />
        <StatCard loading={unpaid.loading && !unpaid.data} tone={dueCount > 0 ? 'warning' : 'neutral'} label={t('cashAdmin.payments.toCollect')}
          icon={<HandCoins />} value={<Money value={dueAmount} decimals={0} />} footer={t('cashAdmin.payments.unpaidOrders', { count: dueCount })} />
      </div>

      <div className="grid xl:grid-cols-5 gap-6">
        <Card className="xl:col-span-3" title={t('cashAdmin.payments.byMethod')} icon={<ChartPie />}>
          {loadingKpi ? (
            <div className="space-y-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-10 rounded-xl" />)}</div>
          ) : rows.length === 0 ? (
            <EmptyState compact icon={<ChartPie />} title={t('cashAdmin.payments.emptyTitle')} />
          ) : (
            <ul className="space-y-4">
              {rows.map((r, i) => (
                <li key={r.method}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="flex items-center gap-2 min-w-0">
                      <span className="text-sm font-semibold text-ink truncate">{methodLabel(r.method)}</span>
                      <span className="text-xs text-muted">{t('cashAdmin.report.paymentCount', { count: r.count })}</span>
                    </span>
                    <span className="flex items-baseline gap-3">
                      <span className="num text-xs font-semibold text-muted">{share(r.amount)}</span>
                      <span className="text-base font-bold text-ink"><Money value={r.amount} decimals={0} /></span>
                    </span>
                  </div>
                  <div className="mt-2 h-2.5 rounded-full bg-surface-2 overflow-hidden">
                    <div
                      className={i === 0 ? 'h-full rounded-full bg-ember' : 'h-full rounded-full bg-primary-soft-2'}
                      style={{ width: `${Math.max(0, (r.amount / max) * 100)}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <OrderLookupCard className="xl:col-span-2" methods={methods.data} onChanged={bump} />
      </div>

      <UnpaidOrdersCard rows={unpaid.data} loading={unpaid.loading && !unpaid.data} methods={methods.data} onChanged={bump} />
    </div>
  )
}
