import { deliveryFeeLabel, summaryLines, type SummaryItem, type SummaryLang } from '../sync/order-summary'

/**
 * The owner's "new order" Telegram message (HTML parse mode — only &, <, > need escaping, so a
 * stray * or _ in an option name can no longer make Telegram reject the notification):
 *
 *   🔔 New Order #42 · tablet
 *   🍽️ At Table — Table 5
 *     2x Burger
 *         +Cheese x2 · NO Onions
 *     1x Menu Maxi
 *         ↳ Burger (NO Onions)
 *         ↳ Fries
 *   🏷️ Discount: -50.00 DA
 *   🛵 Delivery fee: 200.00 DA
 *   💰 Total: 1450.00 DA
 */
export function escapeTelegramHtml(text: unknown): string {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

export interface OrderMessageOrder {
  daily_number: number | string
  order_type?: string | null
  table_number?: string | null
  customer_phone?: string | null
  customer_name?: string | null
  notes?: string | null
  source?: string | null
  total?: number | null
  discount_amount?: number | null
  delivery_fee?: number | null
  items?: SummaryItem[] | null
}

const amount = (value: unknown): string => Number(value || 0).toFixed(2)

export function formatOrderNotification(
  order: OrderMessageOrder,
  options: { currency: string; lang?: SummaryLang; eventId?: number }
): string {
  const e = escapeTelegramHtml
  const c = e(options.currency)
  const lang = options.lang ?? 'en'
  const typeEmoji = order.order_type === 'delivery' ? '🛵' : order.order_type === 'takeout' ? '🥡' : '🍽️'
  const typeName = order.order_type === 'delivery' ? 'Delivery' : order.order_type === 'takeout' ? 'Take Out' : 'At Table'
  const source = order.source && order.source !== 'pos' ? ` · ${e(order.source)}` : ''

  let msg = `🔔 <b>New Order #${e(order.daily_number)}</b>${source}\n${typeEmoji} ${typeName}`
  if (order.table_number) msg += ` — Table ${e(order.table_number)}`
  if (order.customer_name) msg += `\n👤 ${e(order.customer_name)}`
  if (order.customer_phone) msg += `\n📞 ${e(order.customer_phone)}`
  msg += '\n'
  for (const line of summaryLines(order.items, lang)) {
    msg += `\n  ${line.quantity}x ${e(line.name)}`
    if (line.options.length) msg += `\n      <i>${e(line.options.join(' · '))}</i>`
    for (const pick of line.picks) {
      msg += `\n      ↳ ${e(pick.name)}${pick.options.length ? ` <i>(${e(pick.options.join(' · '))})</i>` : ''}`
    }
  }
  msg += '\n'
  if (Number(order.discount_amount) > 0) msg += `\n🏷️ Discount: -${amount(order.discount_amount)} ${c}`
  if (Number(order.delivery_fee) > 0) msg += `\n🛵 ${e(deliveryFeeLabel(lang))}: ${amount(order.delivery_fee)} ${c}`
  msg += `\n💰 <b>Total: ${amount(order.total)} ${c}</b>`
  if (order.notes) msg += `\n📝 ${e(order.notes)}`
  if (options.eventId !== undefined) msg += `\n<i>Event ${e(options.eventId)}</i>`
  return msg
}
