import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CircleCheck, HandCoins, RotateCcw, Search } from 'lucide-react'
import type { PaymentMethodConfig } from '../../../../../shared/cash'
import { Badge, Button, Card, EmptyState, Input, Money, Skeleton } from '../../../components/ui'
import { fmtDate, td, tdEnd, th, thEnd } from '../cashShared'
import { CollectPaymentModal, type CollectTarget } from './CollectPaymentModal'

export type UnpaidRow = Awaited<ReturnType<typeof window.api.payments.listUnpaid>>[number]

/** Orders with a balance due (pay later, partial, COD not yet settled) with a "Collect" action. */
export function UnpaidOrdersCard({ rows, loading, methods, onChanged }: {
  rows: UnpaidRow[] | null
  loading: boolean
  methods: PaymentMethodConfig[] | null
  onChanged: () => void
}) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [collect, setCollect] = useState<CollectTarget | null>(null)

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (rows ?? []).filter(
      (r) => !q || String(r.daily_number) === q.replace('#', '') || (r.customer_name ?? '').toLowerCase().includes(q) || (r.customer_phone ?? '').includes(q)
    )
  }, [rows, query])

  return (
    <Card
      padding={false}
      title={t('cashAdmin.unpaid.title')}
      icon={<HandCoins />}
      actions={
        <div className="w-56 hidden md:block">
          <Input leading={<Search />} value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('cashAdmin.unpaid.search')} aria-label={t('cashAdmin.unpaid.search')} />
        </div>
      }
    >
      {loading ? (
        <div className="p-5 space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12 rounded-xl" />)}</div>
      ) : shown.length === 0 ? (
        <EmptyState compact icon={<CircleCheck />} title={t('cashAdmin.unpaid.emptyTitle')} />
      ) : (
        <div className="relative overflow-x-auto">
          <table className="w-full min-w-[820px]">
            <thead className="bg-surface-2">
              <tr>
                <th className={th}>{t('cashAdmin.order')}</th>
                <th className={th}>{t('cashAdmin.customer')}</th>
                <th className={thEnd}>{t('cashAdmin.total')}</th>
                <th className={thEnd}>{t('cashAdmin.paid')}</th>
                <th className={thEnd}>{t('cashAdmin.balanceDue')}</th>
                <th className={th}>{t('cashAdmin.status.label')}</th>
                <th className={thEnd}><span className="sr-only">{t('common.actions')}</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {shown.map((r) => (
                <tr key={r.id} className="h-14">
                  <td className={td}>
                    <div className="font-bold text-ink num">#{r.daily_number}</div>
                    <div className="text-xs text-muted">
                      <span className="num">{fmtDate(r.order_date)}</span> · {t(`cashAdmin.orderType.${r.order_type}`, { defaultValue: r.order_type })}
                    </div>
                  </td>
                  <td className={td}>
                    <bdi className="font-medium text-ink">{r.customer_name || t('cashAdmin.walkIn')}</bdi>
                    {r.customer_phone && <div className="text-xs text-muted num"><bdi dir="ltr">{r.customer_phone}</bdi></div>}
                  </td>
                  <td className={tdEnd}><Money value={r.total} decimals={0} /></td>
                  <td className={tdEnd}><span className="text-ink-2 font-medium"><Money value={r.paid} decimals={0} /></span></td>
                  <td className={tdEnd}><span className="text-warning-ink font-bold"><Money value={r.balance_due} decimals={0} /></span></td>
                  <td className={td}>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant={r.payment_status === 'partial' ? 'info' : 'warning'} dot>
                        {r.payment_status === 'partial' ? t('cashAdmin.payStatus.partial') : t('cashAdmin.payStatus.unpaid')}
                      </Badge>
                      {r.refunded > 0 && (
                        <Badge variant="neutral" icon={<RotateCcw />}>
                          {t('cashAdmin.unpaid.refunded')} <Money value={r.refunded} decimals={0} styledSymbol={false} />
                        </Badge>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2 text-end">
                    <Button size="md" variant="soft" icon={<HandCoins className="h-4 w-4" />} onClick={() => setCollect(r)}>
                      {t('cashAdmin.unpaid.collect')}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <CollectPaymentModal order={collect} methods={methods} onClose={() => setCollect(null)} onDone={onChanged} />
    </Card>
  )
}
