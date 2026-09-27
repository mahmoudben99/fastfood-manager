/**
 * v4 manager-approval guards for the order IPC handlers (see services/approvals.ts). They run in
 * the main process before the order service, so the renderer cannot skip them. With
 * `approval_enabled` off (default) they only pass the optional operator / reason through.
 */
import type { ApprovalInput } from '../../shared/cash'
import { getDb } from '../database/connection'
import { computeAutoDiscount } from '../services/order-promotions'
import { channelBasePrice, resolveOrderChannel } from '../services/channels'
import { discountNeedsApproval, editVoidsLines, requireApproval } from '../services/approvals'

type Meta = { operator?: string; reason?: string }

/** orders:create — a discount beyond the active promotions and above the threshold. */
export function guardCreateDiscount(input: {
  discount_amount?: number
  order_type?: string
  channel?: string | null
  items: { menu_item_id: number; quantity: number; unit_price?: number }[]
  approval?: ApprovalInput
}): void {
  const discount = Number(input?.discount_amount) || 0
  if (discount <= 0 || !Array.isArray(input.items)) return
  const db = getDb()
  const channel = resolveOrderChannel(db, input.order_type ?? 'takeout', input.channel)
  const menu = db.prepare('SELECT id, price FROM menu_items WHERE id = ?')
  const subtotal = input.items.reduce((acc, item) => {
    const row = menu.get(item.menu_item_id) as { id: number; price: number } | undefined
    const unit = item.unit_price ?? (row ? channelBasePrice(db, row, channel) : 0)
    return acc + Number(unit) * Number(item.quantity || 0)
  }, 0)
  const allowance = computeAutoDiscount(input.items, db, channel).amount
  if (discountNeedsApproval(db, { subtotal, discount, allowance })) {
    requireApproval(db, 'discount', input.approval, { detail: { discount, subtotal, allowance } })
  }
}

/** Cancellation: approval when guarded; always returns who / why for the audit and Z report. */
export function guardCancel(orderId: number, approval?: ApprovalInput): Meta {
  const approved = requireApproval(getDb(), 'cancel_order', approval, { orderId })
  return approved
    ? { operator: approved.operator, reason: approved.reason }
    : { operator: approval?.operator, reason: approval?.reason }
}

/** Line edit: removed / reduced lines are voids; a raised discount above the threshold too. */
export function guardLineEdit(
  orderId: number,
  lines: { order_item_id?: number; quantity: number }[],
  discountAmount: number | undefined,
  approval?: ApprovalInput
): string | undefined {
  const db = getDb()
  const existing = db.prepare('SELECT id, quantity, total_price FROM order_items WHERE order_id = ?').all(orderId) as
    { id: number; quantity: number; total_price: number }[]
  const order = db.prepare('SELECT subtotal, discount_amount FROM orders WHERE id = ?').get(orderId) as
    { subtotal: number; discount_amount: number } | undefined
  if (!order) return approval?.operator
  if (editVoidsLines(existing, lines)) {
    requireApproval(db, 'void_line', approval, { orderId, detail: { lines: lines.length } })
  }
  if (discountAmount !== undefined &&
      discountNeedsApproval(db, { subtotal: order.subtotal, discount: discountAmount, allowance: order.discount_amount })) {
    requireApproval(db, 'discount', approval, { orderId, detail: { discount: discountAmount, previous: order.discount_amount } })
  }
  return approval?.operator
}
