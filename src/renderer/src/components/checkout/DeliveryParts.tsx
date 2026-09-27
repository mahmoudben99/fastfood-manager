import { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, Bike, Check, Clock, Home, MapPin, ShieldCheck } from 'lucide-react'
import type { CustomerAddress, DeliveryZone } from '../../../../shared/delivery'
import { Money, Toggle, cn } from '../ui'
import { relativeDay, shortDate } from './format'

export function SectionTitle({ icon, children, aside }: { icon: ReactNode; children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 mb-2">
      <h4 className="flex items-center gap-2 text-sm font-bold text-ink-2 [&_svg]:h-4 [&_svg]:w-4 [&_svg]:text-muted">
        {icon}
        {children}
      </h4>
      {aside}
    </div>
  )
}

/** Delivery zones as tappable cards: fee, minimum order, ETA. Tap the selected one again to clear. */
export function ZonePicker({ zones, value, onChange }: { zones: DeliveryZone[]; value: number | null | undefined; onChange: (zone: DeliveryZone | null) => void }) {
  const { t } = useTranslation()
  return (
    <div role="radiogroup" aria-label={t('checkout.delivery.zone')} className="grid gap-2 grid-cols-2 @lg:grid-cols-3" data-testid="zone-picker">
      {zones.map((zone) => {
        const active = zone.id === value
        return (
          <button
            key={zone.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(active ? null : zone)}
            className={cn(
              'tap relative min-h-18 rounded-xl border-2 p-2.5 text-start',
              active ? 'border-primary bg-primary-soft' : 'border-line bg-surface hover:bg-surface-2 dark:bg-surface-2 dark:hover:bg-surface-3'
            )}
          >
            {active && <Check className="absolute top-2 end-2 h-4 w-4 text-primary-ink" />}
            <span className={cn('block pe-5 text-sm font-bold leading-snug line-clamp-2 break-words', active ? 'text-primary-ink' : 'text-ink')}>{zone.name}</span>
            <span className="block text-base font-extrabold text-ink mt-0.5">
              {zone.fee > 0 ? <Money value={zone.fee} decimals={0} /> : t('checkout.delivery.free')}
            </span>
            <span className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-muted">
              {zone.min_order ? <span>{t('checkout.delivery.min')} <Money value={zone.min_order} decimals={0} styledSymbol={false} /></span> : null}
              {zone.estimated_minutes ? (
                <span className="inline-flex items-center gap-0.5"><Clock className="h-3 w-3" /><bdi dir="ltr">~{zone.estimated_minutes}</bdi> {t('checkout.delivery.minutes')}</span>
              ) : null}
            </span>
          </button>
        )
      })}
    </div>
  )
}

/** Short DA the order is below a zone minimum, with an explicit "accept anyway". */
export function MinOrderWarning({ zone, missing, accepted, onAccept }: {
  zone: DeliveryZone
  missing: number
  accepted: boolean
  onAccept: (accepted: boolean) => void
}) {
  const { t } = useTranslation()
  return (
    <div role="alert" className={cn('mt-2 rounded-xl px-3 py-2 border', accepted ? 'bg-surface-2 border-line' : 'bg-warning-soft border-warning/40')} data-testid="min-order">
      <p className="flex items-start gap-2 text-sm font-semibold text-warning-ink">
        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
        <span>
          {t('checkout.delivery.min')} <Money value={zone.min_order ?? 0} decimals={0} /> · {t('checkout.delivery.missing')}{' '}
          <Money value={missing} decimals={0} />
        </span>
      </p>
      <Toggle size="md" checked={accepted} onChange={onAccept} label={t('checkout.delivery.acceptBelowMin')} className="mt-1" />
    </div>
  )
}

/** Drivers (workers with role 'driver') + "assign later". */
export function DriverPicker({ drivers, value, onChange }: {
  drivers: { id: number; name: string }[]
  value: number | null | undefined
  onChange: (driverId: number | null) => void
}) {
  const { t } = useTranslation()
  if (drivers.length === 0) return <p className="text-sm text-muted">{t('checkout.delivery.noDrivers')}</p>
  const chip = (active: boolean): string =>
    cn(
      'tap min-h-12 px-4 rounded-full border-2 text-sm font-semibold inline-flex items-center gap-2',
      active ? 'border-primary bg-primary-soft text-primary-ink' : 'border-line bg-surface text-ink-2 hover:bg-surface-2 dark:bg-surface-2'
    )
  return (
    <div role="radiogroup" aria-label={t('checkout.delivery.driver')} className="flex flex-wrap gap-2">
      <button type="button" role="radio" aria-checked={!value} onClick={() => onChange(null)} className={chip(!value)}>
        {t('checkout.delivery.assignLater')}
      </button>
      {drivers.map((driver) => (
        <button key={driver.id} type="button" role="radio" aria-checked={value === driver.id} onClick={() => onChange(driver.id)} className={chip(value === driver.id)}>
          <Bike className="h-4 w-4" />
          {driver.name}
        </button>
      ))}
    </div>
  )
}

/** Saved addresses of the customer (only kept with consent) + "new address". */
export function SavedAddresses({ addresses, zones, value, onPick, onNew }: {
  addresses: CustomerAddress[]
  zones: DeliveryZone[]
  value: number | null | undefined
  onPick: (address: CustomerAddress) => void
  onNew: () => void
}) {
  const { t, i18n } = useTranslation()
  const zoneName = (id: number | null): string | undefined => zones.find((zone) => zone.id === id)?.name
  const card = (active: boolean): string =>
    cn(
      'tap w-full min-h-14 rounded-xl border-2 px-3 py-2 text-start flex items-start gap-2.5',
      active ? 'border-primary bg-primary-soft' : 'border-line bg-surface hover:bg-surface-2 dark:bg-surface-2 dark:hover:bg-surface-3'
    )
  return (
    <div role="radiogroup" aria-label={t('checkout.delivery.savedAddresses')} className="grid gap-2 mb-2" data-testid="saved-addresses">
      {addresses.map((address) => (
        <button key={address.id} type="button" role="radio" aria-checked={value === address.id} onClick={() => onPick(address)} className={card(value === address.id)}>
          <Home className={cn('h-4 w-4 mt-1 shrink-0', value === address.id ? 'text-primary-ink' : 'text-muted')} />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-ink line-clamp-2">{address.label ? `${address.label} · ` : ''}{address.address}</span>
            <span className="block text-xs text-muted">
              {[zoneName(address.zone_id), address.last_used_at ? relativeDay(address.last_used_at, i18n.language) : null].filter(Boolean).join(' · ')}
            </span>
          </span>
        </button>
      ))}
      <button type="button" role="radio" aria-checked={!value} onClick={onNew} className={card(!value)}>
        <MapPin className={cn('h-4 w-4 mt-0.5 shrink-0', !value ? 'text-primary-ink' : 'text-muted')} />
        <span className="text-sm font-semibold text-ink">{t('checkout.delivery.newAddress')}</span>
      </button>
    </div>
  )
}

/**
 * "Save this address" — only with the customer's consent (law 18-07 on personal data). Without
 * consent on file, ticking the consent box records it (customers.recordConsent) first.
 */
export function SaveAddressBlock({ consentAt, save, wantSave, onWantSave, onConsent, busy }: {
  consentAt: string | null
  save: boolean
  wantSave: boolean
  onWantSave: (value: boolean) => void
  onConsent: () => void
  busy: boolean
}) {
  const { t, i18n } = useTranslation()
  return (
    <div className="mt-2 rounded-xl border border-line bg-surface-2 px-3 py-1.5" data-testid="save-address">
      <Toggle
        size="md"
        checked={consentAt ? save : wantSave}
        onChange={onWantSave}
        label={t('checkout.delivery.saveAddress')}
        description={consentAt ? t('checkout.delivery.consentOnFile', { date: shortDate(consentAt, i18n.language) }) : undefined}
      />
      {!consentAt && wantSave && (
        <label className={cn('flex items-start gap-3 rounded-lg bg-surface p-3 mb-1.5 border border-line-strong cursor-pointer', busy && 'opacity-60')}>
          <input
            type="checkbox"
            className="mt-0.5 h-6 w-6 shrink-0 accent-[var(--primary)]"
            checked={false}
            disabled={busy}
            onChange={onConsent}
            data-testid="consent-checkbox"
          />
          <span className="text-sm text-ink">
            <span className="flex items-center gap-1.5 font-bold"><ShieldCheck className="h-4 w-4 text-primary-ink" />{t('checkout.delivery.consentTitle')}</span>
            <span className="block text-ink-2 mt-0.5">{t('checkout.delivery.consentText')}</span>
          </span>
        </label>
      )}
    </div>
  )
}
