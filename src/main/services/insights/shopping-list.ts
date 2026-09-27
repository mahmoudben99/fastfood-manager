/**
 * Shopping list for a date: ingredient needs of the prep forecast (recipes converted to stock
 * units through stock-units.ts) compared with current stock and the low-stock threshold.
 *
 *   need    = Σ expected(menu item) × recipe quantity in stock units, minus what the date's
 *             non-cancelled orders already consumed (order_item_deductions) — stock_items.quantity
 *             already reflects those sales, so a mid-day check compares like with like
 *   to buy  = max(0, need + threshold − max(0, have))   — end the day at the safety threshold
 *   rounded = up to 0.1 (< 1), 0.5 (< 10) or 1 (≥ 10) for kg/liter; whole numbers for units
 *   cost    = rounded × latest purchase price (fallback: stock item price)
 * Stock items already at/below their threshold appear even when today's forecast does not use them.
 */
import type Database from 'better-sqlite3'
import type { PrepForecast, ShoppingList, ShoppingListItem, ShoppingListUsage } from '../../../shared/insights'
import { canonicalUnit } from '../stock-units'
import { latestUnitCosts, lineStockQuantity, loadPurchaseHistory, loadRecipes, loadStock, round3 } from './costs'
import { buildForecast, type ForecastOptions } from './forecast'

/** Rounds a purchase quantity UP to a step a shop can actually sell. */
export function roundPurchase(quantity: number, unit: string): number {
  if (!(quantity > 0)) return 0
  const eps = 1e-9
  if (canonicalUnit(unit) === 'unit') return Math.ceil(quantity - eps)
  const step = quantity < 1 ? 0.1 : quantity < 10 ? 0.5 : 1
  return Math.round(Math.ceil(quantity / step - eps) * step * 10) / 10
}

export interface IngredientNeed {
  /** Remaining need (forecast need − consumed so far, ≥ 0). */
  need: number
  /** Stock already deducted by the date's non-cancelled orders. */
  consumed: number
  usedBy: ShoppingListUsage[]
}

/** Stock deducted by non-cancelled orders of `date`, per stock item. */
export function consumedOn(db: Database.Database, date: string): Map<number, number> {
  const rows = db.prepare(
    `SELECT oid.stock_item_id AS id, SUM(oid.quantity_deducted) AS consumed
     FROM order_item_deductions oid
     JOIN order_items oi ON oi.id = oid.order_item_id
     JOIN orders o ON o.id = oi.order_id
     WHERE o.order_date = ? AND o.status != 'cancelled'
     GROUP BY oid.stock_item_id`
  ).all(date) as { id: number; consumed: number }[]
  return new Map(rows.map((row) => [row.id, row.consumed]))
}

/** Stock needed per stock item for a forecast. Unit mismatches / inactive stock go to `warnings`. */
export function ingredientNeeds(
  db: Database.Database,
  forecast: PrepForecast
): { needs: Map<number, IngredientNeed>; warnings: string[] } {
  const recipes = loadRecipes(db)
  const needs = new Map<number, IngredientNeed>()
  const warnings: string[] = []
  for (const item of forecast.items) {
    for (const line of recipes.get(item.menuItemId) ?? []) {
      if (!line.stockActive) {
        warnings.push(`${item.name}: stock item "${line.stockName}" is deleted`)
        continue
      }
      const perUnit = lineStockQuantity(line)
      if (perUnit === null) {
        warnings.push(`${item.name}: recipe unit ${line.unit} does not match ${line.stockName} (${line.stockUnit})`)
        continue
      }
      const quantity = perUnit * item.expected
      const entry = needs.get(line.stockItemId) ?? { need: 0, consumed: 0, usedBy: [] }
      entry.need += quantity
      entry.usedBy.push({ menuItemId: item.menuItemId, name: item.name, quantity: round3(quantity) })
      needs.set(line.stockItemId, entry)
    }
  }
  for (const [id, consumed] of consumedOn(db, forecast.date)) {
    const entry = needs.get(id)
    if (!entry) continue
    entry.consumed = consumed
    entry.need = Math.max(0, entry.need - consumed)
  }
  return { needs, warnings }
}

export function buildShoppingList(
  db: Database.Database,
  date: string,
  options: ForecastOptions & { forecast?: PrepForecast } = {}
): ShoppingList {
  const forecast = options.forecast ?? buildForecast(db, date, options)
  const { needs, warnings } = ingredientNeeds(db, forecast)
  const stock = loadStock(db)
  const costs = latestUnitCosts(stock, loadPurchaseHistory(db))

  const items: ShoppingListItem[] = []
  for (const info of stock.values()) {
    if (!info.isActive) continue
    const entry = needs.get(info.id)
    const need = entry?.need ?? 0
    const lowStock = info.quantity <= info.threshold
    if (need <= 0 && !lowStock) continue
    const have = info.quantity
    const toBuyExact = Math.max(0, need + info.threshold - Math.max(0, have))
    const toBuy = roundPurchase(toBuyExact, info.unit)
    const unitCost = costs.get(info.id) ?? 0
    items.push({
      stockItemId: info.id,
      name: info.name,
      name_ar: info.name_ar,
      name_fr: info.name_fr,
      unit: info.unit,
      need: round3(need),
      consumedToday: round3(entry?.consumed ?? 0),
      have: round3(have),
      threshold: info.threshold,
      toBuyExact: round3(toBuyExact),
      toBuy,
      unitCost,
      estCost: Math.round(toBuy * unitCost),
      critical: need > 0 && have < need - 1e-9,
      reason: need > 0 && lowStock ? 'both' : need > 0 ? 'forecast' : 'low_stock',
      usedBy: (entry?.usedBy ?? []).sort((a, b) => b.quantity - a.quantity).slice(0, 3)
    })
  }

  // Only rows with something to buy, critical ones first, then by estimated cost.
  const toBuy = items.filter((item) => item.toBuy > 0 || item.critical)
  toBuy.sort((a, b) => Number(b.critical) - Number(a.critical) || b.estCost - a.estCost || a.name.localeCompare(b.name))

  return {
    date: forecast.date,
    forecast,
    items: toBuy,
    totalEstCost: toBuy.reduce((sum, item) => sum + item.estCost, 0),
    criticalCount: toBuy.filter((item) => item.critical).length,
    warnings: [...new Set(warnings)]
  }
}
