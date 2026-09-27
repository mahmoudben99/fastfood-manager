import { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Bike, Clock, MapPin, StickyNote, Wallet } from 'lucide-react'
import { Money, cn } from '../../../components/ui'
import type { DeliveryStatus, OrderDelivery } from '../../../../../shared/delivery'
import { DetailSection, formatClock } from './labels'

function Field({ icon, label, children, wide }: { icon: ReactNode; label: ReactNode; children: ReactNode; wide?: boolean }) {
  return (
    <div className={cn('flex items-start gap-2.5', wide && 'sm:col-span-2')}>
      <span className="mt-0.5 text-muted [&_svg]:h-4 [&_svg]:w-4">{icon}</span>
      <div className="min-w-0">
        <p className="text-xs font-medium text-muted">{label}</p>
        <div className="text-sm font-semibold text-ink break-words">{children}</div>
      </div>
    </div>
  )
}

type Step = { status: DeliveryStatus; at: string | null }

function timeline(d: OrderDelivery): Step[] {
  const steps: Step[] = [
    { status: 'pending', at: d.created_at },
    { status: 'preparing', at: d.preparing_at },
    { status: 'out_for_delivery', at: d.out_for_delivery_at }
  ]
  steps.push(d.status === 'failed' ? { status: 'failed', at: d.failed_at } : { status: 'delivered', at: d.delivered_at })
  return steps
}

/** Address, zone, fee, driver and the delivery status timeline. */
export function DeliveryInfo({ delivery, fee }: { delivery: OrderDelivery | null; fee: number }) {
  const { t } = useTranslation()
  const steps = delivery ? timeline(delivery) : []
  const current = delivery ? steps.findIndex((s) => s.status === delivery.status) : -1

  return (
    <DetailSection icon={<Bike />} title={t('orderHistory.delivery.title')}>
      {!delivery ? (
        <p className="text-sm text-muted">{t('orderHistory.delivery.none')}</p>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field icon={<MapPin />} label={t('orderHistory.delivery.address')} wide>
              <bdi>{delivery.address}</bdi>
            </Field>
            {delivery.zone_name && (
              <Field icon={<MapPin />} label={t('orderHistory.delivery.zone')}>
                <bdi>{delivery.zone_name}</bdi>
                {delivery.estimated_minutes ? (
                  <span className="ms-1.5 text-xs font-medium text-muted">
                    {t('orderHistory.delivery.eta', { min: delivery.estimated_minutes })}
                  </span>
                ) : null}
              </Field>
            )}
            <Field icon={<Wallet />} label={t('orderHistory.delivery.fee')}>
              <Money value={fee} />
            </Field>
            <Field icon={<Bike />} label={t('orderHistory.delivery.driver')}>
              {delivery.driver_name ? (
                <bdi>{delivery.driver_name}</bdi>
              ) : (
                <span className="font-medium text-muted">{t('orderHistory.delivery.noDriver')}</span>
              )}
            </Field>
            {delivery.notes && (
              <Field icon={<StickyNote />} label={t('orderHistory.delivery.notes')} wide>
                <span className="font-medium">{delivery.notes}</span>
              </Field>
            )}
          </div>

          <ol className="relative space-y-3 ps-6" aria-label={t('orderHistory.col.status')}>
            <span className="absolute inset-y-1.5 start-[7px] w-0.5 rounded-full bg-line" aria-hidden="true" />
            {steps.map((step, i) => {
              const done = i <= current && (step.at || i === 0)
              const isCurrent = i === current
              const failed = step.status === 'failed'
              return (
                <li key={step.status} className="relative flex items-center justify-between gap-3">
                  <span
                    className={cn(
                      'absolute -start-6 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full border-2',
                      failed
                        ? 'border-danger bg-danger'
                        : isCurrent
                          ? 'border-primary bg-primary ring-4 ring-primary-soft'
                          : done
                            ? 'border-success bg-success'
                            : 'border-line-strong bg-surface'
                    )}
                    aria-hidden="true"
                  />
                  <span
                    className={cn(
                      'text-sm',
                      failed ? 'font-bold text-danger-ink' : isCurrent ? 'font-bold text-ink' : done ? 'font-medium text-ink-2' : 'text-muted'
                    )}
                  >
                    {t(`orderHistory.delivery.status.${step.status}`)}
                  </span>
                  {step.at && i <= current && (
                    <span className="num flex items-center gap-1 text-xs text-muted">
                      <Clock className="h-3.5 w-3.5" />
                      {formatClock(step.at)}
                    </span>
                  )}
                </li>
              )
            })}
          </ol>
          {delivery.status === 'failed' && delivery.failure_reason && (
            <p className="rounded-xl bg-danger-soft p-3 text-sm font-medium text-danger-ink">
              {t('orderHistory.delivery.reason', { reason: delivery.failure_reason })}
            </p>
          )}
        </div>
      )}
    </DetailSection>
  )
}
