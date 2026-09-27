import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Minus, Plus, Trash2 } from 'lucide-react'
import type { ResolvedCombo, ResolvedModifierGroup } from '../../../../../shared/catalog-types'
import { Button, EmptyState, Modal, Money, Skeleton, cn } from '../../../components/ui'
import { activeChannel, channelPrice, childrenExtra, modifiersExtra, useOrderStore, type CartComboChild, type CartItem, type CartModifier } from '../../../store/orderStore'
import { defaultSelection, missingGroups, selectionFromCart, selectionToCart, sortGroups, type Selection } from '../lib/modifiers'
import { localName } from '../lib/names'
import type { MenuItemData } from '../types'
import { moneyDecimals } from './MenuTile'
import { ModifierGroups } from './ModifierGroups'
import { ComboSlotPicker, type Pick } from './ComboSlotPicker'

export interface ComboSheetResult {
  children: CartComboChild[]
  modifiers: CartModifier[]
  quantity: number
  catalogChanged: boolean
}

interface ComboSheetProps {
  item: MenuItemData | undefined
  line?: CartItem
  loadCombo: () => Promise<ResolvedCombo | null>
  groupsFor: (menuItemId: number) => Promise<ResolvedModifierGroup[]>
  lang: string
  onClose: () => void
  onConfirm: (result: ComboSheetResult) => void
  onRemove?: () => void
}

let pickSeq = 0
const newPick = (menuItemId: number, selection?: Selection, note?: string): Pick => ({ key: `p${++pickSeq}`, menu_item_id: menuItemId, selection, note })

/** Combo builder: slots with choices (upcharges, sold-out disabled), per-pick options, combo options. */
export function ComboSheet({ item, line, loadCombo, groupsFor, lang, onClose, onConfirm, onRemove }: ComboSheetProps) {
  const { t } = useTranslation()
  const channel = useOrderStore(activeChannel)
  const [combo, setCombo] = useState<ResolvedCombo | null | undefined>(undefined)
  const [groups, setGroups] = useState<Map<number, ResolvedModifierGroup[]>>(new Map())
  const [picks, setPicks] = useState<Record<number, Pick[]>>({})
  const [ownSelection, setOwnSelection] = useState<Selection>({})
  const [quantity, setQuantity] = useState(line?.quantity ?? 1)
  const [showMissing, setShowMissing] = useState(false)
  const initialLine = useRef(line)
  const comboId = item?.id ?? line?.menu_item_id ?? 0

  useEffect(() => {
    let alive = true
    ;(async () => {
      const resolved = await loadCombo()
      if (!alive) return
      if (!resolved) {
        setCombo(null)
        return
      }
      const ids = new Set<number>([comboId])
      for (const slot of resolved.slots) for (const c of slot.choices) if (c.has_modifiers) ids.add(c.menu_item_id)
      const loaded = new Map<number, ResolvedModifierGroup[]>()
      await Promise.all(Array.from(ids).map(async (id) => loaded.set(id, sortGroups(await groupsFor(id)))))
      if (!alive) return
      const start = initialLine.current
      const next: Record<number, Pick[]> = {}
      for (const slot of resolved.slots) {
        const fromLine = start?.children?.filter((c) => c.slot_id === slot.id)
        next[slot.id] = fromLine
          ? fromLine.map((c) => newPick(c.menu_item_id, loaded.has(c.menu_item_id) ? selectionFromCart(loaded.get(c.menu_item_id)!, c.modifiers) : undefined, c.note))
          : slot.choices.filter((c) => c.is_default && !c.sold_out).slice(0, slot.max_select)
              .map((c) => newPick(c.menu_item_id, loaded.has(c.menu_item_id) ? defaultSelection(loaded.get(c.menu_item_id)!) : undefined))
      }
      setGroups(loaded)
      setPicks(next)
      const own = loaded.get(comboId) || []
      setOwnSelection(start ? selectionFromCart(own, start.modifiers) : defaultSelection(own))
      setCombo(resolved)
    })()
    return () => { alive = false }
  }, [loadCombo, groupsFor, comboId])

  const ownGroups = groups.get(comboId) || []
  const children = useMemo<CartComboChild[]>(() => {
    if (!combo) return []
    return combo.slots.flatMap((slot) => (picks[slot.id] || []).map((pick) => {
      const choice = slot.choices.find((c) => c.menu_item_id === pick.menu_item_id)!
      const g = groups.get(pick.menu_item_id)
      return {
        slot_id: slot.id,
        menu_item_id: pick.menu_item_id,
        name: choice.name,
        name_ar: choice.name_ar,
        name_fr: choice.name_fr,
        upcharge: choice.upcharge,
        modifiers: g && pick.selection ? selectionToCart(g, pick.selection) : [],
        ...(pick.note ? { note: pick.note } : {})
      }
    }))
  }, [combo, picks, groups])
  const ownModifiers = useMemo(() => selectionToCart(ownGroups, ownSelection), [ownGroups, ownSelection])

  const base = channelPrice(combo?.price ?? item?.price ?? line?.menu_price ?? 0, item?.channel_prices ?? line?.channel_prices, channel)
  const unit = Math.max(0, base + modifiersExtra(ownModifiers) + childrenExtra(children))

  const slotProblems = combo ? combo.slots.filter((s) => {
    const n = (picks[s.id] || []).length
    return n < s.min_select || n > s.max_select
  }) : []
  const pickProblems = combo ? combo.slots.flatMap((s) => (picks[s.id] || []).filter((p) => {
    const g = groups.get(p.menu_item_id)
    return g && missingGroups(g, p.selection || {}).length > 0
  })) : []
  const ownMissing = missingGroups(ownGroups, ownSelection)
  const valid = combo && slotProblems.length === 0 && pickProblems.length === 0 && ownMissing.length === 0

  const confirm = (): void => {
    if (!combo) return
    if (!valid) {
      setShowMissing(true)
      return
    }
    const key = (list: CartComboChild[] | undefined): string =>
      (list || []).map((c) => `${c.slot_id}:${c.menu_item_id}:${(c.modifiers || []).map((m) => `${m.option_id}x${m.quantity}`).sort().join('.')}:${c.note || ''}`).join('|')
    const ownKey = (m: CartModifier[] | undefined): string => (m || []).map((x) => `${x.option_id}x${x.quantity}`).sort().join(',')
    const start = initialLine.current
    const catalogChanged = Boolean(start && (key(start.children) !== key(children) || ownKey(start.modifiers) !== ownKey(ownModifiers)))
    onConfirm({ children, modifiers: ownModifiers, quantity, catalogChanged })
  }

  const name = item ? localName(item, lang) : line ? localName(line, lang) : ''

  return (
    <Modal
      isOpen
      onClose={onClose}
      size="2xl"
      title={<span className="flex items-center gap-2"><span className="text-2xl">{item?.emoji ?? line?.emoji ?? '🍱'}</span>{line ? t('pos.sheet.editTitle', { name }) : name}</span>}
      footer={
        <div className="w-full flex items-center gap-3">
          <div className="flex items-center rounded-xl border border-line bg-surface">
            <button type="button" aria-label={t('pos.ticket.less')} disabled={quantity <= 1} onClick={() => setQuantity((q) => Math.max(1, q - 1))} className="tap h-12 w-12 flex items-center justify-center disabled:opacity-40"><Minus className="h-5 w-5" /></button>
            <span className="num w-9 text-center text-lg font-extrabold text-ink">{quantity}</span>
            <button type="button" aria-label={t('pos.ticket.more')} onClick={() => setQuantity((q) => Math.min(999, q + 1))} className="tap h-12 w-12 flex items-center justify-center"><Plus className="h-5 w-5" /></button>
          </div>
          {line && onRemove && <Button variant="ghost" size="lg" icon={<Trash2 />} onClick={onRemove} className="text-danger-ink">{t('pos.sheet.removeLine')}</Button>}
          <div className="flex-1" />
          <Button variant="secondary" size="xl" onClick={onClose}>{t('common.cancel')}</Button>
          <Button size="xl" onClick={confirm} disabled={!combo} cooldownMs={400} className="min-w-56">
            <span className="flex-1 text-start truncate">
              {!valid && showMissing && slotProblems[0] ? t('pos.combo.choose', { slot: localName(slotProblems[0], lang) }) : line ? t('pos.sheet.save') : t('pos.sheet.add')}
            </span>
            <Money value={unit * quantity} decimals={moneyDecimals(unit * quantity)} />
          </Button>
        </div>
      }
    >
      {combo === undefined ? (
        <div className="space-y-3"><Skeleton className="h-6 w-48" /><div className="grid grid-cols-4 gap-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}</div></div>
      ) : combo === null ? (
        <EmptyState compact title={t('pos.combo.missing')} />
      ) : (
        <div className="flex flex-col gap-7">
          {ownGroups.length > 0 && (
            <ModifierGroups groups={ownGroups} selection={ownSelection} onChange={setOwnSelection} lang={lang} showMissing={showMissing} />
          )}
          {combo.slots.map((slot) => (
            <ComboSlotPicker
              key={slot.id}
              slot={slot}
              picks={picks[slot.id] || []}
              groups={groups}
              lang={lang}
              showMissing={showMissing}
              onChange={(next) => setPicks((prev) => ({ ...prev, [slot.id]: next }))}
              newPick={(menuItemId) => newPick(menuItemId, groups.has(menuItemId) ? defaultSelection(groups.get(menuItemId)!) : undefined)}
            />
          ))}
        </div>
      )}
      {showMissing && !valid && combo && (
        <p className={cn('mt-4 text-sm font-semibold text-danger-ink')}>{t('pos.combo.incomplete')}</p>
      )}
    </Modal>
  )
}
