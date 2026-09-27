/**
 * Cost basis shared by the shopping list, the menu profit check and the margin alarm.
 *
 * Unit cost of a stock item = price_per_unit of its LATEST real purchase (quantity > 0; the
 * negative rows written by stockRepo.fix() are cost corrections, not purchases), falling back to
 * stock_items.price_per_unit (the weighted average) when it was never purchased in the app.
 */
import type Database from 'better-sqlite3'
import type { LocalizedName } from '../../../shared/insights'
import { recipeQuantityInStockUnits } from '../stock-units'

export interface RecipeLine {
  menuItemId: number
  stockItemId: number
  quantity: number
  unit: string
  stockUnit: string
  stockActive: boolean
  stockName: string
  stockName_ar: string | null
  stockName_fr: string | null
  /** Where the line comes from when it is not the item's own recipe (option / combo pick). */
  via?: LocalizedName | null
}

export interface PurchasePoint {
  id: number
  price: number
  /** UTC 'YYYY-MM-DD HH:MM:SS' as stored. */
  at: string
}

export interface StockInfo {
  id: number
  name: string
  name_ar: string | null
  name_fr: string | null
  unit: string
  quantity: number
  threshold: number
  fallbackPrice: number
  isActive: boolean
}

/**
 * OWN recipes of ACTIVE menu items (menu_item_ingredients only), grouped by menu item. Options and
 * combo picks: catalog-costs.ts (loadOptionRecipes / loadCostingRecipes).
 */
export function loadRecipes(db: Database.Database): Map<number, RecipeLine[]> {
  const rows = db.prepare(
    `SELECT mii.menu_item_id AS menuItemId, mii.stock_item_id AS stockItemId, mii.quantity, mii.unit,
            si.unit_type AS stockUnit, si.is_active AS stockActive, si.name AS stockName,
            si.name_ar AS stockName_ar, si.name_fr AS stockName_fr
     FROM menu_item_ingredients mii
     JOIN menu_items mi ON mi.id = mii.menu_item_id
     JOIN stock_items si ON si.id = mii.stock_item_id
     WHERE mi.is_active = 1
     ORDER BY mii.menu_item_id, mii.id`
  ).all() as (Omit<RecipeLine, 'stockActive'> & { stockActive: number })[]
  const out = new Map<number, RecipeLine[]>()
  for (const row of rows) {
    const list = out.get(row.menuItemId) ?? []
    list.push({ ...row, stockActive: row.stockActive === 1 })
    out.set(row.menuItemId, list)
  }
  return out
}

export function loadStock(db: Database.Database): Map<number, StockInfo> {
  const rows = db.prepare(
    `SELECT id, name, name_ar, name_fr, unit_type AS unit, quantity, alert_threshold AS threshold,
            price_per_unit AS fallbackPrice, is_active AS isActive
     FROM stock_items`
  ).all() as (Omit<StockInfo, 'isActive'> & { isActive: number })[]
  return new Map(rows.map((row) => [row.id, { ...row, isActive: row.isActive === 1 }]))
}

/** Real purchases (quantity > 0) per stock item, oldest first. */
export function loadPurchaseHistory(db: Database.Database): Map<number, PurchasePoint[]> {
  const rows = db.prepare(
    `SELECT id, stock_item_id AS stockItemId, price_per_unit AS price, purchased_at AS at
     FROM stock_purchases WHERE quantity > 0
     ORDER BY stock_item_id, purchased_at, id`
  ).all() as (PurchasePoint & { stockItemId: number })[]
  const out = new Map<number, PurchasePoint[]>()
  for (const row of rows) {
    const list = out.get(row.stockItemId) ?? []
    list.push({ id: row.id, price: row.price, at: row.at })
    out.set(row.stockItemId, list)
  }
  return out
}

/** Latest purchase price per stock item, else the stock item's own price. */
export function latestUnitCosts(
  stock: Map<number, StockInfo>,
  history: Map<number, PurchasePoint[]>
): Map<number, number> {
  const out = new Map<number, number>()
  for (const [id, info] of stock) {
    const points = history.get(id)
    out.set(id, points && points.length > 0 ? points[points.length - 1].price : info.fallbackPrice)
  }
  return out
}

/**
 * Unit price effective at `atUtc` ('YYYY-MM-DD HH:MM:SS'): the latest purchase at or before it,
 * else the first purchase after it (the earliest price we know), else undefined.
 */
export function priceAt(points: PurchasePoint[] | undefined, atUtc: string): number | undefined {
  if (!points || points.length === 0) return undefined
  let found: PurchasePoint | undefined
  for (const point of points) {
    if (point.at <= atUtc) found = point
    else break
  }
  return (found ?? points[0]).price
}

export interface CostedLine {
  line: RecipeLine
  stockQuantity: number | null
  unitCost: number
  cost: number
}

export interface RecipeCost {
  cost: number
  lines: CostedLine[]
  unitMismatch: boolean
  /** An ingredient has no known unit cost (0). */
  missingCost: boolean
}

/** Stock units one sold unit of the menu item consumes for this line (null on a unit mismatch). */
export function lineStockQuantity(line: RecipeLine): number | null {
  try {
    return recipeQuantityInStockUnits(line.quantity, line.unit, line.stockUnit)
  } catch {
    return null
  }
}

/** Cost of ONE unit of a menu item from its recipe lines and a unit-price lookup. */
export function recipeCost(lines: RecipeLine[], priceOf: (stockItemId: number) => number | undefined): RecipeCost {
  let cost = 0
  let unitMismatch = false
  let missingCost = false
  const costed: CostedLine[] = []
  for (const line of lines) {
    const stockQuantity = lineStockQuantity(line)
    const unitCost = priceOf(line.stockItemId) ?? 0
    if (stockQuantity === null) unitMismatch = true
    if (!(unitCost > 0)) missingCost = true
    const lineCost = stockQuantity === null ? 0 : stockQuantity * unitCost
    cost += lineCost
    costed.push({ line, stockQuantity, unitCost, cost: lineCost })
  }
  return { cost, lines: costed, unitMismatch, missingCost }
}

export function round1(value: number): number {
  return Math.round(value * 10) / 10
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100
}

export function round3(value: number): number {
  return Math.round(value * 1000) / 1000
}
