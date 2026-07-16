import { recipeQuantityInStockUnits } from './stock-units'

export interface RecipeStockRow { id: number; name: string; unit_type: string; is_active: number }
export interface RecipeIngredientInput { stock_item_id: number; quantity: number; unit: string }

export function validateRecipeIngredientAgainstStock(ingredient: RecipeIngredientInput, stock: RecipeStockRow | undefined): void {
  if (!stock || stock.is_active !== 1) throw new Error('Every recipe ingredient must reference an active stock item')
  try {
    recipeQuantityInStockUnits(ingredient.quantity, ingredient.unit, stock.unit_type)
  } catch {
    throw new Error(`Recipe unit ${ingredient.unit} is incompatible with ${stock.name} (${stock.unit_type})`)
  }
}
