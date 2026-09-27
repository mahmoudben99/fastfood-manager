import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Bike, MapPin, MapPinned, StickyNote, User, UserRound } from 'lucide-react'
import { CUSTOMER_CONSENT_VERSION } from '../../../../shared/customer-lookup'
import type { CustomerAddress, DeliveryZone } from '../../../../shared/delivery'
import { Skeleton, toast } from '../ui'
import type { CustomerPick, DeliveryDraft, DeliveryPanelProps } from './contracts'
import { CustomerLookup } from './CustomerLookup'
import { DriverPicker, MinOrderWarning, SaveAddressBlock, SavedAddresses, SectionTitle, ZonePicker } from './DeliveryParts'
import { errorText } from './methods'
import { belowMinimum, withoutUndefined } from './tender'
import { useTouchKeyboard } from './useTouchKeyboard'

type Driver = { id: number; name: string; phone: string | null }

// Zones and drivers rarely change during a service: reuse the last list, refresh in the background.
let cachedZones: DeliveryZone[] | null = null
let cachedDrivers: Driver[] | null = null

const fieldClass =
  'w-full rounded-xl border border-line-strong bg-surface dark:bg-surface-2 px-3.5 text-base text-ink placeholder:text-faint ' +
  'focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/15'

/**
 * Delivery details for the order screen: customer (lookup by phone/name, name), saved or new
 * address, zone (fee / minimum / ETA, BELOW_MIN_ORDER feedback against `subtotal`), driver, notes.
 * An address is only kept for next time with the customer's recorded consent (law 18-07).
 * `value.fee` mirrors the chosen zone's fee so the order screen can show the total.
 */
export function DeliveryPanel({ value, onChange, subtotal, onRepeatOrder }: DeliveryPanelProps) {
  const { t } = useTranslation()
  const kb = useTouchKeyboard()
  const [zones, setZones] = useState<DeliveryZone[] | null>(cachedZones)
  const [drivers, setDrivers] = useState<Driver[] | null>(cachedDrivers)
  const [customer, setCustomer] = useState<CustomerPick | null>(null)
  const [addresses, setAddresses] = useState<CustomerAddress[]>([])
  const [consentAt, setConsentAt] = useState<string | null>(null)
  const [wantSave, setWantSave] = useState(false)
  const [consentBusy, setConsentBusy] = useState(false)

  const draft: DeliveryDraft = value ?? {}
  // Async results (consent, addresses) patch the LATEST value, not the one of an older render.
  const latest = useRef(draft)
  latest.current = draft
  const update = (patch: Partial<DeliveryDraft>): void => {
    const next = withoutUndefined({ ...latest.current, ...patch })
    latest.current = next
    onChange(next)
  }

  useEffect(() => {
    let alive = true
    Promise.all([window.api.delivery.getZones(), window.api.delivery.getDrivers()])
      .then(([zoneList, driverList]) => {
        if (!alive) return
        cachedZones = zoneList
        cachedDrivers = driverList
        setZones(zoneList)
        setDrivers(driverList)
      })
      .catch((error) => {
        if (!alive) return
        setZones((current) => current ?? [])
        setDrivers((current) => current ?? [])
        toast.error(t('checkout.delivery.loadError'), { description: errorText(error, '') })
      })
    return () => {
      alive = false
    }
  }, [t])

  const zone = useMemo(() => zones?.find((entry) => entry.id === draft.zone_id) ?? null, [zones, draft.zone_id])
  const missing = zone ? belowMinimum(subtotal, zone.min_order) : 0

  const selectCustomer = (pick: CustomerPick): void => {
    setCustomer(pick)
    setConsentAt(pick.consent_at ?? null)
    setWantSave(false)
    setAddresses([])
    update({
      customer_phone: pick.phone,
      customer_name: pick.name ?? draft.customer_name ?? undefined,
      address_id: undefined,
      save_address: undefined
    })
    if (pick.id && pick.consent_at) {
      window.api.delivery.getAddresses(pick.id).then(setAddresses).catch(() => setAddresses([]))
    }
  }
  const clearCustomer = (): void => {
    setCustomer(null)
    setAddresses([])
    setConsentAt(null)
    setWantSave(false)
    update({ customer_phone: undefined, customer_name: undefined, address_id: undefined, save_address: undefined })
  }

  const pickZone = (next: DeliveryZone | null): void =>
    update({ zone_id: next?.id, fee: next ? next.fee : undefined, ignore_min_order: undefined })

  const pickAddress = (address: CustomerAddress): void => {
    const savedZone = zones?.find((entry) => entry.id === address.zone_id && entry.is_active === 1)
    update({
      address_id: address.id,
      address: undefined,
      save_address: undefined,
      ...(savedZone ? { zone_id: savedZone.id, fee: savedZone.fee, ignore_min_order: undefined } : {})
    })
  }

  const recordConsent = async (): Promise<void> => {
    if (!draft.customer_phone) return
    setConsentBusy(true)
    try {
      const record = await window.api.customers.recordConsent({
        customer_id: customer?.id,
        phone: customer?.id ? undefined : draft.customer_phone,
        name: latest.current.customer_name ?? null,
        version: CUSTOMER_CONSENT_VERSION
      })
      setConsentAt(record.consent_at)
      setCustomer((current) => ({ ...(current ?? { phone: record.phone }), id: record.id, consent_at: record.consent_at }))
      update({ save_address: true })
    } catch (error) {
      toast.error(t('checkout.delivery.consentError'), { description: errorText(error, '') })
    } finally {
      setConsentBusy(false)
    }
  }

  const wantsSaving = (next: boolean): void => {
    setWantSave(next)
    if (consentAt) update({ save_address: next || undefined })
    else if (!next) update({ save_address: undefined })
  }

  const usingSaved = Boolean(draft.address_id)
  const canSave = Boolean(draft.customer_phone) && !usingSaved && Boolean(draft.address?.trim())

  return (
    <div className="@container" data-testid="delivery-panel">
      <div className="grid gap-5 @3xl:grid-cols-2">
        <div className="@container space-y-5 min-w-0">
          <section>
            <SectionTitle icon={<User />}>{t('checkout.delivery.customer')}</SectionTitle>
            <CustomerLookup
              phone={draft.customer_phone ?? undefined}
              onSelect={selectCustomer}
              onClear={clearCustomer}
              onRepeatOrder={onRepeatOrder}
            />
            {draft.customer_phone && (
              <div className="relative mt-2">
                <UserRound className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-faint" />
                <input
                  data-ui="input"
                  aria-label={t('checkout.delivery.name')}
                  placeholder={t('checkout.delivery.name')}
                  maxLength={80}
                  className={`${fieldClass} min-h-12 ps-11`}
                  {...kb.field('customer-name', draft.customer_name ?? '', (name) => update({ customer_name: name || undefined }))}
                />
              </div>
            )}
          </section>

          <section>
            <SectionTitle icon={<MapPin />}>{t('checkout.delivery.address')}</SectionTitle>
            {addresses.length > 0 && (
              <SavedAddresses
                addresses={addresses}
                zones={zones ?? []}
                value={draft.address_id}
                onPick={pickAddress}
                onNew={() => update({ address_id: undefined })}
              />
            )}
            {!usingSaved && (
              <textarea
                data-ui="input"
                rows={2}
                maxLength={300}
                aria-label={t('checkout.delivery.addressPlaceholder')}
                placeholder={t('checkout.delivery.addressPlaceholder')}
                className={`${fieldClass} py-2.5 min-h-20 resize-none`}
                {...kb.field('address', draft.address ?? '', (address) => update({ address: address || undefined }))}
              />
            )}
            {canSave && (
              <SaveAddressBlock
                consentAt={consentAt}
                save={Boolean(draft.save_address)}
                wantSave={wantSave}
                onWantSave={wantsSaving}
                onConsent={recordConsent}
                busy={consentBusy}
              />
            )}
          </section>
        </div>

        <div className="@container space-y-5 min-w-0">
          <section>
            <SectionTitle icon={<MapPinned />}>{t('checkout.delivery.zone')}</SectionTitle>
            {zones === null ? (
              <div className="grid grid-cols-2 gap-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-18 rounded-xl" />)}</div>
            ) : zones.length === 0 ? (
              <p className="text-sm text-muted rounded-xl bg-surface-2 px-3 py-3">{t('checkout.delivery.noZones')}</p>
            ) : (
              <ZonePicker zones={zones} value={draft.zone_id} onChange={pickZone} />
            )}
            {zone && missing > 0 && (
              <MinOrderWarning
                zone={zone}
                missing={missing}
                accepted={Boolean(draft.ignore_min_order)}
                onAccept={(accepted) => update({ ignore_min_order: accepted || undefined })}
              />
            )}
          </section>

          <section>
            <SectionTitle icon={<Bike />}>{t('checkout.delivery.driver')}</SectionTitle>
            {drivers === null ? (
              <Skeleton className="h-12 w-2/3 rounded-full" />
            ) : (
              <DriverPicker drivers={drivers} value={draft.driver_id} onChange={(driverId) => update({ driver_id: driverId ?? undefined })} />
            )}
          </section>

          <section>
            <SectionTitle icon={<StickyNote />}>{t('checkout.delivery.notes')}</SectionTitle>
            <textarea
              data-ui="input"
              rows={2}
              maxLength={300}
              aria-label={t('checkout.delivery.notes')}
              placeholder={t('checkout.delivery.notesPlaceholder')}
              className={`${fieldClass} py-2.5 min-h-16 resize-none`}
              {...kb.field('notes', draft.notes ?? '', (notes) => update({ notes: notes || undefined }))}
            />
          </section>
        </div>
      </div>
      {kb.keyboard}
    </div>
  )
}
