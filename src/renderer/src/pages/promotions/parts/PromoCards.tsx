import { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Pencil, Percent, Tag, Trash2 } from 'lucide-react'
import { Badge, IconButton, Money, Toggle, cn, formatAmount } from '../../../components/ui'
import { useAppStore } from '../../../store/appStore'
import { localName, packIndividualTotal, type MenuItemLite, type Pack, type Promo } from './promoTypes'

interface CardShellProps {
  active: boolean
  name: string
  tile: ReactNode
  aside?: ReactNode
  children?: ReactNode
  onToggle: () => void
  onEdit: () => void
  onDelete: () => void
}

/** Shared tile: icon, name, body, then Active toggle + edit/delete (always visible: touch). */
function CardShell({ active, name, tile, aside, children, onToggle, onEdit, onDelete }: CardShellProps) {
  const { t } = useTranslation()
  return (
    <div
      className={cn(
        'flex flex-col gap-3 rounded-2xl border p-4 contain-card',
        active ? 'border-line bg-surface shadow-e1' : 'border-dashed border-line-strong bg-surface-2'
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            'flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-2xl [&_svg]:h-6 [&_svg]:w-6',
            active ? 'bg-primary-soft text-primary-ink' : 'bg-surface-3 text-muted'
          )}
        >
          {tile}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className={cn('truncate text-base font-semibold', active ? 'text-ink' : 'text-ink-2')}>
            <bdi>{name}</bdi>
          </h3>
        </div>
        {aside}
      </div>
      {children}
      <div className="mt-auto flex items-center gap-1 border-t border-line pt-3">
        <Toggle
          size="md"
          className="flex-1 pe-2"
          checked={active}
          onChange={onToggle}
          label={
            <span className={cn('inline-flex items-center gap-2', active ? 'text-success-ink' : 'text-muted')}>
              <span className={cn('h-2 w-2 rounded-full', active ? 'bg-success' : 'bg-faint')} aria-hidden="true" />
              {active ? t('promotions.status.active') : t('promotions.status.paused')}
            </span>
          }
        />
        <IconButton icon={<Pencil />} label={t('common.edit')} onClick={onEdit} />
        <IconButton icon={<Trash2 />} label={t('common.delete')} variant="danger" onClick={onDelete} />
      </div>
    </div>
  )
}

export function DiscountCard({ promo, onToggle, onEdit, onDelete }: {
  promo: Promo
  onToggle: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const { t } = useTranslation()
  const foodLanguage = useAppStore((s) => s.foodLanguage)
  const active = Boolean(promo.is_active)
  const specific = promo.applies_to === 'specific'
  return (
    <CardShell
      active={active}
      name={localName(promo, foodLanguage)}
      tile={promo.type === 'percentage' ? <Percent /> : <Tag />}
      onToggle={onToggle}
      onEdit={onEdit}
      onDelete={onDelete}
      aside={
        <span className={cn('shrink-0 text-xl font-extrabold tracking-tight', active ? 'text-primary-ink' : 'text-muted')}>
          {promo.type === 'percentage' ? (
            <bdi dir="ltr" className="num">−{promo.discount_value}%</bdi>
          ) : (
            <bdi dir="ltr">−<Money value={promo.discount_value} /></bdi>
          )}
        </span>
      }
    >
      <p className="text-sm text-muted">
        {specific
          ? t('promotions.specificCount', { count: promo.menu_item_ids?.length ?? 0 })
          : t('promotions.allItems')}
      </p>
    </CardShell>
  )
}

export function PackCard({ pack, menuItems, onToggle, onEdit, onDelete }: {
  pack: Pack
  menuItems: MenuItemLite[]
  onToggle: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const { t } = useTranslation()
  const foodLanguage = useAppStore((s) => s.foodLanguage)
  const currencySymbol = useAppStore((s) => s.currencySymbol)
  const active = Boolean(pack.is_active)
  const separately = pack.items ? packIndividualTotal(pack.items, menuItems) : 0
  const savings = Math.max(0, separately - pack.pack_price)
  return (
    <CardShell
      active={active}
      name={localName(pack, foodLanguage)}
      tile={pack.emoji || <Tag />}
      onToggle={onToggle}
      onEdit={onEdit}
      onDelete={onDelete}
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-2xl font-extrabold tracking-tight text-ink"><Money value={pack.pack_price} /></span>
        {savings > 0 && (
          <>
            <span className="text-sm text-muted line-through"><Money value={separately} /></span>
            <Badge variant="success">
              <bdi>{t('promotions.save', { amount: `${formatAmount(savings)} ${currencySymbol}` })}</bdi>
            </Badge>
          </>
        )}
      </div>
      {pack.items && pack.items.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {pack.items.map((item, i) => {
            const menuItem = menuItems.find((m) => m.id === item.menu_item_id)
            const label = menuItem ? localName(menuItem, foodLanguage) : item.menu_item_name || `#${item.menu_item_id}`
            return (
              <li key={i} className="rounded-lg bg-surface-2 px-2 py-1 text-xs font-medium text-ink-2">
                <span className="num me-1 text-muted">{item.quantity}×</span>
                <bdi>{label}</bdi>
              </li>
            )
          })}
        </ul>
      )}
    </CardShell>
  )
}
