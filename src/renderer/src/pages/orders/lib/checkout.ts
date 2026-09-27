/**
 * Order payloads for orders.create / orders.updateItems (v4 shapes) and error classification.
 * Prices come from the DB: `unit_price` is sent ONLY for a deliberate cashier override.
 */
import { parseApprovalError } from '../../../../../shared/cash'
import { parseOrderEditRejection, type OrderEditRejection } from '../../../../../shared/order-edit'
import type { DeliveryDraft, OrderDeliveryInput, OrderPaymentInput } from '../../../components/checkout'
import { cartTotals, defaultChannelFor, type CartItem, type CartModifier, useOrderStore } from '../../../store/orderStore'
import { topLevelItems } from '../types'

type OrderStateSnapshot = ReturnType<typeof useOrderStore.getState>

const picks = (mods: CartModifier[]): { option_id: number; quantity: number }[] =>
  mods.map((m) => ({ option_id: m.option_id, quantity: m.quantity }))

function catalogFields(line: CartItem, send: boolean): Record<string, unknown> {
  if (!send) return {}
  const out: Record<string, unknown> = {}
  if (line.modifiers !== undefined) out.modifiers = picks(line.modifiers)
  if (line.is_combo && line.children !== undefined) {
    out.children = line.children.map((c) => ({
      slot_id: c.slot_id,
      menu_item_id: c.menu_item_id,
      ...(c.modifiers !== undefined ? { modifiers: picks(c.modifiers) } : {}),
      ...(c.note ? { note: c.note } : {})
    }))
  }
  return out
}

const override = (line: CartItem): Record<string, number> =>
  line.price_override !== undefined && line.price_override !== null ? { unit_price: line.price_override } : {}

export function createLineInput(line: CartItem): Record<string, unknown> {
  return {
    menu_item_id: line.menu_item_id,
    quantity: line.quantity,
    notes: line.notes || undefined,
    worker_id: line.worker_id || undefined,
    ...override(line),
    ...catalogFields(line, true)
  }
}

/** Existing lines keep their options unless changed; combo child rows are passed back as-is. */
export function updateLineInputs(items: CartItem[]): Record<string, unknown>[] {
  return items.flatMap((line) => {
    const existing = line.order_item_id !== undefined
    const main = {
      order_item_id: line.order_item_id,
      menu_item_id: line.menu_item_id,
      quantity: line.quantity,
      notes: line.notes || undefined,
      worker_id: line.worker_id,
      ...override(line),
      ...catalogFields(line, !existing || Boolean(line.catalog_dirty))
    }
    const kept = existing && line.child_rows ? line.child_rows.map((row) => ({ ...row })) : []
    return [main, ...kept]
  })
}

/** Anything besides the customer fields? (v3-style phone-only delivery orders send no details.) */
export function hasDeliveryDetails(draft: DeliveryDraft | null | undefined): boolean {
  if (!draft) return false
  return Boolean(draft.address?.trim() || draft.address_id || draft.zone_id || draft.driver_id ||
    (draft.fee !== undefined && draft.fee !== null) || draft.notes?.trim())
}

export function deliveryAddressMissing(draft: DeliveryDraft | null | undefined): boolean {
  return hasDeliveryDetails(draft) && !(draft!.address?.trim() || draft!.address_id)
}

function deliveryInput(draft: DeliveryDraft | null, ignoreMinOrder: boolean): OrderDeliveryInput | undefined {
  if (!hasDeliveryDetails(draft)) return undefined
  const { customer_phone: _p, customer_name: _n, ...rest } = draft!
  return ignoreMinOrder ? { ...rest, ignore_min_order: true } : rest
}

export interface CreateOrderPayload {
  source_request_id: string
  order_type: string
  table_number?: string
  customer_phone?: string
  customer_name?: string
  notes?: string
  discount_amount?: number
  discount_details?: string
  items: Record<string, unknown>[]
  payments?: OrderPaymentInput[]
  delivery?: OrderDeliveryInput
  /** v4 channels: sales channel (a delivery platform); omitted = the order type's own. */
  channel?: string
}

export function buildCreateInput(
  s: OrderStateSnapshot,
  sourceRequestId: string,
  payments: OrderPaymentInput[] | undefined,
  opts: { ignoreMinOrder?: boolean } = {}
): CreateOrderPayload {
  const totals = cartTotals(s)
  const isDelivery = s.orderType === 'delivery'
  return {
    source_request_id: sourceRequestId,
    order_type: s.orderType,
    table_number: s.orderType === 'local' ? s.tableNumber.trim() || undefined : undefined,
    customer_phone: s.customerPhone.trim() || undefined,
    customer_name: s.customerName.trim() || undefined,
    notes: s.notes.trim() || undefined,
    discount_amount: totals.discount > 0 ? totals.discount : undefined,
    discount_details: totals.discount > 0 ? totals.discountDetails || undefined : undefined,
    items: s.items.map(createLineInput),
    payments,
    delivery: isDelivery ? deliveryInput(s.delivery, Boolean(opts.ignoreMinOrder)) : undefined,
    channel: s.channel ?? undefined
  }
}

export function buildUpdateInfo(s: OrderStateSnapshot, opts: { ignoreMinOrder?: boolean } = {}): Record<string, unknown> {
  const info: Record<string, unknown> = {
    order_type: s.orderType,
    table_number: s.orderType === 'local' ? s.tableNumber.trim() || null : null,
    customer_phone: s.customerPhone.trim() || null,
    customer_name: s.customerName.trim() || null,
    notes: s.notes.trim() || null
  }
  // The server keeps the saved channel unless one is named (or the order type changes).
  if (s.channel !== s.editingChannel) info.channel = s.channel ?? defaultChannelFor(s.orderType)
  if (s.deliveryDirty || opts.ignoreMinOrder) {
    info.delivery = s.orderType === 'delivery' ? deliveryInput(s.delivery, Boolean(opts.ignoreMinOrder)) ?? null : null
  }
  return info
}

const text = (value: unknown): string | null => {
  const normalized = typeof value === 'string' ? value.trim() : ''
  return normalized || null
}
const pickKey = (list?: { option_id: number; quantity?: number }[]): string =>
  (list || []).map((m) => `${m.option_id}x${m.quantity ?? 1}`).sort().join(',')

/**
 * An idempotent retry returned an order saved earlier for this checkout: does it match the cart we
 * sent? Only TOP-LEVEL lines are compared (combo child rows are stored lines of their own, so
 * counting them made every combo checkout look like "the cart differs").
 */
export function duplicateMatchesCheckout(order: any, input: CreateOrderPayload, expectedDiscount: number): boolean {
  if (order.order_type !== input.order_type ||
      (order.channel !== undefined && order.channel !== null && order.channel !== (input.channel ?? defaultChannelFor(input.order_type))) ||
      text(order.table_number) !== text(input.table_number) ||
      text(order.customer_phone) !== text(input.customer_phone) ||
      text(order.customer_name) !== text(input.customer_name) ||
      text(order.notes) !== text(input.notes)) return false
  if (Math.abs(Number(order.discount_amount || 0) - Math.round(expectedDiscount * 100) / 100) > 0.01) return false
  const stored = topLevelItems(Array.isArray(order.items) ? order.items : []) as any[]
  if (stored.length !== input.items.length) return false
  return input.items.every((item: any, index: number) => {
    const existing = stored[index]
    if (!existing) return false
    const storedKids = (order.items as any[]).filter((c) => c.parent_order_item_id === existing.id)
    return Number(existing.menu_item_id) === Number(item.menu_item_id) &&
      Number(existing.quantity) === Number(item.quantity) &&
      text(existing.notes) === text(item.notes) &&
      (item.unit_price === undefined || Number(existing.unit_price) === Number(item.unit_price)) &&
      (item.worker_id === undefined || Number(existing.worker_id) === Number(item.worker_id)) &&
      (item.modifiers === undefined || pickKey(existing.modifiers) === pickKey(item.modifiers)) &&
      (item.children === undefined || storedKids.length === item.children.length)
  })
}

export function stripIpcPrefix(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.replace(/^Error invoking remote method '[^']+':\s*(Error:\s*)?/, '')
}

export type CheckoutError =
  | { kind: 'no_shift'; message: string }
  | { kind: 'below_min'; message: string; zone?: string; min?: number }
  | { kind: 'edit_rejected'; message: string; reason: OrderEditRejection }
  | { kind: 'approval'; message: string }
  | { kind: 'generic'; message: string }

export function classifyError(error: unknown): CheckoutError {
  const message = stripIpcPrefix(error)
  const rejection = parseOrderEditRejection(message)
  if (rejection) return { kind: 'edit_rejected', message, reason: rejection }
  if (/NO_OPEN_SHIFT:/.test(message)) return { kind: 'no_shift', message }
  if (/BELOW_MIN_ORDER:/.test(message)) {
    const match = message.match(/minimum order for (.+) is (\d+(?:\.\d+)?)/)
    return { kind: 'below_min', message, zone: match?.[1], min: match ? Number(match[2]) : undefined }
  }
  if (parseApprovalError(message)) return { kind: 'approval', message }
  return { kind: 'generic', message }
}
