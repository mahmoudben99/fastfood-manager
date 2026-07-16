const UNIT_ALIASES: Record<string, string> = {
  kg: 'kg', kilogram: 'kg', kilograms: 'kg',
  g: 'g', gram: 'g', grams: 'g',
  l: 'liter', litre: 'liter', litres: 'liter', liter: 'liter', liters: 'liter',
  ml: 'ml', milliliter: 'ml', milliliters: 'ml', millilitre: 'ml', millilitres: 'ml',
  unit: 'unit', units: 'unit', piece: 'unit', pieces: 'unit', pcs: 'unit'
}

function normalized(unit: string | null | undefined): string {
  return UNIT_ALIASES[String(unit || '').trim().toLowerCase()] || String(unit || '').trim().toLowerCase()
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

  const from = normalized(recipeUnit)
  const to = normalized(stockUnit)
  if (from === to) return recipeQuantity
  if (from === 'g' && to === 'kg') return recipeQuantity / 1000
  if (from === 'kg' && to === 'g') return recipeQuantity * 1000
  if (from === 'ml' && to === 'liter') return recipeQuantity / 1000
  if (from === 'liter' && to === 'ml') return recipeQuantity * 1000

  throw new Error(`Recipe unit ${recipeUnit} is incompatible with stock unit ${stockUnit}`)
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
