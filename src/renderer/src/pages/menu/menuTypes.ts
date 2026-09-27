/** Row shapes the catalog admin pages read from window.api (menu, categories, stock). */

export interface MenuRow {
  id: number
  name: string
  name_ar: string | null
  name_fr: string | null
  price: number
  category_id: number
  category_name?: string | null
  category_active?: number
  image_path: string | null
  emoji: string | null
  is_active: number
  /** v4 catalog: the item is a combo (its price = the combo price). */
  is_combo?: number
  /** Manual 86 flag (soldOut.set). */
  is_sold_out?: number
  /** Effective: 86'd by hand, or auto sold-out with a recipe ingredient at 0 stock. */
  sold_out?: number
  ingredients?: { stock_item_id: number; quantity: number; unit: string; stock_item_name?: string | null }[]
}

export interface CategoryRow {
  id: number
  name: string
  name_ar: string | null
  name_fr: string | null
  icon: string | null
  sort_order?: number
}

export interface StockRow {
  id: number
  name: string
  name_ar: string | null
  name_fr: string | null
  unit_type: string
  quantity: number
  price_per_unit: number
  alert_threshold: number
}

/** Per-item facts shown as badges on the menu cards (filled after the first paint). */
export interface ItemFacts {
  /** Option groups the cashier will see for the item. */
  groups: number
  hasRecipe: boolean
  /** Groups added to this item itself (not through its category). */
  itemGroupIds: number[]
}

export type MenuSection = 'items' | 'groups' | 'combos'
