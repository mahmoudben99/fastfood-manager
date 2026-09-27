import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Wallet } from 'lucide-react'
import { roundCash } from '../../../../../shared/cash'
import { Button, Money, formatAmount } from '../../../components/ui'
import type { CartTotals } from '../../../store/orderStore'
import { moneyDecimals } from './MenuTile'
import { SignedMoney } from './SignedMoney'

/** Exact (after cash rounding) + the next three notes a customer is likely to hand over. */
export function tenderSuggestions(total: number, step: number): number[] {
  const exact = roundCash(total, step)
  const next = [100, 500, 1000, 2000, 5000]
    .map((unit) => Math.ceil((exact + 0.001) / unit) * unit)
    .filter((v, i, all) => v > exact && all.indexOf(v) === i)
  return [exact, ...next.slice(0, 3)]
}

interface TicketFooterProps {
  totals: CartTotals
  editing: boolean
  busy: boolean
  isTouch: boolean
  showTender: boolean
  cashStep: number
  onPay: () => void
  onTender: (amount: number) => void
}

/** Totals (count-up total), one-tap cash, and the single ember Pay action (F2). */
export const TicketFooter = memo(function TicketFooter({ totals, editing, busy, isTouch, showTender, cashStep, onPay, onTender }: TicketFooterProps) {
  const { t } = useTranslation()
  const empty = totals.count === 0
  const tenders = showTender && !empty && totals.total > 0 ? tenderSuggestions(totals.total, cashStep) : []

  return (
    <div className="shrink-0 pt-2">
      <div className="space-y-1 text-sm">
        <div className="flex justify-between text-muted">
          <span>{t('pos.ticket.subtotal')}</span>
          <Money value={totals.subtotal} decimals={moneyDecimals(totals.subtotal)} styledSymbol={false} />
        </div>
        {totals.discount > 0 && (
          <div className="flex justify-between gap-3 text-success-ink font-semibold">
            <span className="min-w-0 truncate" title={totals.discountDetails}>
              {t('pos.ticket.discount')}
              {totals.discountDetails && <span className="font-normal text-muted"> · {totals.discountDetails}</span>}
            </span>
            <SignedMoney value={totals.discount} sign="−" className="shrink-0" />
          </div>
        )}
        {totals.deliveryFee > 0 && (
          <div className="flex justify-between text-muted">
            <span>{t('pos.ticket.deliveryFee')}</span>
            <Money value={totals.deliveryFee} decimals={moneyDecimals(totals.deliveryFee)} styledSymbol={false} />
          </div>
        )}
        <div className="flex items-end justify-between pt-2 mt-1 border-t border-dashed border-line-strong">
          <span className="text-base font-bold text-ink">{t('pos.ticket.total')}</span>
          <span className="text-total text-ink" data-testid="order-total">
            <Money value={totals.total} decimals={moneyDecimals(totals.total)} animate />
          </span>
        </div>
      </div>

      {tenders.length > 0 && (
        <div className="pos-quick-tender pt-3" role="group" aria-label={t('pos.ticket.quickCash')}>
          <div className="grid grid-cols-4 gap-2">
            {tenders.map((amount, i) => (
              <Button
                key={amount}
                variant="secondary"
                size="lg"
                className="px-1 text-[0.9375rem]"
                disabled={busy}
                cooldownMs={800}
                onClick={() => onTender(amount)}
              >
                {i === 0 ? t('pos.ticket.exact') : <bdi dir="ltr" className="num">{formatAmount(amount, 0)}</bdi>}
              </Button>
            ))}
          </div>
        </div>
      )}

      <div className="pt-2 pb-1">
        <Button
          size="touch"
          fullWidth
          icon={editing ? <Check /> : <Wallet />}
          disabled={empty}
          loading={busy}
          cooldownMs={800}
          onClick={onPay}
          data-testid="pay-button"
        >
          <span className="flex-1 text-start">{editing ? t('pos.ticket.update') : t('pos.ticket.pay')}</span>
          {!empty && !editing && <Money value={totals.total} decimals={moneyDecimals(totals.total)} className="text-lg" />}
          {!isTouch && <kbd className="num ms-1 rounded-md bg-on-primary/20 px-1.5 py-0.5 text-xs font-bold">F2</kbd>}
        </Button>
      </div>
    </div>
  )
})
