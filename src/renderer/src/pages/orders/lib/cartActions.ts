/** Reversible cart actions: an Undo toast instead of a confirm dialog (DESIGN §6). */
import type { TFunction } from 'i18next'
import { toast } from '../../../components/ui'
import { useOrderStore } from '../../../store/orderStore'
import { localName } from './names'

export function removeLineWithUndo(t: TFunction, key: string, lang: string): void {
  const removed = useOrderStore.getState().removeLine(key)
  if (!removed) return
  toast.info(t('pos.ticket.removed', { name: localName(removed.line, lang) }), {
    id: 'pos-line-removed',
    action: { label: t('ui.undo'), onClick: () => useOrderStore.getState().restoreLine(removed.line, removed.index) }
  })
}

/** The data part of the cart (Undo after clear / cancel edit / loading an order over a cart). */
export function cartSnapshot() {
  const { items, orderType, channel, editingChannel, tableNumber, customerPhone, customerName, notes, delivery, deliveryFee,
    deliveryDirty, discountAmount, discountDetails, manualDiscount, editingOrderId, editingOrderDailyNumber } = useOrderStore.getState()
  return { items, orderType, channel, editingChannel, tableNumber, customerPhone, customerName, notes, delivery, deliveryFee,
    deliveryDirty, discountAmount, discountDetails, manualDiscount, editingOrderId, editingOrderDailyNumber }
}

export function clearCartWithUndo(t: TFunction): boolean {
  const snapshot = cartSnapshot()
  if (snapshot.items.length === 0 && snapshot.editingOrderId === null) return false
  useOrderStore.getState().clearOrder()
  toast.info(snapshot.editingOrderId !== null ? t('pos.ticket.editCancelled') : t('pos.ticket.cleared'), {
    id: 'pos-cart-cleared',
    action: { label: t('ui.undo'), onClick: () => useOrderStore.setState(snapshot) }
  })
  return true
}
