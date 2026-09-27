import { useTranslation } from 'react-i18next'
import { Check, Clock, Printer } from 'lucide-react'
import { Button, Modal, Money } from '../../../components/ui'
import type { SuccessInfo } from '../hooks/useCheckout'
import { kitchenPrintTargets, runManualPrint } from '../lib/printing'
import { moneyDecimals } from './MenuTile'

/** Order sent: big number, change due (≥40px, success colour), manual print buttons. */
export function SuccessModal({ info, onClose }: { info: SuccessInfo; onClose: () => void }) {
  const { t } = useTranslation()
  const targets = kitchenPrintTargets(t, info.orderId, info.workers, info.unassignedCount, { reprint: info.autoPrinted.includes('kitchen') })
  return (
    <Modal isOpen onClose={onClose} size="sm">
      <div className="text-center pt-2">
        <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-success-soft text-success-ink flex items-center justify-center animate-pop-in">
          <Check className="h-8 w-8" strokeWidth={3} />
        </div>
        <p className="text-sm font-semibold text-muted">{t('pos.success.title')}</p>
        <p className="num text-display text-ink mt-1" data-testid="success-number">#{info.orderNumber}</p>

        {info.change !== null && (
          <div className="mt-5 rounded-2xl bg-success-soft px-4 py-3">
            <p className="text-sm font-bold text-success-ink">{t('pos.success.change')}</p>
            <p className="text-[2.75rem] leading-tight font-extrabold text-success-ink">
              <Money value={info.change} decimals={moneyDecimals(info.change)} />
            </p>
          </div>
        )}
        {info.unpaid && (
          <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-warning-soft px-3 py-1.5 text-sm font-bold text-warning-ink">
            <Clock className="h-4 w-4" />
            {t('pos.success.payLater')}
          </p>
        )}

        <div className="grid gap-2 mt-6">
          <Button
            variant="secondary"
            size="lg"
            icon={<Printer />}
            cooldownMs={800}
            // Only a copy of something auto-print already queued is a reprint; a first print must not be
            // flagged REPRINT or the kitchen may ignore it.
            onClick={() => runManualPrint(t, () => window.api.printer.printReceipt(info.orderId, { reprint: info.autoPrinted.includes('receipt') }), t('orders.reprint.receipt'))}
          >
            {t('orders.printReceipt')}
          </Button>
          {targets.map((target) => (
            <Button key={target.key} variant="secondary" size="lg" icon={<Printer />} cooldownMs={800} onClick={() => runManualPrint(t, target.run, t('orders.reprint.kitchen'))}>
              {target.label}
            </Button>
          ))}
        </div>
        <Button size="xl" fullWidth className="mt-4" onClick={onClose} autoFocus>
          {t('pos.success.newOrder')}
        </Button>
      </div>
    </Modal>
  )
}
