import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle } from 'lucide-react'
import { DeliveryPanel, type DeliveryDraft, type RepeatLine } from '../../../components/checkout'
import { Button, Modal } from '../../../components/ui'
import { cartTotals, useOrderStore } from '../../../store/orderStore'
import type { Validation } from '../hooks/useCheckout'

/** Fee the order will carry: the draft's fee (the panel mirrors the chosen zone's fee into it). */
export function deliveryFeeFor(draft: DeliveryDraft | null): number {
  const fee = Number(draft?.fee)
  return draft && draft.fee !== undefined && draft.fee !== null && Number.isFinite(fee) ? Math.max(0, fee) : 0
}

interface DeliverySheetProps {
  validation: Validation
  onClose: () => void
  onRepeat: (lines: RepeatLine[]) => void
}

/**
 * Hosts the checkout DeliveryPanel (customer lookup / repeat last order, address, zone, driver).
 * Its customer_* fields go on the order (store), the rest is the order's `delivery` draft.
 */
export function DeliverySheet({ validation, onClose, onRepeat }: DeliverySheetProps) {
  const { t } = useTranslation()
  const phone = useOrderStore((s) => s.customerPhone)
  const name = useOrderStore((s) => s.customerName)
  const delivery = useOrderStore((s) => s.delivery)
  const platform = useOrderStore((s) => s.channel !== null)
  const subtotal = useOrderStore((s) => {
    const totals = cartTotals(s)
    return Math.max(0, totals.subtotal - totals.discount)
  })

  const value = useMemo<DeliveryDraft>(
    () => ({ ...(delivery ?? {}), customer_phone: phone || undefined, customer_name: name || undefined }),
    [delivery, phone, name]
  )

  const onChange = (next: DeliveryDraft | null): void => {
    const store = useOrderStore.getState()
    store.setCustomerPhone(next?.customer_phone ?? '')
    store.setCustomerName(next?.customer_name ?? '')
    store.setDelivery(next, deliveryFeeFor(next))
  }

  const phoneMissing = !platform && !phone.trim()
  const message = validation === 'phone' && phoneMissing
    ? t('orders.phoneRequired')
    : validation === 'address' ? t('pos.delivery.addressRequired') : null

  return (
    <Modal
      isOpen
      onClose={onClose}
      size="2xl"
      title={t('pos.delivery.title')}
      footer={<Button size="xl" onClick={onClose} className="min-w-40">{t('pos.delivery.done')}</Button>}
    >
      {message && (
        <p role="alert" className="mb-4 flex items-center gap-2 rounded-xl bg-danger-soft px-3 py-2.5 text-sm font-semibold text-danger-ink pos-shake">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {message}
        </p>
      )}
      <DeliveryPanel value={value} onChange={onChange} subtotal={subtotal} onRepeatOrder={onRepeat} />
    </Modal>
  )
}
