import type Database from 'better-sqlite3'
import {
  PLATFORM_ID_PATTERN, defaultChannelFor, platformSlug, type ChannelPrices, type CustomPlatformInput, type SalesChannel
} from '../../shared/channels'

/**
 * v4 sales channels + per-channel prices (migration 025).
 * Channels: local / takeout / delivery (always on) + delivery platforms from setting
 * `sales_channels` ([{ id, label, enabled }], Yassir built in). An item without a price for a
 * channel sells at its normal menu price there.
 */

const ORDER_TYPE_CHANNELS: SalesChannel[] = [
  { id: 'local', label: '', builtin: true, orderType: 'local', enabled: true },
  { id: 'takeout', label: '', builtin: true, orderType: 'takeout', enabled: true },
  { id: 'delivery', label: '', builtin: true, orderType: 'delivery', enabled: true }
]
const MAX_PLATFORMS = 12
const MAX_PRICE = 1_000_000_000

export class ChannelError extends Error {
  constructor(public code: 'unknown_channel' | 'invalid_price' | 'invalid_platform' | 'not_found', message: string) {
    super(`CHANNEL_${code.toUpperCase()}: ${message}`)
  }
}

const readyDbs = new WeakSet<Database.Database>()
/** menu_item_channel_prices exists (older test schemas without migration 025 fall back to menu prices). */
export function channelsReady(db: Database.Database): boolean {
  if (readyDbs.has(db)) return true
  const ok = Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'menu_item_channel_prices'").get())
  if (ok) readyDbs.add(db)
  return ok
}

function readPlatforms(db: Database.Database): { id: string; label: string; enabled: boolean }[] {
  const raw = (db.prepare("SELECT value FROM settings WHERE key = 'sales_channels'").get() as { value: string } | undefined)?.value
  let list: unknown = []
  try { list = raw ? JSON.parse(raw) : [] } catch { list = [] }
  const platforms = (Array.isArray(list) ? list : [])
    .filter((entry) => entry && typeof entry.id === 'string' && PLATFORM_ID_PATTERN.test(entry.id))
    .map((entry) => ({ id: String(entry.id), label: String(entry.label ?? entry.id).slice(0, 40), enabled: entry.enabled !== false }))
  if (!platforms.some((platform) => platform.id === 'yassir')) platforms.unshift({ id: 'yassir', label: 'Yassir', enabled: true })
  return platforms
}

export function listChannels(db: Database.Database): SalesChannel[] {
  return [
    ...ORDER_TYPE_CHANNELS,
    ...readPlatforms(db).map((platform) => ({
      id: platform.id,
      label: platform.id === 'yassir' ? '' : platform.label,
      builtin: platform.id === 'yassir',
      orderType: 'delivery' as const,
      enabled: platform.enabled
    }))
  ]
}

/** Replaces the platform list (Yassir can be switched off, never removed). */
export function savePlatforms(db: Database.Database, input: CustomPlatformInput[]): SalesChannel[] {
  if (!Array.isArray(input) || input.length > MAX_PLATFORMS) throw new ChannelError('invalid_platform', 'Too many platforms')
  const seen = new Set<string>()
  const platforms = input.map((entry) => {
    const label = String(entry?.label ?? '').trim().slice(0, 40)
    const id = String(entry?.id || platformSlug(label))
    if (!label && id !== 'yassir') throw new ChannelError('invalid_platform', 'A platform needs a name')
    if (!PLATFORM_ID_PATTERN.test(id) || ['local', 'takeout', 'delivery'].includes(id) || seen.has(id)) {
      throw new ChannelError('invalid_platform', `Invalid or repeated platform "${label || id}"`)
    }
    seen.add(id)
    return { id, label: id === 'yassir' ? 'Yassir' : label, enabled: entry?.enabled !== false }
  })
  if (!seen.has('yassir')) platforms.unshift({ id: 'yassir', label: 'Yassir', enabled: false })
  db.prepare("INSERT INTO settings (key, value) VALUES ('sales_channels', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .run(JSON.stringify(platforms))
  return listChannels(db)
}

/**
 * The channel an order is sold on: its order type's own channel unless a delivery order names
 * an enabled platform. null = the requested channel is unknown / disabled / wrong for the type.
 */
export function resolveOrderChannel(db: Database.Database, orderType: string, requested?: string | null): string | null {
  if (requested === undefined || requested === null || requested === '') return defaultChannelFor(orderType)
  if (requested === orderType) return requested
  const channel = listChannels(db).find((entry) => entry.id === requested)
  if (!channel || !channel.enabled || channel.orderType !== orderType) return null
  return channel.id
}

/**
 * The channel of an edited order: kept as is while the order type stays (even if its platform
 * was switched off since), re-resolved when the type changes or a channel is named.
 */
export function editOrderChannel(
  db: Database.Database,
  order: { order_type: string; channel?: string | null },
  nextType: string | undefined,
  requested: string | undefined
): string | null {
  const type = nextType ?? order.order_type
  if (requested === undefined && type === order.order_type) return order.channel || defaultChannelFor(type)
  return resolveOrderChannel(db, type, requested)
}

/** Stores an order's channel (no-op on schemas without migration 025). */
export function setOrderChannel(db: Database.Database, orderId: number, channel: string): void {
  if (channelsReady(db)) db.prepare('UPDATE orders SET channel = ? WHERE id = ?').run(channel, orderId)
}

/** Unit base price of a menu item on a channel (before options / combo upcharges). */
export function channelBasePrice(db: Database.Database, menu: { id: number; price: number }, channel: string | null): number {
  if (!channel || !channelsReady(db)) return menu.price
  const row = db.prepare('SELECT price FROM menu_item_channel_prices WHERE menu_item_id = ? AND channel = ?')
    .get(menu.id, channel) as { price: number } | undefined
  return row ? row.price : menu.price
}

export function getItemChannelPrices(db: Database.Database, menuItemId: number): ChannelPrices {
  const prices: ChannelPrices = {}
  if (!channelsReady(db)) return prices
  for (const row of db.prepare('SELECT channel, price FROM menu_item_channel_prices WHERE menu_item_id = ? ORDER BY channel')
    .all(menuItemId) as { channel: string; price: number }[]) {
    prices[row.channel] = row.price
  }
  return prices
}

/** Replaces the item's channel prices with `prices` (a channel left out or null = menu price). */
export function setItemChannelPrices(
  db: Database.Database,
  menuItemId: number,
  prices: Record<string, number | null | undefined>
): ChannelPrices {
  if (!db.prepare('SELECT 1 FROM menu_items WHERE id = ?').get(menuItemId)) throw new ChannelError('not_found', 'Menu item not found')
  if (!prices || typeof prices !== 'object' || Array.isArray(prices)) throw new ChannelError('invalid_price', 'Invalid prices')
  const known = new Set(listChannels(db).map((channel) => channel.id))
  const rows: [string, number][] = []
  for (const [channel, value] of Object.entries(prices)) {
    if (value === null || value === undefined || (value as unknown) === '') continue
    if (!known.has(channel)) throw new ChannelError('unknown_channel', `Unknown channel "${channel}"`)
    const price = Number(value)
    if (!Number.isFinite(price) || price < 0 || price > MAX_PRICE) throw new ChannelError('invalid_price', `Invalid price for ${channel}`)
    rows.push([channel, Math.round(price * 100) / 100])
  }
  db.transaction(() => {
    db.prepare('DELETE FROM menu_item_channel_prices WHERE menu_item_id = ?').run(menuItemId)
    const insert = db.prepare('INSERT INTO menu_item_channel_prices (menu_item_id, channel, price) VALUES (?, ?, ?)')
    for (const [channel, price] of rows) insert.run(menuItemId, channel, price)
    db.prepare("UPDATE menu_items SET updated_at = datetime('now') WHERE id = ?").run(menuItemId)
  })()
  return getItemChannelPrices(db, menuItemId)
}

/** Every item's channel prices in one query (menu reads). */
export function allChannelPrices(db: Database.Database): Map<number, ChannelPrices> {
  const map = new Map<number, ChannelPrices>()
  if (!channelsReady(db)) return map
  for (const row of db.prepare('SELECT menu_item_id, channel, price FROM menu_item_channel_prices').all() as
    { menu_item_id: number; channel: string; price: number }[]) {
    const prices = map.get(row.menu_item_id) ?? {}
    prices[row.channel] = row.price
    map.set(row.menu_item_id, prices)
  }
  return map
}
