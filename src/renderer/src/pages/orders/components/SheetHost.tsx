import { useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { RepeatLine } from '../../../components/checkout'
import { useOrderStore } from '../../../store/orderStore'
import type { Validation } from '../hooks/useCheckout'
import type { MenuData } from '../hooks/useMenuData'
import { removeLineWithUndo } from '../lib/cartActions'
import { newLineFromMenu } from '../lib/cartLines'
import type { SheetState } from '../types'
import { ComboSheet, type ComboSheetResult } from './ComboSheet'
import { DeliverySheet } from './DeliverySheet'
import { ItemSheet, type ItemSheetResult } from './ItemSheet'
import { DiscountSheet, OrderNoteSheet } from './SmallSheets'

interface SheetHostProps {
  sheet: SheetState
  menu: MenuData
  lang: string
  noteSuggestions: string[]
  validation: Validation
  onClose: () => void
  onRepeat: (lines: RepeatLine[]) => void
}

/** Mounts the one open sheet (lazy: nothing is rendered while closed) and applies its result to the cart. */
export function SheetHost({ sheet, menu, lang, noteSuggestions, validation, onClose, onRepeat }: SheetHostProps) {
  const { t } = useTranslation()
  const menuItemId = sheet.kind === 'item' || sheet.kind === 'combo' ? sheet.menuItemId : 0
  const lineKey = sheet.kind === 'item' || sheet.kind === 'combo' ? sheet.lineKey : undefined
  const item = menu.byId.get(menuItemId)
  // Frozen at open time: the sheet edits a copy, the store is only touched on confirm.
  const line = useMemo(
    () => (lineKey ? useOrderStore.getState().items.find((l) => l.key === lineKey) : undefined),
    [lineKey]
  )
  const { groupsFor, comboFor } = menu
  const loadGroups = useCallback(() => groupsFor(menuItemId), [groupsFor, menuItemId])
  const loadCombo = useCallback(() => comboFor(menuItemId), [comboFor, menuItemId])

  const remove = (): void => {
    if (lineKey) removeLineWithUndo(t, lineKey, lang)
    onClose()
  }

  const confirmItem = (r: ItemSheetResult): void => {
    const store = useOrderStore.getState()
    if (line) {
      store.updateLine(line.key, {
        quantity: r.quantity,
        notes: r.notes,
        price_override: r.price_override ?? null,
        ...(r.catalogChanged || line.order_item_id === undefined ? { modifiers: r.modifiers } : {}),
        catalog_dirty: Boolean(line.catalog_dirty || r.catalogChanged),
        menu_price: line.menu_price ?? item?.price,
        channel_prices: line.channel_prices ?? item?.channel_prices ?? null
      })
    } else if (item) {
      store.addItem(newLineFromMenu(item, { modifiers: r.modifiers, quantity: r.quantity, notes: r.notes }))
    }
    onClose()
  }

  const confirmCombo = (r: ComboSheetResult): void => {
    const store = useOrderStore.getState()
    if (line) {
      store.updateLine(line.key, {
        quantity: r.quantity,
        ...(r.catalogChanged || line.order_item_id === undefined ? { children: r.children, modifiers: r.modifiers } : {}),
        catalog_dirty: Boolean(line.catalog_dirty || r.catalogChanged),
        menu_price: line.menu_price ?? item?.price,
        channel_prices: line.channel_prices ?? item?.channel_prices ?? null
      })
    } else if (item) {
      store.addItem(newLineFromMenu(item, { children: r.children, modifiers: r.modifiers, quantity: r.quantity }))
    }
    onClose()
  }

  if ((sheet.kind === 'item' || sheet.kind === 'combo') && !item && !line) return null
  switch (sheet.kind) {
    case 'item':
      return (
        <ItemSheet
          item={item}
          line={line}
          loadGroups={loadGroups}
          lang={lang}
          noteSuggestions={noteSuggestions}
          onClose={onClose}
          onConfirm={confirmItem}
          onRemove={line ? remove : undefined}
        />
      )
    case 'combo':
      return (
        <ComboSheet
          item={item}
          line={line}
          loadCombo={loadCombo}
          groupsFor={groupsFor}
          lang={lang}
          onClose={onClose}
          onConfirm={confirmCombo}
          onRemove={line ? remove : undefined}
        />
      )
    case 'orderNote':
      return <OrderNoteSheet suggestions={noteSuggestions} onClose={onClose} />
    case 'discount':
      return <DiscountSheet onClose={onClose} />
    case 'delivery':
      return <DeliverySheet validation={validation} onClose={onClose} onRepeat={onRepeat} />
  }
}
