import { FormEvent, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowDownLeft, ArrowUpRight, FileText, HandCoins, RotateCcw, Search } from 'lucide-react'
import type { InvoiceRow, OrderPaymentSummary, PaymentMethodConfig } from '../../../../../shared/cash'
import { Badge, Button, Card, EmptyState, Input, Money, cn } from '../../../components/ui'
import { errorText, fmtDate, fmtTime, localToday, useMethodLabel } from '../cashShared'
import { CollectPaymentModal, type CollectTarget } from './CollectPaymentModal'
import { RefundModal } from './RefundModal'
import { InvoiceModal } from './InvoiceModal'

interface FoundOrder {
  id: number
  daily_number: number
  order_date: string
  order_type: string
  status: string
  customer_name: string | null
  customer_phone: string | null
  summary: OrderPaymentSummary
  invoice: InvoiceRow | null
}

const PAY_BADGE: Record<string, 'success' | 'warning' | 'info' | 'danger'> = { paid: 'success', unpaid: 'warning', partial: 'info', void: 'danger' }

/** Find an order by its daily number → payments ledger, refund (with approval), invoice ("facture"). */
export function OrderLookupCard({ methods, onChanged, className = '' }: { methods: PaymentMethodConfig[] | null; onChanged: () => void; className?: string }) {
  const { t } = useTranslation()
  const methodLabel = useMethodLabel(methods)
  const [number, setNumber] = useState('')
  const [date, setDate] = useState(localToday())
  const [found, setFound] = useState<FoundOrder | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [modal, setModal] = useState<'refund' | 'invoice' | 'collect' | null>(null)

  const load = async (target?: { n: number; d: string }): Promise<void> => {
    const n = target?.n ?? Number(String(number).replace('#', ''))
    const d = target?.d ?? date
    if (!Number.isInteger(n) || n < 1) return setMessage(t('cashAdmin.lookup.enterNumber'))
    setBusy(true)
    setMessage('')
    try {
      const orders: { id: number; daily_number: number }[] = await window.api.orders.getByDate(d)
      const hit = orders.find((o) => o.daily_number === n)
      if (!hit) {
        setFound(null)
        setMessage(t('cashAdmin.lookup.notFound', { number: n, date: fmtDate(d) }))
        return
      }
      const [summary, invoice, order] = await Promise.all([
        window.api.payments.forOrder(hit.id),
        window.api.payments.getInvoice(hit.id),
        window.api.orders.getById(hit.id)
      ])
      setFound({
        id: hit.id, daily_number: n, order_date: d, order_type: order?.order_type ?? '', status: order?.status ?? '',
        customer_name: order?.customer_name ?? null, customer_phone: order?.customer_phone ?? null, summary, invoice
      })
    } catch (e) {
      setMessage(errorText(e, t('common.error')))
    } finally {
      setBusy(false)
    }
  }

  const refresh = (): void => {
    onChanged()
    if (found) void load({ n: found.daily_number, d: found.order_date })
  }

  const submit = (e: FormEvent): void => {
    e.preventDefault()
    void load()
  }

  const s = found?.summary
  const collectTarget: CollectTarget | null = found && s && modal === 'collect'
    ? { id: found.id, daily_number: found.daily_number, order_date: found.order_date, total: s.total, paid: s.paid, balance_due: s.balanceDue, customer_name: found.customer_name }
    : null

  return (
    <Card className={className} title={t('cashAdmin.lookup.title')} icon={<Search />}>
      <form onSubmit={submit} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end">
        <Input label={t('cashAdmin.lookup.number')} inputMode="numeric" value={number} placeholder="#" onChange={(e) => setNumber(e.target.value)} />
        <Input label={t('cashAdmin.lookup.date')} type="date" value={date} max={localToday()} onChange={(e) => setDate(e.target.value)} />
        <Button type="submit" size="lg" variant="secondary" loading={busy} icon={<Search className="h-4 w-4" />} aria-label={t('cashAdmin.lookup.find')}>
          {t('cashAdmin.lookup.find')}
        </Button>
      </form>
      {message && <p className="mt-3 text-sm font-medium text-warning-ink bg-warning-soft rounded-xl px-3 py-2.5">{message}</p>}

      {!found || !s ? (
        !message && <EmptyState compact icon={<FileText />} title={t('cashAdmin.lookup.emptyTitle')} />
      ) : (
        <div className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-lg font-extrabold text-ink num">#{found.daily_number}</span>
            <span className="text-sm text-muted num">{fmtDate(found.order_date)}</span>
            <span className="text-sm text-muted">· {t(`cashAdmin.orderType.${found.order_type}`, { defaultValue: found.order_type })}</span>
            <Badge className="ms-auto" variant={PAY_BADGE[s.status] ?? 'neutral'} dot>{t(`cashAdmin.payStatus.${s.status}`)}</Badge>
          </div>
          {(found.customer_name || found.customer_phone) && (
            <p className="text-sm text-ink-2">
              <bdi>{found.customer_name}</bdi>
              {found.customer_phone && <span className="text-muted num"> · <bdi dir="ltr">{found.customer_phone}</bdi></span>}
            </p>
          )}
          <div className="grid grid-cols-3 gap-2">
            {([[t('cashAdmin.total'), s.total], [t('cashAdmin.paid'), s.paid], [t('cashAdmin.balanceDue'), s.balanceDue]] as const).map(([label, v], i) => (
              <div key={i} className={cn('rounded-xl px-3 py-2', i === 2 && v > 0 ? 'bg-warning-soft' : 'bg-surface-2')}>
                <p className="text-xs text-muted">{label}</p>
                <p className="text-sm font-bold text-ink"><Money value={v} decimals={0} /></p>
              </div>
            ))}
          </div>
          <ul className="space-y-1.5 max-h-48 overflow-y-auto">
            {s.legacy && <li className="text-xs text-muted">{t('cashAdmin.lookup.legacy')}</li>}
            {s.payments.map((p) => {
              const refund = p.kind === 'refund'
              return (
                <li key={p.id} className="flex items-center gap-2.5 rounded-lg bg-surface-2 px-3 py-2 text-sm">
                  {refund ? <ArrowUpRight className="h-4 w-4 text-danger-ink shrink-0" /> : <ArrowDownLeft className="h-4 w-4 text-success-ink shrink-0" />}
                  <span className="font-semibold text-ink">{methodLabel(p.method)}</span>
                  <span className="text-xs text-muted num truncate">
                    {fmtTime(p.created_at)}
                    {p.reference ? ` · ${p.reference}` : ''}
                    {refund && p.reason ? ` · ${p.reason}` : ''}
                  </span>
                  <span className={cn('ms-auto font-bold', refund ? 'text-danger-ink' : 'text-ink')}><Money value={p.amount} decimals={0} /></span>
                </li>
              )
            })}
          </ul>
          {found.invoice && (
            <p className="text-sm text-muted">
              {t('cashAdmin.invoice.issued')} <span className="font-bold text-ink num">{found.invoice.invoice_number}</span>
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {s.balanceDue > 0 && s.status !== 'void' && (
              <Button variant="soft" icon={<HandCoins className="h-4 w-4" />} onClick={() => setModal('collect')}>{t('cashAdmin.unpaid.collect')}</Button>
            )}
            <Button variant="secondary" icon={<RotateCcw className="h-4 w-4" />} disabled={s.paid <= 0} onClick={() => setModal('refund')}>
              {t('cashAdmin.refund.action')}
            </Button>
            <Button variant="secondary" icon={<FileText className="h-4 w-4" />} disabled={found.status === 'cancelled'} onClick={() => setModal('invoice')}>
              {t('cashAdmin.invoice.action')}
            </Button>
          </div>
        </div>
      )}

      <RefundModal
        isOpen={modal === 'refund'}
        orderId={found?.id ?? 0}
        dailyNumber={found?.daily_number ?? 0}
        summary={s ?? null}
        methods={methods}
        onClose={() => setModal(null)}
        onDone={refresh}
      />
      <InvoiceModal
        isOpen={modal === 'invoice'}
        orderId={found?.id ?? 0}
        dailyNumber={found?.daily_number ?? 0}
        defaultName={found?.customer_name ?? ''}
        invoice={found?.invoice ?? null}
        onClose={() => setModal(null)}
        onIssued={refresh}
      />
      <CollectPaymentModal order={collectTarget} methods={methods} onClose={() => setModal(null)} onDone={refresh} />
    </Card>
  )
}
