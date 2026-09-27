// Self-contained on purpose: unit tests import this file directly with Node's type stripping,
// which cannot resolve extensionless relative imports.
const UNIT_ALIASES: Record<string, string> = {
  kg: 'kg', kgs: 'kg', kilo: 'kg', kilos: 'kg', kilogram: 'kg', kilograms: 'kg',
  kilogramme: 'kg', kilogrammes: 'kg',
  g: 'g', gr: 'g', gram: 'g', grams: 'g', gramme: 'g', grammes: 'g',
  l: 'liter', lt: 'liter', ltr: 'liter', litre: 'liter', litres: 'liter', liter: 'liter', liters: 'liter',
  ml: 'ml', milliliter: 'ml', milliliters: 'ml', millilitre: 'ml', millilitres: 'ml',
  unit: 'unit', units: 'unit', piece: 'unit', pieces: 'unit', pc: 'unit', pcs: 'unit'
}

/** Mass (g/kg), volume (ml/liter) or count (unit). Conversions only happen inside one family. */
const UNIT_FAMILY: Record<string, 'mass' | 'volume' | 'count'> = {
  g: 'mass', kg: 'mass', ml: 'volume', liter: 'volume', unit: 'count'
}

/** Base-unit factor inside a family: 1 kg = 1000 g, 1 liter = 1000 ml. */
const UNIT_FACTOR: Record<string, number> = { g: 1, kg: 1000, ml: 1, liter: 1000, unit: 1 }

export function canonicalUnit(unit: string | null | undefined): string {
  const key = String(unit || '').trim().toLowerCase()
  return UNIT_ALIASES[key] || key
}

/** True when a recipe written in `recipeUnit` can be deducted from stock tracked in `stockUnit`. */
export function recipeUnitCompatibleWithStock(recipeUnit: string, stockUnit: string): boolean {
  const recipe = canonicalUnit(recipeUnit)
  const stock = canonicalUnit(stockUnit)
  if (recipe && recipe === stock) return true
  const from = UNIT_FAMILY[recipe]
  return from !== undefined && from === UNIT_FAMILY[stock]
}

/**
 * Convert one recipe quantity into the stock item's base unit.
 * Stock is tracked in kg/liter/unit, while recipes are normally entered in g/ml/unit.
 */
export function recipeQuantityInStockUnits(
  recipeQuantity: number,
  recipeUnit: string,
  stockUnit: string
): number {
  if (!Number.isFinite(recipeQuantity) || recipeQuantity <= 0) {
    throw new Error('Recipe quantity must be a finite number greater than zero')
  }

  const from = canonicalUnit(recipeUnit)
  const to = canonicalUnit(stockUnit)
  if (from === to) return recipeQuantity
  if (!recipeUnitCompatibleWithStock(from, to)) {
    throw new Error(`Recipe unit ${recipeUnit} is incompatible with stock unit ${stockUnit}`)
  }
  return (recipeQuantity * UNIT_FACTOR[from]) / UNIT_FACTOR[to]
}

export function totalRecipeDeduction(
  recipeQuantity: number,
  itemQuantity: number,
  recipeUnit: string,
  stockUnit: string
): number {
  if (!Number.isInteger(itemQuantity) || itemQuantity <= 0) {
    throw new Error('Order quantity must be a positive integer')
  }
  return recipeQuantityInStockUnits(recipeQuantity, recipeUnit, stockUnit) * itemQuantity
}
