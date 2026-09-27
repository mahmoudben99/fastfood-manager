import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { orderEditRejection } from '../../../../../shared/order-edit'
import type { RepeatLine } from '../../../components/checkout'
import { toast } from '../../../components/ui'
import { useOrderStore } from '../../../store/orderStore'
import { cartSnapshot } from '../lib/cartActions'
import { linesFromOrder, linesFromRepeat, newLineFromMenu } from '../lib/cartLines'
import { stripIpcPrefix } from '../lib/checkout'
import { defaultCartModifiers, isRequiredGroup } from '../lib/modifiers'
import { blockedReason } from '../components/MenuGrid'
import type { MenuItemData, OrderData, SheetState } from '../types'
import type { MenuData } from './useMenuData'

/**
 * What a tap does: combos open the combo builder, items with required option groups open the
 * options sheet, everything else is added at once with its default options. Also: load an order
 * for editing, and "repeat last order" from the customer lookup.
 */
export function useCartActions(menu: MenuData, openSheet: (sheet: SheetState) => void, afterLoad: () => void) {
  const { t } = useTranslation()
  const { byId, groupsById, groupsFor, comboFor } = menu

  const tapItem = useCallback(async (item: MenuItemData) => {
    if (blockedReason(item)) return
    if (item.is_combo === 1) {
      openSheet({ kind: 'combo', menuItemId: item.id })
      return
    }
    const groups = groupsById.get(item.id) ?? (await groupsFor(item.id))
    if (groups.some(isRequiredGroup)) {
      openSheet({ kind: 'item', menuItemId: item.id })
      return
    }
    useOrderStore.getState().addItem(newLineFromMenu(item, { modifiers: defaultCartModifiers(groups) }))
  }, [groupsById, groupsFor, openSheet])

  const customizeItem = useCallback((item: MenuItemData) => {
    if (blockedReason(item)) return
    openSheet({ kind: item.is_combo === 1 ? 'combo' : 'item', menuItemId: item.id })
  }, [openSheet])

  const addById = useCallback((menuItemId: number) => {
    const item = byId.get(menuItemId)
    if (item) void tapItem(item)
  }, [byId, tapItem])

  const editLine = useCallback((key: string) => {
    const line = useOrderStore.getState().items.find((l) => l.key === key)
    if (!line) return
    openSheet({ kind: line.is_combo ? 'combo' : 'item', menuItemId: line.menu_item_id, lineKey: key })
  }, [openSheet])

  const startEditOrder = useCallback(async (orderId: number) => {
    let full: OrderData | null = null
    try {
      full = await window.api.orders.getById(orderId)
    } catch (err) {
      toast.error(stripIpcPrefix(err))
      return
    }
    // The list can be stale (left open across midnight): refuse up front, with the reason.
    const reason = orderEditRejection(full)
    if (reason || !full) {
      toast.error(t(`orders.editLocked.${reason ?? 'not_found'}`), { duration: 0 })
      return
    }
    const before = cartSnapshot()
    useOrderStore.getState().loadOrderForEdit(full, linesFromOrder(full, byId))
    afterLoad()
    if (before.items.length > 0 && before.editingOrderId === null) {
      toast.info(t('pos.ticket.cartReplaced'), { action: { label: t('ui.undo'), onClick: () => useOrderStore.setState(before) } })
    }
  }, [byId, afterLoad, t])

  const repeatOrder = useCallback(async (lines: RepeatLine[]) => {
    const { lines: next, skipped } = await linesFromRepeat(lines, { menuById: byId, groupsFor, comboFor })
    next.forEach((line) => useOrderStore.getState().addItem(line))
    if (next.length > 0) toast.success(t('pos.delivery.repeated', { count: next.reduce((s, l) => s + (l.quantity ?? 1), 0) }))
    if (skipped > 0) toast.warning(t('pos.delivery.repeatSkipped', { count: skipped }))
  }, [byId, groupsFor, comboFor, t])

  return { tapItem, customizeItem, addById, editLine, startEditOrder, repeatOrder }
}
