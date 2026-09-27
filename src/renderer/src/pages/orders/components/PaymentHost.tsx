import { PaymentSheet, type OrderPaymentInput } from '../../../components/checkout'
import { cartTotals, useOrderStore } from '../../../store/orderStore'

/** The payment sheet with its own narrow store subscription (the screen does not re-render per tap). */
export function PaymentHost({ open, busy, onCancel, onConfirm }: {
  open: boolean
  busy: boolean
  onCancel: () => void
  onConfirm: (payments: OrderPaymentInput[]) => void
}) {
  const total = useOrderStore((s) => (open ? cartTotals(s).total : 0))
  // Takeaway pays at the counter; dine-in and delivery (cash on delivery) may pay later.
  const allowPayLater = useOrderStore((s) => s.orderType !== 'takeout')
  return <PaymentSheet open={open} total={total} onCancel={onCancel} onConfirm={onConfirm} allowPayLater={allowPayLater} busy={busy} />
}
