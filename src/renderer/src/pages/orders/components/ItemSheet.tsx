import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Minus, Plus, RotateCcw, Tag, Trash2 } from 'lucide-react'
import type { ResolvedModifierGroup } from '../../../../../shared/catalog-types'
import { Button, Modal, Money, Skeleton, cn } from '../../../components/ui'
import { activeChannel, computeUnitPrice, useOrderStore, type CartItem, type CartModifier } from '../../../store/orderStore'
import { newLineFromMenu } from '../lib/cartLines'
import {
  defaultSelection, missingGroups, selectionFromCart, selectionToCart, sortGroups, type Selection
} from '../lib/modifiers'
import { localName } from '../lib/names'
import type { MenuItemData } from '../types'
import { useTouchField } from '../touchKeyboard'
import { moneyDecimals } from './MenuTile'
import { ModifierGroups } from './ModifierGroups'

export interface ItemSheetResult {
  modifiers: CartModifier[]
  quantity: number
  notes: string
  /** Edit mode only: null = priced by the DB. */
  price_override?: number | null
  /** Edit mode: the option set differs from the line's. */
  catalogChanged?: boolean
}

interface ItemSheetProps {
  item: MenuItemData | undefined
  /** Present = editing this cart line. */
  line?: CartItem
  loadGroups: () => Promise<ResolvedModifierGroup[]>
  lang: string
  noteSuggestions: string[]
  onClose: () => void
  onConfirm: (result: ItemSheetResult) => void
  onRemove?: () => void
}

const modsKey = (mods: CartModifier[] | undefined): string =>
  (mods || []).map((m) => `${m.option_id}x${m.quantity}`).sort().join(',')

/** ONE sheet for an item: required groups first with live counters, quantity, kitchen note, (edit) price. */
export function ItemSheet({ item, line, loadGroups, lang, noteSuggestions, onClose, onConfirm, onRemove }: ItemSheetProps) {
  const { t } = useTranslation()
  const channel = useOrderStore(activeChannel)
  const perfMode = document.documentElement.classList.contains('perf')
  const [groups, setGroups] = useState<ResolvedModifierGroup[] | null>(null)
  const [selection, setSelection] = useState<Selection>({})
  const [quantity, setQuantity] = useState(line?.quantity ?? 1)
  const [notes, setNotes] = useState(line?.notes ?? '')
  const [priceText, setPriceText] = useState(line?.price_override != null ? String(line.price_override) : '')
  const [showMissing, setShowMissing] = useState(false)
  const body = useRef<HTMLDivElement>(null)
  const noteField = useTouchField(notes, setNotes, 'text')
  const priceField = useTouchField(priceText, setPriceText, 'numeric')

  // The line as it was when the sheet opened (a later store update must not reset the picks).
  const initialLine = useRef(line)
  useEffect(() => {
    let alive = true
    loadGroups().then((g) => {
      if (!alive) return
      const sorted = sortGroups(g)
      const start = initialLine.current
      setGroups(sorted)
      setSelection(start ? selectionFromCart(sorted, start.modifiers) : defaultSelection(sorted))
    })
    return () => { alive = false }
  }, [loadGroups])

  const modifiers = useMemo(() => (groups ? selectionToCart(groups, selection) : line?.modifiers ?? []), [groups, selection, line])
  const catalogChanged = Boolean(line && groups && modsKey(modifiers) !== modsKey(line.modifiers))
  const override = priceText.trim() === '' ? null : Number(priceText.replace(',', '.'))
  const overrideValid = override === null || (Number.isFinite(override) && override >= 0)
  const missing = groups ? missingGroups(groups, selection) : []

  const unit = useMemo(() => {
    const base = line ?? { ...newLineFromMenu(item!), key: '', price: 0, worker_id: null, quantity: 1, notes: '' }
    return computeUnitPrice({
      ...base,
      modifiers,
      catalog_dirty: Boolean(base.catalog_dirty) || catalogChanged,
      menu_price: base.menu_price ?? item?.price,
      channel_prices: base.channel_prices ?? item?.channel_prices ?? null,
      price_override: line && overrideValid ? override : base.price_override
    }, channel)
  }, [line, item, modifiers, catalogChanged, override, overrideValid, channel])

  const scrollToGroup = (id: number): void => {
    body.current?.closest('[role="dialog"]')?.querySelector(`[data-group-id="${id}"]`)
      ?.scrollIntoView({ block: 'start', behavior: perfMode ? 'auto' : 'smooth' })
  }

  const confirm = (): void => {
    if (!groups) return
    if (missing.length > 0) {
      setShowMissing(true)
      scrollToGroup(missing[0].id)
      return
    }
    if (!overrideValid) return
    onConfirm({ modifiers, quantity, notes: notes.trim(), price_override: line ? override : undefined, catalogChanged })
  }

  const name = line ? localName(line, lang) : item ? localName(item, lang) : ''
  const emoji = line?.emoji ?? item?.emoji
  const title = (
    <span className="flex items-center gap-2">
      {emoji && <span className="text-2xl">{emoji}</span>}
      <span>{line ? t('pos.sheet.editTitle', { name }) : name}</span>
    </span>
  )

  return (
    <Modal
      isOpen
      onClose={onClose}
      size="xl"
      title={title}
      footer={
        <div className="w-full flex items-center gap-3">
          <div className="flex items-center rounded-xl border border-line bg-surface">
            <button type="button" aria-label={t('pos.ticket.less')} disabled={quantity <= 1} onClick={() => setQuantity((q) => Math.max(1, q - 1))} className="tap h-12 w-12 flex items-center justify-center disabled:opacity-40">
              <Minus className="h-5 w-5" />
            </button>
            <span className="num w-9 text-center text-lg font-extrabold text-ink">{quantity}</span>
            <button type="button" aria-label={t('pos.ticket.more')} onClick={() => setQuantity((q) => Math.min(999, q + 1))} className="tap h-12 w-12 flex items-center justify-center">
              <Plus className="h-5 w-5" />
            </button>
          </div>
          {line && onRemove && (
            <Button variant="ghost" size="lg" icon={<Trash2 />} onClick={onRemove} className="text-danger-ink">
              {t('pos.sheet.removeLine')}
            </Button>
          )}
          <div className="flex-1" />
          <Button variant="secondary" size="xl" onClick={onClose}>{t('common.cancel')}</Button>
          <Button size="xl" onClick={confirm} disabled={!groups || !overrideValid} cooldownMs={400} className="min-w-56">
            <span className="flex-1 text-start truncate">
              {missing.length > 0 && showMissing
                ? t('pos.sheet.missing', { group: localName(missing[0], lang) })
                : line ? t('pos.sheet.save') : t('pos.sheet.add')}
            </span>
            <Money value={unit * quantity} decimals={moneyDecimals(unit * quantity)} />
          </Button>
        </div>
      }
    >
      <div ref={body} onKeyDown={(e) => { if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'TEXTAREA') { e.preventDefault(); confirm() } }}>
        {groups === null ? (
          <div className="space-y-3"><Skeleton className="h-6 w-40" /><Skeleton className="h-14 w-full" /><Skeleton className="h-14 w-full" /></div>
        ) : (
          <ModifierGroups
            groups={groups}
            selection={selection}
            lang={lang}
            showMissing={showMissing}
            onChange={(next, filled) => {
              setSelection(next)
              if (filled === undefined || !groups) return
              const nextMissing = missingGroups(groups, next).find((g) => g.id !== filled)
              if (nextMissing) setTimeout(() => scrollToGroup(nextMissing.id), 60)
            }}
          />
        )}

        <div className={cn('pt-6', groups && groups.length > 0 && 'mt-6 border-t border-line')}>
          <label className="block text-sm font-semibold text-ink-2 pb-1.5" htmlFor="pos-line-note">{t('pos.sheet.note')}</label>
          <input
            id="pos-line-note"
            data-ui="input"
            {...noteField}
            placeholder={t('pos.sheet.notePlaceholder')}
            className="w-full h-12 rounded-xl border border-line-strong bg-surface px-3.5 text-base text-ink placeholder:text-faint focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
          />
          {noteSuggestions.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-2">
              {noteSuggestions.slice(0, 8).map((s) => (
                <button key={s} type="button" onClick={() => setNotes(s)} className={cn('tap h-10 px-3 rounded-full border text-sm font-medium', notes === s ? 'border-primary bg-primary-soft text-primary-ink' : 'border-line bg-surface-2 text-ink-2 hover:bg-surface-3')}>
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>

        {line && (
          <div className="mt-6 pt-5 border-t border-line">
            <label className="flex items-center gap-1.5 text-sm font-semibold text-ink-2 pb-1.5" htmlFor="pos-line-price">
              <Tag className="h-4 w-4" />
              {t('pos.sheet.price')}
            </label>
            <div className="flex items-center gap-2">
              <input
                id="pos-line-price"
                data-ui="input"
                inputMode="decimal"
                {...priceField}
                placeholder={String(unit)}
                aria-invalid={!overrideValid || undefined}
                className={cn('num w-40 h-12 rounded-xl border bg-surface px-3.5 text-lg font-bold text-ink placeholder:font-normal placeholder:text-faint focus:outline-none focus:ring-4', overrideValid ? 'border-line-strong focus:border-primary focus:ring-primary/15' : 'border-danger focus:ring-danger/20')}
              />
              {priceText && (
                <Button variant="ghost" size="lg" icon={<RotateCcw />} onClick={() => setPriceText('')}>{t('pos.sheet.resetPrice')}</Button>
              )}
            </div>
            <p className="text-xs text-muted pt-1.5">{t('pos.sheet.priceHint')}</p>
          </div>
        )}
      </div>
    </Modal>
  )
}
