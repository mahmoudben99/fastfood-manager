/**
 * Upsell suggestions from order co-occurrence ("62% also take Fries").
 *
 * Model (rebuilt at most every 30 minutes, or when the database object changes after a reset):
 *   last 60 days of non-cancelled orders → n(A) = orders containing A, n(A,B) = orders with both.
 * Suggestion for a cart: for every cart item A with n(A) ≥ 5 and every B with n(A,B) ≥ 3,
 *   P(B|A) = n(A,B) / n(A) ≥ 10 %; B must be active, not in the cart, and not in a category the
 *   cart already has (no second burger for a burger, no second drink for a drink). Each B keeps
 *   its best anchor; results are sorted by probability, then support.
 * A lookup on the cached model is a few Map reads — well under a millisecond.
 */
import type Database from 'better-sqlite3'
import type { UpsellSuggestion } from '../../../shared/insights'
import { addDays, localDateOf } from './dates'

export const UPSELL_WINDOW_DAYS = 60
export const UPSELL_CACHE_MS = 30 * 60_000
export const MIN_ANCHOR_ORDERS = 5
export const MIN_PAIR_ORDERS = 3
export const MIN_PROBABILITY = 0.1
export const MAX_SUGGESTIONS = 10

interface ItemInfo {
  name: string
  name_ar: string | null
  name_fr: string | null
  categoryId: number
  price: number
  emoji: string | null
  /** Active item in an active category (only these are suggested). */
  sellable: boolean
}

export interface UpsellModel {
  builtAt: number
  orders: number
  counts: Map<number, number>
  pairs: Map<number, Map<number, number>>
  items: Map<number, ItemInfo>
}

export function buildUpsellModel(db: Database.Database, now: Date = new Date()): UpsellModel {
  const since = addDays(localDateOf(now), -UPSELL_WINDOW_DAYS)
  const rows = db.prepare(
    `SELECT oi.order_id AS orderId, oi.menu_item_id AS menuItemId
     FROM orders o JOIN order_items oi ON oi.order_id = o.id
     WHERE o.order_date >= ? AND o.status != 'cancelled'
     ORDER BY oi.order_id`
  ).raw().all(since) as [number, number][]

  const counts = new Map<number, number>()
  const pairs = new Map<number, Map<number, number>>()
  let orders = 0
  const flush = (basket: Set<number>): void => {
    if (basket.size === 0) return
    orders++
    const ids = [...basket]
    for (const a of ids) {
      counts.set(a, (counts.get(a) ?? 0) + 1)
      let row = pairs.get(a)
      if (!row) pairs.set(a, (row = new Map()))
      for (const b of ids) if (b !== a) row.set(b, (row.get(b) ?? 0) + 1)
    }
  }
  let current = -1
  let basket = new Set<number>()
  for (const [orderId, menuItemId] of rows) {
    if (orderId !== current) {
      flush(basket)
      basket = new Set()
      current = orderId
    }
    basket.add(menuItemId)
  }
  flush(basket)

  const items = new Map<number, ItemInfo>()
  const menu = db.prepare(
    `SELECT mi.id, mi.name, mi.name_ar, mi.name_fr, mi.category_id, mi.price, mi.emoji,
            (mi.is_active = 1 AND COALESCE(c.is_active, 1) = 1) AS sellable
     FROM menu_items mi LEFT JOIN categories c ON c.id = mi.category_id`
  ).all() as { id: number; name: string; name_ar: string | null; name_fr: string | null; category_id: number; price: number; emoji: string | null; sellable: number }[]
  for (const row of menu) {
    items.set(row.id, {
      name: row.name, name_ar: row.name_ar, name_fr: row.name_fr, categoryId: row.category_id,
      price: row.price, emoji: row.emoji ?? null, sellable: row.sellable === 1
    })
  }
  return { builtAt: now.getTime(), orders, counts, pairs, items }
}

function cleanCart(cart: unknown): number[] {
  if (!Array.isArray(cart)) return []
  return [...new Set(cart.map(Number).filter((id) => Number.isInteger(id) && id > 0))].slice(0, 100)
}

export function suggestFromModel(model: UpsellModel, cartInput: unknown, limitInput: unknown = 3): UpsellSuggestion[] {
  const cart = cleanCart(cartInput)
  const limitNumber = Number(limitInput)
  const limit = Number.isInteger(limitNumber) ? Math.min(MAX_SUGGESTIONS, Math.max(1, limitNumber)) : 3
  if (cart.length === 0) return []
  const inCart = new Set(cart)
  const cartCategories = new Set(cart.map((id) => model.items.get(id)?.categoryId).filter((id) => id !== undefined))
  const best = new Map<number, { p: number; anchor: number; support: number }>()

  for (const anchor of cart) {
    const anchorOrders = model.counts.get(anchor) ?? 0
    if (anchorOrders < MIN_ANCHOR_ORDERS) continue
    for (const [candidate, together] of model.pairs.get(anchor) ?? []) {
      if (together < MIN_PAIR_ORDERS || inCart.has(candidate)) continue
      const info = model.items.get(candidate)
      if (!info?.sellable || cartCategories.has(info.categoryId)) continue
      const p = together / anchorOrders
      if (p < MIN_PROBABILITY) continue
      const previous = best.get(candidate)
      if (!previous || p > previous.p || (p === previous.p && together > previous.support)) {
        best.set(candidate, { p, anchor, support: together })
      }
    }
  }

  return [...best.entries()]
    .sort((a, b) => b[1].p - a[1].p || b[1].support - a[1].support || a[0] - b[0])
    .slice(0, limit)
    .map(([id, hit]) => {
      const info = model.items.get(id)!
      return {
        menuItemId: id,
        name: info.name,
        name_ar: info.name_ar,
        name_fr: info.name_fr,
        categoryId: info.categoryId,
        price: info.price,
        emoji: info.emoji,
        probability: Math.round(hit.p * 1000) / 1000,
        percent: Math.round(hit.p * 100),
        anchorMenuItemId: hit.anchor,
        anchorName: model.items.get(hit.anchor)?.name ?? '',
        supportOrders: hit.support
      }
    })
}

/** Lazily (re)built model per database connection, at most every `ttlMs`. */
export function createUpsellCache(ttlMs = UPSELL_CACHE_MS) {
  let cached: { db: Database.Database; model: UpsellModel } | null = null
  const model = (db: Database.Database, now: Date = new Date()): UpsellModel => {
    if (!cached || cached.db !== db || now.getTime() - cached.model.builtAt >= ttlMs || now.getTime() < cached.model.builtAt) {
      cached = { db, model: buildUpsellModel(db, now) }
    }
    return cached.model
  }
  return {
    model,
    isStale: (db: Database.Database, now: Date = new Date()): boolean =>
      !cached || cached.db !== db || now.getTime() - cached.model.builtAt >= ttlMs,
    suggestions: (db: Database.Database, cart: unknown, limit?: unknown, now: Date = new Date()): UpsellSuggestion[] =>
      suggestFromModel(model(db, now), cart, limit),
    invalidate: (): void => { cached = null }
  }
}

/** Process-wide cache used by the IPC handler and warmed by the scheduler. */
export const upsellCache = createUpsellCache()
