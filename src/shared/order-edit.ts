/**
 * Order line-edit policy shared by the main process (which enforces it) and the renderer
 * (which explains it). The business rule itself is unchanged: only orders from the current
 * business day that are not completed/cancelled may have their lines edited.
 */

/** Restaurant business date. Algeria is permanently UTC+1 and has no DST. */
export function businessDateInAlgiers(date: Date): string {
  return new Date(date.getTime() + 60 * 60_000).toISOString().slice(0, 10)
}

export type OrderEditRejection = 'not_found' | 'past_day' | 'completed' | 'cancelled'

const REJECTIONS: readonly OrderEditRejection[] = ['not_found', 'past_day', 'completed', 'cancelled']

/** Why an order's lines cannot be edited now, or null when the edit is allowed. */
export function orderEditRejection(
  order: { order_date: string; status: string } | null | undefined,
  now: Date = new Date()
): OrderEditRejection | null {
  if (!order) return 'not_found'
  if (order.status === 'cancelled') return 'cancelled'
  if (order.status === 'completed') return 'completed'
  if (order.order_date !== businessDateInAlgiers(now)) return 'past_day'
  return null
}

/**
 * Electron's ipcMain.handle only forwards an error's message to the renderer (custom fields
 * such as `code` are dropped), so a rejected edit travels as a stable, parseable token.
 */
const REJECTION_TOKEN = 'ORDER_EDIT_REJECTED:'

export function orderEditRejectedMessage(reason: OrderEditRejection): string {
  return `${REJECTION_TOKEN}${reason}`
}

export function parseOrderEditRejection(message: unknown): OrderEditRejection | null {
  const text = message instanceof Error ? message.message : String(message ?? '')
  const match = text.match(/ORDER_EDIT_REJECTED:([a-z_]+)/)
  const reason = match?.[1] as OrderEditRejection | undefined
  return reason && REJECTIONS.includes(reason) ? reason : null
}
