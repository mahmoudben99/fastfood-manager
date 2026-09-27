/**
 * v4 sales channels: dine-in / takeout / delivery + delivery platforms (Yassir built in, custom
 * platforms added by the owner). A menu item may carry a different price per channel
 * (table menu_item_channel_prices); an order records the channel it was sold on (orders.channel).
 */

export type OrderTypeId = 'local' | 'takeout' | 'delivery'

export const BUILTIN_CHANNELS = ['local', 'takeout', 'delivery', 'yassir'] as const
export type BuiltinChannelId = (typeof BUILTIN_CHANNELS)[number]

export interface SalesChannel {
  /** 'local' | 'takeout' | 'delivery' | 'yassir' | a custom platform id (lowercase slug). */
  id: string
  /** Custom platforms: the owner's label. Built-ins: '' (the UI translates `channels.names.<id>`). */
  label: string
  builtin: boolean
  /** The order type this channel belongs to (platforms are always delivery). */
  orderType: OrderTypeId
  enabled: boolean
}

/** Channel id → price in DA. A missing channel sells at the item's normal menu price. */
export type ChannelPrices = Record<string, number>

export interface CustomPlatformInput {
  id?: string
  label: string
  enabled?: boolean
}

/** A custom platform id: 2–24 chars, lowercase letters/digits/dash, never a built-in id. */
export const PLATFORM_ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,23}$/

/** The default channel of an order type (orders without an explicit channel). */
export function defaultChannelFor(orderType: string): string {
  return orderType === 'delivery' || orderType === 'takeout' ? orderType : 'local'
}

/** Slug for a new custom platform label ("Glovo Express" → "glovo-express"). */
export function platformSlug(label: string): string {
  return label
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24)
}
