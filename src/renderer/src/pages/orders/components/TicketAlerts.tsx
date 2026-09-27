import { useTranslation } from 'react-i18next'
import { AlertTriangle, Printer, X } from 'lucide-react'
import { Button, toast } from '../../../components/ui'
import { useOrderStore } from '../../../store/orderStore'
import type { CheckoutError } from '../lib/checkout'
import type { PrintJobData } from '../types'

/** Print jobs that need staff (missing printer…): stays until retried or dismissed. */
export function PrintAlerts({ attention, active, onRetry, onDismiss }: {
  attention: PrintJobData[]
  active: PrintJobData[]
  onRetry: (id: number) => Promise<string | null>
  onDismiss: (id: number) => Promise<string | null>
}) {
  const { t } = useTranslation()
  if (attention.length > 0) {
    const job = attention[0]
    const destination = job.document_type === 'receipt'
      ? t('pos.print.receipt')
      : job.worker_name ? t('pos.print.kitchenFor', { name: job.worker_name }) : t('pos.print.kitchen')
    const run = async (action: (id: number) => Promise<string | null>): Promise<void> => {
      const failure = await action(job.id)
      if (failure) toast.error(t('pos.print.actionFailed'), { description: failure })
    }
    return (
      <div role="alert" className="mx-4 mt-3 rounded-xl border border-warning/40 bg-warning-soft px-3 py-2 flex flex-wrap items-center gap-x-3 gap-y-2 animate-fade-in">
        <Printer className="h-5 w-5 shrink-0 text-warning-ink" />
        <div className="min-w-[12rem] flex-1">
          <p className="text-sm font-bold text-ink leading-snug truncate">
            {t('pos.print.notConfirmed', { number: job.daily_number, destination })}
          </p>
          <p className="text-xs text-ink-2 truncate">
            {job.last_error || t('pos.print.attention')}
            {attention.length > 1 && <span className="font-semibold text-warning-ink"> · {t('pos.print.more', { count: attention.length - 1 })}</span>}
          </p>
        </div>
        <div className="flex gap-2 ms-auto">
          <Button size="lg" variant="secondary" onClick={() => run(onRetry)}>{t('pos.print.retry')}</Button>
          <Button size="lg" variant="ghost" onClick={() => run(onDismiss)}>{t('pos.print.dismiss')}</Button>
        </div>
      </div>
    )
  }
  if (active.length === 0) return null
  return (
    <div aria-live="polite" className="mx-4 mt-3 self-start rounded-full bg-info-soft px-3 py-1.5 flex items-center gap-2">
      <Printer className="h-4 w-4 text-info-ink animate-pulse-soft" />
      <p className="text-xs font-semibold text-info-ink">{t('pos.print.printing', { count: active.length })}</p>
    </div>
  )
}

/** The save failed: why, what to do, and the reassurance that the cart is kept. */
export function CheckoutErrorBanner({ error, onDismiss, onAcceptBelowMin, onOpenShift }: {
  error: CheckoutError
  onDismiss: () => void
  onAcceptBelowMin: () => void
  onOpenShift: () => void
}) {
  const { t } = useTranslation()
  const editing = useOrderStore((s) => s.editingOrderId !== null)
  const number = useOrderStore((s) => s.editingOrderDailyNumber ?? s.editingOrderId ?? '')
  let message = error.message || t('pos.error.generic')
  if (error.kind === 'edit_rejected') {
    message = error.reason ? t(`orders.editRejected.${error.reason}`, { number }) : t('orders.editRejected.generic', { message: error.message })
  } else if (error.kind === 'below_min') {
    message = error.zone && error.min !== undefined
      ? t('pos.error.belowMin', { zone: error.zone, min: error.min })
      : t('pos.error.belowMinGeneric')
  } else if (error.kind === 'no_shift') {
    message = t('pos.error.noShift')
  }
  return (
    <div role="alert" aria-live="assertive" className="mt-2 rounded-xl border border-danger/35 bg-danger-soft px-3 py-2.5 animate-pop-in">
      <div className="flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-danger-ink" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-danger-ink">
            {editing ? t('orders.orderError.updateTitle') : t('orders.orderError.placeTitle')}
          </p>
          <p className="text-sm text-ink mt-0.5 break-words">{message}</p>
          <p className="text-xs text-ink-2 mt-1">{t('pos.error.cartKept')}</p>
          {(error.kind === 'below_min' || error.kind === 'no_shift') && (
            <div className="flex gap-2 mt-2">
              {error.kind === 'below_min' && <Button size="sm" variant="secondary" onClick={onAcceptBelowMin}>{t('pos.error.acceptAnyway')}</Button>}
              {error.kind === 'no_shift' && <Button size="sm" variant="secondary" onClick={onOpenShift}>{t('pos.error.openShift')}</Button>}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label={t('orders.orderError.dismiss')}
          className="tap h-9 w-9 -me-1 -mt-1 shrink-0 rounded-lg flex items-center justify-center text-danger-ink hover:bg-danger/10"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
