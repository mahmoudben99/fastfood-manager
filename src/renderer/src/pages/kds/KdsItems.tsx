import { Fragment } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Layers, Minus, Plus, RefreshCw, TriangleAlert, X } from 'lucide-react'
import { Badge } from '../../components/ui'
import { cn } from '../../components/ui/cn'
import {
  kdsLocalName,
  kdsModifierIsRemoval,
  kdsModifierLabel,
  type KdsItemView,
  type KdsModifier
} from '../../../../shared/kds'

interface Props {
  items: KdsItemView[]
  /** Whole card cancelled: every line is struck through. */
  cancelled: boolean
  onLineDone: (item: KdsItemView) => void
}

/** Kitchen line list: combo children grouped under one combo header, modifiers flagged by kind. */
export function KdsItems({ items, cancelled, onLineDone }: Props) {
  return (
    <ul className="space-y-1 px-2 pb-2 pt-1.5">
      {items.map((item, index) => {
        const parent = item.parentOrderItemId
        const opensCombo = parent != null && item.comboName && items[index - 1]?.parentOrderItemId !== parent
        return (
          <Fragment key={item.id}>
            {opensCombo && <ComboHeader name={item.comboName!} />}
            <ItemLine item={item} child={parent != null} cancelled={cancelled} onLineDone={onLineDone} />
          </Fragment>
        )
      })}
    </ul>
  )
}

function ComboHeader({ name }: { name: string }) {
  const { t } = useTranslation()
  return (
    <li className="flex items-center gap-2 px-2 pt-2 text-base font-extrabold uppercase tracking-wide text-primary-ink rtl:normal-case rtl:tracking-normal">
      <Layers className="h-5 w-5 shrink-0" aria-hidden="true" />
      <bdi className="min-w-0 break-words">{t('kds.combo', { name })}</bdi>
    </li>
  )
}

function ItemLine({ item, child, cancelled, onLineDone }: {
  item: KdsItemView
  child: boolean
  cancelled: boolean
  onLineDone: (item: KdsItemView) => void
}) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const removed = item.change === 'removed'
  const done = !!item.doneAt
  const was = item.change === 'changed' && item.previousQuantity != null && item.previousQuantity !== item.quantity
    ? ` · ${t('kds.wasQty', { n: item.previousQuantity })}` : ''
  const prefixes = { modNo: t('kds.modNo'), modExtra: t('kds.modExtra'), modLight: t('kds.modLight') }

  return (
    <li
      className={cn(
        'flex items-start gap-3 rounded-xl p-2',
        child && 'ms-4 rounded-s-none border-s-2 border-primary/40 ps-3'
      )}
    >
      <button
        type="button"
        aria-label={t('kds.markDone')}
        aria-pressed={done}
        onClick={(event) => { event.stopPropagation(); if (!removed) onLineDone(item) }}
        className={cn(
          'tap mt-0.5 flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border-2',
          removed ? 'invisible' : done ? 'border-success-strong bg-success-strong text-white' : 'border-line-strong bg-surface-2 text-transparent'
        )}
      >
        <Check className="h-7 w-7" strokeWidth={3.5} />
      </button>
      <div className={cn('min-w-0 flex-1', done && 'opacity-45', cancelled && 'opacity-60')}>
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <span
            className={cn(
              'num inline-flex min-w-12 justify-center rounded-lg px-1.5 text-2xl font-black leading-10',
              item.quantity > 1 && !removed ? 'bg-ember' : 'bg-surface-3 text-ink'
            )}
          >
            {item.quantity}×
          </span>
          <span
            className={cn(
              'min-w-0 break-words text-2xl font-extrabold leading-tight',
              removed ? 'text-danger-ink line-through' : cancelled ? 'text-muted line-through' : 'text-ink'
            )}
          >
            <bdi>{kdsLocalName(item, lang)}</bdi>
          </span>
          {item.change === 'added' && (
            <Badge variant="success" size="md" icon={<Plus strokeWidth={3} />} className="font-black uppercase">{t('kds.added')}</Badge>
          )}
          {removed && (
            <Badge variant="danger" size="md" icon={<Minus strokeWidth={3} />} className="font-black uppercase">{t('kds.removed')}</Badge>
          )}
          {item.change === 'changed' && (
            <Badge variant="warning" size="md" icon={<RefreshCw strokeWidth={3} />} className="font-black uppercase">
              {t('kds.changed')}{was}
            </Badge>
          )}
        </div>
        {item.modifiers.length > 0 && (
          <ul className="mt-1.5 space-y-1">
            {item.modifiers.map((modifier, index) => (
              <ModifierRow key={index} modifier={modifier} label={kdsModifierLabel(modifier, lang, prefixes)} />
            ))}
          </ul>
        )}
        {item.notes && (
          <p className="mt-1.5 flex items-start gap-2 rounded-lg bg-warning-soft px-2.5 py-1.5 text-lg font-extrabold leading-snug text-warning-ink">
            <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
            <bdi className="min-w-0 break-words">{item.notes}</bdi>
          </p>
        )}
      </div>
    </li>
  )
}

/** NO = danger ✕ (bold), EXTRA = accent +, LIGHT = −, plain add-on = muted +. */
function ModifierRow({ modifier, label }: { modifier: KdsModifier; label: string }) {
  const kind = (modifier.kind || '').toLowerCase()
  if (kdsModifierIsRemoval(modifier)) {
    return (
      <li className="flex items-center gap-2 text-xl font-black text-danger-ink">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-danger-strong text-white">
          <X className="h-5 w-5" strokeWidth={3.5} aria-hidden="true" />
        </span>
        <bdi className="min-w-0 break-words">{label}</bdi>
      </li>
    )
  }
  const extra = kind === 'extra'
  const light = kind === 'light'
  const Icon = light ? Minus : Plus
  return (
    <li className={cn('flex items-center gap-2', extra ? 'text-xl font-extrabold text-primary-ink' : 'text-lg font-bold text-ink-2')}>
      <span
        className={cn(
          'flex h-7 w-7 shrink-0 items-center justify-center rounded-md',
          extra ? 'bg-primary-soft-2 text-accent' : 'bg-surface-3 text-muted'
        )}
      >
        <Icon className="h-5 w-5" strokeWidth={3} aria-hidden="true" />
      </span>
      <bdi className="min-w-0 break-words">{extra || light ? label : label.replace(/^\+\s*/, '')}</bdi>
    </li>
  )
}
