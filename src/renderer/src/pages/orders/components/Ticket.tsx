import { useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useShallow } from 'zustand/react/shallow'
import { ReceiptText } from 'lucide-react'
import { EmptyState } from '../../../components/ui'
import { cartTotals, useOrderStore } from '../../../store/orderStore'
import type { Checkout } from '../hooks/useCheckout'
import { useUpsell } from '../hooks/useFeeds'
import { clearCartWithUndo, removeLineWithUndo } from '../lib/cartActions'
import { CheckoutErrorBanner } from './TicketAlerts'
import { TicketFooter } from './TicketFooter'
import { TicketHeader } from './TicketHeader'
import { TicketLine } from './TicketLine'
import { UpsellChips } from './UpsellChips'

interface TicketProps {
  checkout: Checkout
  lang: string
  isTouch: boolean
  onEditLine: (key: string) => void
  onOpenNote: () => void
  onOpenDiscount: () => void
  onOpenDelivery: () => void
  onAddSuggestion: (menuItemId: number) => void
}

/** Receipt-style ticket: perforated edges around the order, lines, upsell, totals and Pay. */
export function Ticket(props: TicketProps) {
  const { t } = useTranslation()
  const { checkout } = props
  const items = useOrderStore((s) => s.items)
  const pulse = useOrderStore((s) => s.pulse)
  const totalsInput = useOrderStore(useShallow((s) => ({
    items: s.items, activePromos: s.activePromos, editingOrderId: s.editingOrderId, discountAmount: s.discountAmount,
    discountDetails: s.discountDetails, manualDiscount: s.manualDiscount, orderType: s.orderType, deliveryFee: s.deliveryFee
  })))
  const totals = useMemo(() => cartTotals(totalsInput), [totalsInput])
  const editing = totalsInput.editingOrderId !== null
  const cartIds = useMemo(() => items.map((i) => i.menu_item_id), [items])
  const suggestions = useUpsell(cartIds, !editing)

  const onQty = useCallback((key: string, quantity: number) => useOrderStore.getState().setQuantity(key, quantity), [])
  const onRemove = useCallback((key: string) => removeLineWithUndo(t, key, props.lang), [t, props.lang])
  const onClear = (): void => {
    if (clearCartWithUndo(t)) checkout.dismissError()
  }

  return (
    <aside className="min-h-0 border-s border-line bg-surface-2/50 dark:bg-canvas px-3 pt-3 pb-3 flex flex-col" aria-label={t('pos.ticket.title')}>
      <div className="receipt-edge-top shrink-0" />
      <div className="flex-1 min-h-0 flex flex-col bg-surface px-4">
        <TicketHeader
          count={totals.count}
          validation={checkout.validation}
          onOpenNote={props.onOpenNote}
          onOpenDiscount={props.onOpenDiscount}
          onOpenDelivery={props.onOpenDelivery}
          onClear={onClear}
        />
        <div className="flex-1 min-h-0 overflow-y-auto -mx-4 px-4 mt-3 border-t border-dashed border-line-strong">
          {items.length === 0 ? (
            <EmptyState compact icon={<ReceiptText />} title={t('pos.ticket.empty')} />
          ) : (
            items.map((line) => {
              const flash = pulse?.key === line.key
              return (
                <TicketLine
                  key={flash ? `${line.key}:${pulse!.n}` : line.key}
                  line={line}
                  lang={props.lang}
                  flash={flash}
                  onEdit={props.onEditLine}
                  onQty={onQty}
                  onRemove={onRemove}
                />
              )
            })
          )}
          {!editing && <UpsellChips suggestions={suggestions} lang={props.lang} onAdd={props.onAddSuggestion} />}
        </div>
        {checkout.error && (
          <CheckoutErrorBanner
            error={checkout.error}
            onDismiss={checkout.dismissError}
            onAcceptBelowMin={checkout.acceptBelowMin}
            onOpenShift={checkout.openShiftPrompt}
          />
        )}
        <TicketFooter
          totals={totals}
          editing={editing}
          busy={checkout.busy}
          isTouch={props.isTouch}
          showTender={!editing && totalsInput.orderType !== 'delivery'}
          cashStep={checkout.cashStep}
          onPay={checkout.pay}
          onTender={checkout.quickTender}
        />
      </div>
      <div className="receipt-edge shrink-0" />
    </aside>
  )
}
