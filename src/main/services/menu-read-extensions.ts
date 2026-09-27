import type Database from 'better-sqlite3'
import type { ChannelPrices } from '../../shared/channels'
import { rulesAllow } from '../../shared/availability'
import { allChannelPrices, getItemChannelPrices } from './channels'
import { availabilityIndex } from './availability'

/**
 * v4 fields added to every menu read (menuRepo getAll / getById / getActiveById / getDeleted):
 *  - channel_prices: { [channel]: price } — only channels with their own price (others = `price`)
 *  - available_now: 1 | 0 — the item's and its category's availability rules allow a sale now
 */
export interface MenuReadExtensions {
  channel_prices: ChannelPrices
  available_now: number
}

export function decorateMenuItems<T extends { id: number; category_id: number }>(
  db: Database.Database,
  rows: T[],
  now: Date = new Date()
): (T & MenuReadExtensions)[] {
  if (rows.length === 0) return rows as (T & MenuReadExtensions)[]
  const prices = rows.length === 1 ? new Map([[rows[0].id, getItemChannelPrices(db, rows[0].id)]]) : allChannelPrices(db)
  const rules = availabilityIndex(db)
  for (const row of rows as (T & MenuReadExtensions)[]) {
    row.channel_prices = prices.get(row.id) ?? {}
    row.available_now = rulesAllow(rules.items.get(row.id) ?? [], now) &&
      rulesAllow(rules.categories.get(row.category_id) ?? [], now) ? 1 : 0
  }
  return rows as (T & MenuReadExtensions)[]
}
