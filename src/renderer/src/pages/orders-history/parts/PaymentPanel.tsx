import { ReactNode, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowLeftRight, Banknote, CreditCard, Info, QrCode, Undo2, Wallet } from 'lucide-react'
import { Money, cn } from '../../../components/ui'
import { useAppStore } from '../../../store/appStore'
import {
  isBuiltinPaymentMethod, paymentMethodLabel, type CashLang, type OrderPaymentRow, type OrderPaymentSummary
} from '../../../../../shared/cash'
import { DetailSection, PaymentBadge, effectivePaymentStatus, formatClock } from './labels'

const METHOD_ICON: Record<string, ReactNode> = {
  cash: <Banknote />,
  cib: <CreditCard />,
  edahabia: <CreditCard />,
  baridipay: <QrCode />,
  transfer: <ArrowLeftRight />
}

function PaymentRow({ row, lang, customLabel }: { row: OrderPaymentRow; lang: CashLang; customLabel?: string }) {
  const { t } = useTranslation()
  const refund = row.kind === 'refund'
  return (
    <li className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
      <span
        className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl [&_svg]:h-[18px] [&_svg]:w-[18px]',
          refund ? 'bg-danger-soft text-danger-ink' : 'bg-surface-2 text-ink-2'
        )}
      >
        {refund ? <Undo2 /> : METHOD_ICON[row.method] ?? <Wallet />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <span className="min-w-0 text-sm font-semibold text-ink">
            {refund && <span className="text-danger-ink">{t('orderHistory.pay.refund')} · </span>}
            {paymentMethodLabel(row.method, lang, customLabel)}
          </span>
          <span className={cn('shrink-0 text-sm font-bold', refund ? 'text-danger-ink' : 'text-ink')}>
            <Money value={row.amount} />
          </span>
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
          <span className="num">{formatClock(row.created_at)}</span>
          {row.tendered != null && (
            <span>
              {t('orderHistory.pay.given')} <Money value={row.tendered} styledSymbol={false} />
            </span>
          )}
          {row.change_given > 0 && (
            <span>
              {t('orderHistory.pay.change')} <Money value={row.change_given} styledSymbol={false} />
            </span>
          )}
          {row.reference && <bdi>{t('orderHistory.pay.reference', { ref: row.reference })}</bdi>}
          {row.operator && <bdi>{row.operator}</bdi>}
        </div>
        {row.reason && <p className="mt-0.5 text-xs text-muted">{row.reason}</p>}
      </div>
    </li>
  )
}

/**
 * Payments of one order (payments.forOrder): lines incl. refunds, paid/unpaid badge, balance.
 * A pre-v4 order (payment_status NULL, no rows) is shown as paid in cash.
 */
export function PaymentPanel({
  summary,
  orderStatus,
  paymentStatus,
  total
}: {
  summary: OrderPaymentSummary | null
  orderStatus: string
  paymentStatus: string | null | undefined
  total: number
}) {
  const { t } = useTranslation()
  const language = useAppStore((s) => s.language)
  const lang: CashLang = language === 'fr' || language === 'ar' ? language : 'en'
  const status = summary?.status ?? effectivePaymentStatus(paymentStatus, orderStatus)
  // Custom methods (e.g. "Yassir Pay") carry the owner's label; built-ins stay translated.
  const [customLabels, setCustomLabels] = useState<Record<string, string>>({})
  const needsLabels = Boolean(summary?.payments.some((row) => !isBuiltinPaymentMethod(row.method)))
  useEffect(() => {
    if (!needsLabels) return
    let live = true
    window.api.payments.getMethods()
      .then((methods) => {
        if (!live) return
        const labels: Record<string, string> = {}
        for (const m of methods) if (m.label) labels[m.id] = m.label
        setCustomLabels(labels)
      })
      .catch(() => {})
    return () => { live = false }
  }, [needsLabels])

  return (
    <DetailSection icon={<Wallet />} title={t('orderHistory.pay.title')} aside={<PaymentBadge status={status} />}>
      {!summary ? (
        <p className="text-sm text-muted">{t('orderHistory.pay.unavailable')}</p>
      ) : summary.legacy ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-3 text-sm font-semibold text-ink">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-surface-2 text-ink-2 [&_svg]:h-[18px] [&_svg]:w-[18px]">
                <Banknote />
              </span>
              {paymentMethodLabel('cash', lang)}
            </span>
            <span className="text-sm font-bold text-ink"><Money value={total} /></span>
          </div>
          <p className="flex items-start gap-2 rounded-xl bg-surface-2 p-3 text-xs text-muted">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {t('orderHistory.pay.legacy')}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {summary.payments.length === 0 ? (
            <p className="text-sm text-muted">{t('orderHistory.pay.none')}</p>
          ) : (
            <ul className="divide-y divide-line">
              {summary.payments.map((row) => (
                <PaymentRow
                  key={row.id}
                  row={row}
                  lang={lang}
                  customLabel={isBuiltinPaymentMethod(row.method) ? undefined : customLabels[row.method]}
                />
              ))}
            </ul>
          )}
          <dl className="space-y-1.5 border-t border-dashed border-line-strong pt-3 text-sm">
            <div className="flex justify-between gap-3 text-ink-2">
              <dt>{t('orderHistory.pay.paidAmount')}</dt>
              <dd className="font-semibold"><Money value={summary.paid} /></dd>
            </div>
            {status !== 'void' && summary.balanceDue > 0 && (
              <div className="flex items-baseline justify-between gap-3 text-warning-ink">
                <dt className="font-bold">{t('orderHistory.pay.balanceDue')}</dt>
                <dd className="text-lg font-extrabold"><Money value={summary.balanceDue} /></dd>
              </div>
            )}
            {status !== 'void' && summary.balanceDue < 0 && (
              <div className="flex items-baseline justify-between gap-3 text-danger-ink">
                <dt className="font-bold">{t('orderHistory.pay.owed')}</dt>
                <dd className="text-lg font-extrabold"><Money value={-summary.balanceDue} /></dd>
              </div>
            )}
          </dl>
        </div>
      )}
    </DetailSection>
  )
}
