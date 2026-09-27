import {
  normalizeRecipeUnit,
  normalizeStockUnit,
  recipeUnitsForStock
} from '../../../../shared/excel-import'

/** One editable recipe row. `quantity` stays text while typing so "0," or "" is not coerced. */
export interface RecipeRow {
  stock_item_id: number
  quantity: string
  unit: string
}

export interface StockOption {
  id: number
  name: string
  name_ar?: string | null
  name_fr?: string | null
  unit_type: string
}

export const UNIT_LABELS: Record<string, string> = {
  g: 'g',
  kg: 'kg',
  ml: 'ml',
  liter: 'L',
  unit: 'pcs'
}

/** Stored units may be spelled "l", "litre", "L"… — show and compare them canonically. */
export function canonicalRecipeUnit(unit: string): string {
  return normalizeRecipeUnit(String(unit || '')) ?? String(unit || '').trim().toLowerCase()
}

export function unitLabel(unit: string): string {
  const canonical = canonicalRecipeUnit(unit)
  return UNIT_LABELS[canonical] ?? unit
}

/** Units a recipe may use for this stock item: kg → g/kg, liter → ml/L, unit → pcs. */
export function compatibleUnits(stockUnitType: string | undefined): string[] {
  const stockUnit = normalizeStockUnit(String(stockUnitType || ''))
  return stockUnit ? recipeUnitsForStock(stockUnit) : []
}

/** The unit a new row gets when its stock item is picked (the small unit of the family). */
export function defaultUnitFor(stockUnitType: string | undefined): string {
  return compatibleUnits(stockUnitType)[0] ?? 'unit'
}

export function parseQuantity(text: string): number {
  const trimmed = String(text ?? '').trim()
  if (!trimmed) return Number.NaN
  if (/^\d*,\d+$/.test(trimmed)) return Number(trimmed.replace(',', '.'))
  return Number(trimmed)
}

export type RecipeIssue =
  | { kind: 'noStock' }
  | { kind: 'deletedStock' }
  | { kind: 'quantity' }
  | { kind: 'duplicate'; name: string }
  | { kind: 'unit'; unit: string; stock: StockOption }
  | { kind: 'large'; quantity: number; unit: string }

/** Per-row problems; `large` is advisory, every other kind blocks saving a changed recipe. */
export function checkRecipeRows(rows: RecipeRow[], stockItems: StockOption[]): (RecipeIssue | null)[] {
  const byId = new Map(stockItems.map((stock) => [stock.id, stock]))
  const seen = new Set<number>()
  return rows.map((row) => {
    if (!row.stock_item_id) return { kind: 'noStock' }
    const stock = byId.get(row.stock_item_id)
    if (!stock) return { kind: 'deletedStock' }
    if (seen.has(row.stock_item_id)) return { kind: 'duplicate', name: stock.name }
    seen.add(row.stock_item_id)
    const quantity = parseQuantity(row.quantity)
    if (!Number.isFinite(quantity) || quantity <= 0) return { kind: 'quantity' }
    const unit = canonicalRecipeUnit(row.unit)
    if (!compatibleUnits(stock.unit_type).includes(unit)) return { kind: 'unit', unit: row.unit, stock }
    // Legacy Excel imports stored "150" in kg for a burger; make such values visible.
    if ((unit === 'kg' || unit === 'liter') && quantity >= 5) return { kind: 'large', quantity, unit }
    return null
  })
}

export function isBlockingIssue(issue: RecipeIssue | null): boolean {
  return issue !== null && issue.kind !== 'large'
}

/** Order-insensitive fingerprint used to tell whether the recipe was edited. */
export function recipeFingerprint(rows: RecipeRow[]): string {
  return rows
    .map((row) => `${row.stock_item_id}:${parseQuantity(row.quantity)}:${canonicalRecipeUnit(row.unit)}`)
    .sort()
    .join('|')
}

/** Quantities for one size: base quantity × multiplier, rounded to avoid 0.30000000000000004. */
export function scaleRecipe(
  rows: RecipeRow[],
  multiplier: number
): { stock_item_id: number; quantity: number; unit: string }[] {
  return rows.map((row) => ({
    stock_item_id: row.stock_item_id,
    quantity: Math.round(parseQuantity(row.quantity) * multiplier * 1e6) / 1e6,
    unit: canonicalRecipeUnit(row.unit)
  }))
}
