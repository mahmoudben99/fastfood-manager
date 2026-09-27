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
 *
 * v4 catalog: the forecast's physical items (combo children included) use their own recipe;
 * forecast combos add only their OWN recipe (packaging…); forecast options add their ingredients
 * ("Extra cheese" → cheese). Kind 'no' options never use stock.
 */
import type Database from 'better-sqlite3'
import type { PrepForecast, ShoppingList, ShoppingListItem, ShoppingListUsage } from '../../../shared/insights'
import { canonicalUnit } from '../stock-units'
import { latestUnitCosts, lineStockQuantity, loadPurchaseHistory, loadRecipes, loadStock, round3, type RecipeLine } from './costs'
import { loadOptionRecipes } from './catalog-costs'
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
  const add = (consumer: { menuItemId: number; name: string; expected: number }, lines: RecipeLine[]): void => {
    for (const line of lines) {
      if (!line.stockActive) {
        warnings.push(`${consumer.name}: stock item "${line.stockName}" is deleted`)
        continue
      }
      const perUnit = lineStockQuantity(line)
      if (perUnit === null) {
        warnings.push(`${consumer.name}: recipe unit ${line.unit} does not match ${line.stockName} (${line.stockUnit})`)
        continue
      }
      const quantity = perUnit * consumer.expected
      const entry = needs.get(line.stockItemId) ?? { need: 0, consumed: 0, usedBy: [] }
      entry.need += quantity
      const same = entry.usedBy.find((u) => u.menuItemId === consumer.menuItemId && u.name === consumer.name)
      if (same) same.quantity = round3(same.quantity + quantity)
      else entry.usedBy.push({ menuItemId: consumer.menuItemId, name: consumer.name, quantity: round3(quantity) })
      needs.set(line.stockItemId, entry)
    }
  }
  for (const item of forecast.items) add(item, recipes.get(item.menuItemId) ?? [])
  for (const combo of forecast.combos ?? []) add(combo, recipes.get(combo.menuItemId) ?? [])
  const options = forecast.options ?? []
  if (options.length > 0) {
    const optionRecipes = loadOptionRecipes(db)
    // usedBy.menuItemId is 0 for an option (it is not a menu item).
    for (const option of options) add({ menuItemId: 0, name: option.name, expected: option.expected }, optionRecipes.get(option.optionId) ?? [])
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
