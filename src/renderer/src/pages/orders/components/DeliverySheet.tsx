import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Phone, User } from 'lucide-react'
import type { DeliveryZone } from '../../../../../shared/delivery'
import { CustomerLookup, DeliveryPanel, type DeliveryDraft, type RepeatLine } from '../../../components/checkout'
import { Button, Modal, cn } from '../../../components/ui'
import { cartTotals, useOrderStore } from '../../../store/orderStore'
import type { Validation } from '../hooks/useCheckout'
import { useTouchField } from '../touchKeyboard'

/** Fee the order will carry: an explicit fee, else the zone's fee. */
export function deliveryFeeFor(draft: DeliveryDraft | null, zones: DeliveryZone[]): number {
  if (!draft) return 0
  if (draft.fee !== undefined && draft.fee !== null && Number.isFinite(Number(draft.fee))) return Math.max(0, Number(draft.fee))
  const zone = zones.find((z) => z.id === draft.zone_id)
  return zone ? zone.fee : 0
}

interface DeliverySheetProps {
  validation: Validation
  onClose: () => void
  onRepeat: (lines: RepeatLine[]) => void
}

/** Phone orders: phone (required) + customer lookup / repeat last order + address, zone, driver, fee. */
export function DeliverySheet({ validation, onClose, onRepeat }: DeliverySheetProps) {
  const { t } = useTranslation()
  const phone = useOrderStore((s) => s.customerPhone)
  const name = useOrderStore((s) => s.customerName)
  const delivery = useOrderStore((s) => s.delivery)
  const [zones, setZones] = useState<DeliveryZone[]>([])
  const [phoneError, setPhoneError] = useState(validation === 'phone')
  const setPhone = (v: string): void => {
    useOrderStore.getState().setCustomerPhone(v)
    if (v.trim()) setPhoneError(false)
  }
  const setName = (v: string): void => useOrderStore.getState().setCustomerName(v)
  const phoneField = useTouchField(phone, setPhone, 'numeric')
  const nameField = useTouchField(name, setName, 'text')

  useEffect(() => {
    window.api.delivery?.getZones?.().then((z) => setZones(z || [])).catch(() => setZones([]))
  }, [])

  const subtotalAfterDiscount = useOrderStore((s) => {
    const totals = cartTotals(s)
    return Math.max(0, totals.subtotal - totals.discount)
  })

  const value = useMemo<DeliveryDraft>(() => ({ ...(delivery ?? {}), customer_phone: phone || null, customer_name: name || null }), [delivery, phone, name])

  const onPanelChange = (next: DeliveryDraft | null): void => {
    const store = useOrderStore.getState()
    if (next?.customer_phone !== undefined && next.customer_phone !== null && next.customer_phone !== store.customerPhone) setPhone(next.customer_phone)
    if (next?.customer_name !== undefined && next.customer_name !== null && next.customer_name !== store.customerName) setName(next.customer_name)
    store.setDelivery(next, deliveryFeeFor(next, zones))
  }

  const done = (): void => {
    if (useOrderStore.getState().channel === null && !useOrderStore.getState().customerPhone.trim()) {
      setPhoneError(true)
      return
    }
    // Zones may have loaded after the last edit: settle the fee once more.
    const store = useOrderStore.getState()
    if (store.delivery) store.setDelivery(store.delivery, deliveryFeeFor(store.delivery, zones))
    onClose()
  }

  const inputClass = (error: boolean): string => cn(
    'w-full h-12 rounded-xl border bg-surface ps-11 pe-3 text-base text-ink placeholder:text-faint focus:outline-none focus:ring-4',
    error ? 'border-danger bg-danger-soft focus:ring-danger/20 pos-shake' : 'border-line-strong focus:border-primary focus:ring-primary/15'
  )

  return (
    <Modal
      isOpen
      onClose={onClose}
      size="lg"
      title={t('pos.delivery.title')}
      footer={<Button size="xl" onClick={done} className="min-w-40">{t('pos.delivery.done')}</Button>}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="pos-phone" className="block pb-1.5 text-sm font-semibold text-ink-2">{t('pos.delivery.phone')}</label>
          <div className="relative">
            <Phone className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-faint" />
            <input id="pos-phone" type="tel" dir="ltr" data-ui="input" autoFocus={!phoneField.readOnly} {...phoneField} placeholder="05 55 00 00 00" className={cn(inputClass(phoneError), 'num text-start')} />
          </div>
          {phoneError && <p className="pt-1 text-xs font-semibold text-danger-ink">{t('orders.phoneRequired')}</p>}
        </div>
        <div>
          <label htmlFor="pos-name" className="block pb-1.5 text-sm font-semibold text-ink-2">{t('pos.delivery.name')}</label>
          <div className="relative">
            <User className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-faint" />
            <input id="pos-name" data-ui="input" {...nameField} className={inputClass(false)} />
          </div>
        </div>
      </div>

      <div className="pt-3">
        <CustomerLookup
          phone={phone}
          onSelect={(c) => {
            setPhone(c.phone)
            if (c.name) setName(c.name)
          }}
          onRepeatOrder={onRepeat}
        />
      </div>

      <div className={cn('mt-4 pt-4 border-t border-line', validation === 'address' && 'rounded-xl ring-2 ring-danger ring-offset-4 ring-offset-surface')}>
        <p className="pb-2 text-sm font-semibold text-ink-2">{t('pos.delivery.address')}</p>
        <DeliveryPanel value={value} onChange={onPanelChange} subtotal={subtotalAfterDiscount} />
        {validation === 'address' && <p className="pt-1.5 text-xs font-semibold text-danger-ink">{t('pos.delivery.addressRequired')}</p>}
      </div>
    </Modal>
  )
}
