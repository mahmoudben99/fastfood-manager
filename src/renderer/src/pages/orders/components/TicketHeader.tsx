import { useTranslation } from 'react-i18next'
import { Bike, ChevronRight, Hash, MapPin, Pencil, Percent, ShoppingBag, StickyNote, Trash2, UtensilsCrossed, X } from 'lucide-react'
import { IconButton, SegmentedControl, cn } from '../../../components/ui'
import { useShallow } from 'zustand/react/shallow'
import { useOrderStore, type OrderType } from '../../../store/orderStore'
import type { Validation } from '../hooks/useCheckout'
import { useDeliveryPlatforms } from '../hooks/useChannels'
import { useTouchField } from '../touchKeyboard'

interface TicketHeaderProps {
  count: number
  validation: Validation
  onOpenNote: () => void
  onOpenDiscount: () => void
  onOpenDelivery: () => void
  onClear: () => void
}

/** Ticket title + actions, order type, and the one field the type needs (table / delivery details). */
export function TicketHeader({ count, validation, onOpenNote, onOpenDiscount, onOpenDelivery, onClear }: TicketHeaderProps) {
  const { t } = useTranslation()
  const s = useOrderStore(useShallow((st) => ({
    orderType: st.orderType,
    tableNumber: st.tableNumber,
    notes: st.notes,
    phone: st.customerPhone,
    name: st.customerName,
    address: st.delivery?.address ?? '',
    editingNumber: st.editingOrderId ? st.editingOrderDailyNumber ?? st.editingOrderId : null,
    hasManualDiscount: st.manualDiscount !== null,
    channel: st.channel,
    setOrderType: st.setOrderType,
    setChannel: st.setChannel,
    setTableNumber: st.setTableNumber
  })))
  const tableField = useTouchField(s.tableNumber, s.setTableNumber, 'numeric')
  const tableError = validation === 'table'
  const platforms = useDeliveryPlatforms()

  return (
    <div className="shrink-0">
      <div className="flex items-center gap-2 pt-1 pb-2.5">
        <div className="min-w-0 flex-1">
          {s.editingNumber !== null ? (
            <p className="flex items-center gap-1.5 text-base font-extrabold text-primary-ink truncate">
              <Pencil className="h-4 w-4 shrink-0" />
              {t('pos.ticket.editing', { number: s.editingNumber })}
            </p>
          ) : (
            <p className="text-base font-extrabold text-ink truncate">{t('pos.ticket.title')}</p>
          )}
          <p className="text-xs font-semibold text-muted">{t('pos.itemsCount', { count })}</p>
        </div>
        <IconButton icon={<StickyNote />} label={t('pos.ticket.note')} variant={s.notes ? 'soft' : 'ghost'} onClick={onOpenNote} />
        {s.editingNumber === null && (
          <IconButton icon={<Percent />} label={t('pos.discount.title')} variant={s.hasManualDiscount ? 'soft' : 'ghost'} onClick={onOpenDiscount} />
        )}
        <IconButton
          icon={s.editingNumber !== null ? <X /> : <Trash2 />}
          label={s.editingNumber !== null ? t('pos.ticket.cancelEdit') : t('pos.ticket.clear')}
          variant="danger"
          disabled={count === 0 && s.editingNumber === null}
          onClick={onClear}
        />
      </div>

      <SegmentedControl<OrderType>
        fullWidth
        size="lg"
        ariaLabel={t('pos.type.label')}
        value={s.orderType}
        onChange={s.setOrderType}
        className="[&_[role=radio]]:py-1.5"
        options={([
          ['local', <UtensilsCrossed key="i" />],
          ['takeout', <ShoppingBag key="i" />],
          ['delivery', <Bike key="i" />]
        ] as const).map(([value, icon]) => ({
          value,
          label: (
            <span className="flex flex-col items-center gap-0.5 leading-tight">
              {icon}
              <span className="text-[0.8125rem]">{t(`pos.type.${value}`)}</span>
            </span>
          )
        }))}
      />

      {s.orderType === 'local' && (
        <div className="mt-2.5">
          <div className="relative">
            <Hash className={cn('pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 h-5 w-5', tableError ? 'text-danger-ink' : 'text-faint')} />
            <input
              {...tableField}
              data-ui="input"
              inputMode="numeric"
              aria-label={t('pos.ticket.table')}
              aria-invalid={tableError || undefined}
              placeholder={t('pos.ticket.tablePlaceholder')}
              className={cn(
                'w-full h-11 rounded-xl border bg-surface ps-11 pe-3 text-base font-semibold text-ink placeholder:font-normal placeholder:text-faint',
                'focus:outline-none focus:ring-4',
                tableError ? 'border-danger bg-danger-soft focus:ring-danger/20 pos-shake' : 'border-line-strong focus:border-primary focus:ring-primary/15',
                tableField.readOnly && 'cursor-pointer'
              )}
            />
          </div>
          {tableError && <p className="mt-1 text-xs font-semibold text-danger-ink">{t('pos.ticket.tableRequired')}</p>}
        </div>
      )}

      {s.orderType === 'delivery' && (
        <button
          type="button"
          onClick={onOpenDelivery}
          className={cn(
            'tap mt-2.5 w-full min-h-12 rounded-xl border px-3 py-2 flex items-center gap-3 text-start',
            validation === 'phone' || validation === 'address'
              ? 'border-danger bg-danger-soft pos-shake'
              : s.phone ? 'border-line bg-surface-2 hover:bg-surface-3' : 'border-dashed border-line-strong hover:bg-surface-2'
          )}
        >
          <MapPin className={cn('h-5 w-5 shrink-0', s.phone ? 'text-primary-ink' : 'text-muted')} />
          <span className="min-w-0 flex-1">
            {s.phone ? (
              <>
                <span className="block text-sm font-bold text-ink truncate">
                  <bdi dir="ltr" className="num">{s.phone}</bdi>{s.name ? ` · ${s.name}` : ''}
                </span>
                <span className="block text-xs text-muted truncate">{s.address || t('pos.delivery.noAddress')}</span>
              </>
            ) : (
              <span className="block text-sm font-semibold text-ink-2">{t('pos.delivery.add')}</span>
            )}
          </span>
          <ChevronRight className="h-4 w-4 text-faint shrink-0 rtl:-scale-x-100" />
        </button>
      )}

      {s.orderType === 'delivery' && platforms.length > 0 && (
        <div role="radiogroup" aria-label={t('pos.channel.label')} className="mt-2 flex gap-1.5 overflow-x-auto no-scrollbar">
          {[{ id: null as string | null, label: t('pos.channel.direct') }, ...platforms.map((p) => ({ id: p.id as string | null, label: p.label || t(`channels.names.${p.id}`, { defaultValue: p.id === 'yassir' ? 'Yassir' : p.id }) }))].map((option) => {
            const active = s.channel === option.id
            return (
              <button
                key={option.id ?? 'direct'}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => s.setChannel(option.id)}
                className={cn(
                  'tap shrink-0 h-10 px-3.5 rounded-full border text-sm font-semibold',
                  active ? 'bg-inverse text-on-inverse border-transparent' : 'bg-surface border-line-strong text-ink-2 hover:bg-surface-2'
                )}
              >
                {option.label}
              </button>
            )
          })}
        </div>
      )}

      {s.notes && (
        <button type="button" onClick={onOpenNote} className="tap mt-2 w-full flex items-start gap-2 rounded-lg px-2 py-1.5 bg-surface-2 text-start">
          <StickyNote className="h-4 w-4 mt-0.5 shrink-0 text-muted" />
          <span className="text-[0.8125rem] italic text-ink-2 line-clamp-2">{s.notes}</span>
        </button>
      )}
    </div>
  )
}
