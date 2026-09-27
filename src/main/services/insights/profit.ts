/**
 * Menu profit check.
 *
 * cost      = Σ recipe quantity (in stock units) × latest unit cost (see costs.ts)
 * margin    = price − cost (DA) and (price − cost) / price (%); food cost % = cost / price
 * flags     low_margin (margin % < profit_margin_warn_pct), no_recipe, unit_mismatch,
 *           missing_cost (an ingredient has no price), cost_increase (recipe cost up > 10 % vs
 *           the unit prices effective 30 days ago; the ingredient with the largest DA increase
 *           is named as responsible)
 * quadrant  menu engineering (Kasavana–Smith) over the date range, items with a recipe only:
 *           popular  ⇔ qty ≥ 70 % × (total qty / item count)
 *           profitable ⇔ margin DA ≥ qty-weighted average margin DA
 *           Star (popular, profitable) · Plowhorse (popular, low margin)
 *           Puzzle (unpopular, profitable) · Dog (unpopular, low margin)
 *
 * v4 catalog: cost is the STANDARD BUILD (catalog-costs.ts: recipe + default options; combos = own
 * recipe + default picks). Sales follow Analytics: combo children count on their own item at their
 * allocated revenue, the combo line counts on the combo. Combos are listed (isCombo) but kept out
 * of the quadrants — their children already carry those sales.
 */
import type Database from 'better-sqlite3'
import type {
  CostIncrease, MenuProfitFlag, MenuProfitItem, MenuProfitReport, MenuQuadrant, StockPriceChange
} from '../../../shared/insights'
import { assertRange, utcSqlTimestamp } from './dates'
import {
  latestUnitCosts, loadPurchaseHistory, loadStock, priceAt, recipeCost, round1, round2,
  type PurchasePoint, type RecipeLine
} from './costs'
import { loadCostingRecipes } from './catalog-costs'
import { LINE_REVENUE } from './sql'

export const COST_INCREASE_PCT = 10
export const COST_LOOKBACK_DAYS = 30

export interface MenuProfitOptions {
  marginWarnPct: number
  now?: Date
}

export interface PriceBook {
  current: Map<number, number>
  /** Unit prices effective COST_LOOKBACK_DAYS ago. */
  previous: Map<number, number>
  history: Map<number, PurchasePoint[]>
}

export function loadPriceBook(db: Database.Database, now: Date): PriceBook {
  const stock = loadStock(db)
  const history = loadPurchaseHistory(db)
  const current = latestUnitCosts(stock, history)
  const cutoff = utcSqlTimestamp(new Date(now.getTime() - COST_LOOKBACK_DAYS * 86_400_000))
  const previous = new Map<number, number>()
  for (const [id, price] of current) previous.set(id, priceAt(history.get(id), cutoff) ?? price)
  return { current, previous, history }
}

/** Cost change of one recipe between two price maps; null unless it rose by > COST_INCREASE_PCT. */
export function detectCostIncrease(lines: RecipeLine[], book: Pick<PriceBook, 'current' | 'previous'>): CostIncrease | null {
  const now = recipeCost(lines, (id) => book.current.get(id))
  const before = recipeCost(lines, (id) => book.previous.get(id))
  if (!(before.cost > 0) || now.cost <= before.cost * (1 + COST_INCREASE_PCT / 100)) return null
  let worst = 0
  for (let i = 1; i < now.lines.length; i++) {
    if (now.lines[i].cost - before.lines[i].cost > now.lines[worst].cost - before.lines[worst].cost) worst = i
  }
  const line = now.lines[worst].line
  const fromPrice = book.previous.get(line.stockItemId) ?? 0
  const toPrice = book.current.get(line.stockItemId) ?? 0
  return {
    pct: round1(((now.cost - before.cost) / before.cost) * 100),
    previousCost: round2(before.cost),
    currentCost: round2(now.cost),
    stockItemId: line.stockItemId,
    stockItemName: line.stockName,
    ingredientPct: fromPrice > 0 ? round1(((toPrice - fromPrice) / fromPrice) * 100) : 0
  }
}

interface MenuRow {
  id: number
  name: string
  name_ar: string | null
  name_fr: string | null
  price: number
  category_id: number
  category_name: string | null
  is_combo: number
}

export function buildMenuProfit(
  db: Database.Database,
  startDate: string,
  endDate: string,
  options: MenuProfitOptions
): MenuProfitReport {
  const range = assertRange(startDate, endDate)
  const now = options.now ?? new Date()
  const warn = options.marginWarnPct
  const menu = db.prepare(
    `SELECT mi.id, mi.name, mi.name_ar, mi.name_fr, mi.price, mi.category_id, c.name AS category_name, mi.is_combo
     FROM menu_items mi LEFT JOIN categories c ON c.id = mi.category_id
     WHERE mi.is_active = 1 ORDER BY mi.name`
  ).all() as MenuRow[]
  const sales = new Map((db.prepare(
    `SELECT oi.menu_item_id AS id, SUM(oi.quantity) AS qty, SUM(${LINE_REVENUE}) AS revenue
     FROM orders o JOIN order_items oi ON oi.order_id = o.id
     WHERE o.order_date BETWEEN ? AND ? AND o.status != 'cancelled'
     GROUP BY oi.menu_item_id`
  ).all(range.start, range.end) as { id: number; qty: number; revenue: number }[]).map((row) => [row.id, row]))
  const recipes = loadCostingRecipes(db)
  const book = loadPriceBook(db, now)

  const items: MenuProfitItem[] = menu.map((row) => {
    const lines = recipes.get(row.id) ?? []
    const flags: MenuProfitFlag[] = []
    const sold = sales.get(row.id)
    const base = {
      menuItemId: row.id,
      name: row.name,
      name_ar: row.name_ar,
      name_fr: row.name_fr,
      categoryId: row.category_id,
      categoryName: row.category_name ?? '',
      price: row.price,
      isCombo: row.is_combo === 1,
      qtySold: sold?.qty ?? 0,
      revenue: Math.round(sold?.revenue ?? 0),
      quadrant: null
    }
    if (lines.length === 0) {
      return { ...base, cost: null, marginDa: null, marginPct: null, foodCostPct: null, flags: ['no_recipe'], costIncrease: null, ingredients: [] }
    }
    const costed = recipeCost(lines, (id) => book.current.get(id))
    const cost = round2(costed.cost)
    const marginDa = round2(row.price - costed.cost)
    const marginPct = row.price > 0 ? round1(((row.price - costed.cost) / row.price) * 100) : null
    const costIncrease = detectCostIncrease(lines, book)
    if (costed.unitMismatch) flags.push('unit_mismatch')
    if (costed.missingCost) flags.push('missing_cost')
    if (marginPct !== null && marginPct < warn) flags.push('low_margin')
    if (costIncrease) flags.push('cost_increase')
    return {
      ...base,
      cost,
      marginDa,
      marginPct,
      foodCostPct: row.price > 0 ? round1((costed.cost / row.price) * 100) : null,
      flags,
      costIncrease,
      ingredients: costed.lines.map((c) => ({
        stockItemId: c.line.stockItemId,
        name: c.line.stockName,
        name_ar: c.line.stockName_ar,
        name_fr: c.line.stockName_fr,
        recipeQuantity: c.line.quantity,
        recipeUnit: c.line.unit,
        stockQuantity: c.stockQuantity,
        stockUnit: c.line.stockUnit,
        unitCost: c.unitCost,
        cost: round2(c.cost),
        via: c.line.via ?? null
      }))
    }
  })

  const { averageMarginDa, popularityThreshold } = assignQuadrants(items)
  const stock = loadStock(db)
  const priceIncreases: StockPriceChange[] = []
  for (const [id, toPrice] of book.current) {
    const info = stock.get(id)
    const fromPrice = book.previous.get(id) ?? toPrice
    if (!info?.isActive || !(fromPrice > 0) || toPrice <= fromPrice * (1 + COST_INCREASE_PCT / 100)) continue
    priceIncreases.push({
      stockItemId: id, name: info.name, name_ar: info.name_ar, name_fr: info.name_fr, unit: info.unit,
      fromPrice, toPrice, pct: round1(((toPrice - fromPrice) / fromPrice) * 100)
    })
  }
  priceIncreases.sort((a, b) => b.pct - a.pct)

  const count = (predicate: (item: MenuProfitItem) => boolean): number => items.filter(predicate).length
  const quadrant = (q: MenuQuadrant) => count((item) => item.quadrant === q)
  return {
    startDate: range.start,
    endDate: range.end,
    marginWarnPct: warn,
    averageMarginDa,
    popularityThreshold,
    items,
    priceIncreases,
    counts: {
      lowMargin: count((item) => item.flags.includes('low_margin')),
      noRecipe: count((item) => item.flags.includes('no_recipe')),
      costIncrease: count((item) => item.flags.includes('cost_increase')),
      star: quadrant('star'),
      plowhorse: quadrant('plowhorse'),
      puzzle: quadrant('puzzle'),
      dog: quadrant('dog')
    }
  }
}

/** Sets `quadrant` in place on items with a cost (combos excluded); returns the split lines. */
export function assignQuadrants(items: MenuProfitItem[]): { averageMarginDa: number; popularityThreshold: number } {
  const costed = items.filter((item) => item.marginDa !== null && !item.isCombo)
  const totalQty = costed.reduce((sum, item) => sum + item.qtySold, 0)
  if (costed.length === 0 || totalQty <= 0) return { averageMarginDa: 0, popularityThreshold: 0 }
  const averageMarginDa = round2(costed.reduce((sum, item) => sum + (item.marginDa as number) * item.qtySold, 0) / totalQty)
  const popularityThreshold = round2((0.7 * totalQty) / costed.length)
  for (const item of costed) {
    const popular = item.qtySold >= popularityThreshold
    const profitable = (item.marginDa as number) >= averageMarginDa
    item.quadrant = popular ? (profitable ? 'star' : 'plowhorse') : profitable ? 'puzzle' : 'dog'
  }
  return { averageMarginDa, popularityThreshold }
}
