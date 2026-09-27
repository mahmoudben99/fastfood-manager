import { getDb } from '../connection'
import { validateRecipeIngredientAgainstStock } from '../../services/recipe-validation'
import { canonicalUnit } from '../../services/stock-units'

export interface MenuItem {
  id: number
  name: string
  name_ar: string | null
  name_fr: string | null
  price: number
  category_id: number
  image_path: string | null
  emoji: string | null
  is_active: number
  created_at: string
  updated_at: string
  category_name?: string
  category_active?: number
  ingredients?: MenuItemIngredient[]
}

export interface MenuItemIngredient {
  id: number
  menu_item_id: number
  stock_item_id: number
  quantity: number
  unit: string
  stock_item_name?: string
  stock_unit_type?: string
}

export interface RecipeIngredientInput {
  stock_item_id: number
  quantity: number
  unit: string
}

/** Optional text fields: undefined = leave unchanged (update), null or '' = clear. */
export interface CreateMenuItemInput {
  name: string
  name_ar?: string | null
  name_fr?: string | null
  price: number
  category_id: number
  image_path?: string | null
  emoji?: string | null
  ingredients?: RecipeIngredientInput[]
}

const ALLOWED_RECIPE_UNITS = new Set(['g', 'kg', 'ml', 'l', 'liter', 'litre', 'unit'])

function optionalText(value: unknown, label: string, maximum: number): string | null | undefined {
  if (value === undefined) return undefined
  if (value === null) return null
  if (typeof value !== 'string') throw new Error(`${label} must be text`)
  const trimmed = value.trim()
  if (trimmed.length > maximum) throw new Error(`${label} is longer than ${maximum} characters`)
  return trimmed || null
}

function pick<T>(next: T | undefined, current: T): T {
  return next === undefined ? current : next
}

function validateMenuFields(
  input: { name: unknown; price: unknown; category_id: unknown },
  requireActiveCategory: boolean
): void {
  if (typeof input.name !== 'string' || !input.name.trim()) throw new Error('Menu item name is required')
  const price = input.price as number
  if (!Number.isFinite(price) || price < 0 || price > 1_000_000_000) {
    throw new Error('Menu price must be a finite number between 0 and 1,000,000,000')
  }
  const categoryId = input.category_id as number
  if (!Number.isInteger(categoryId) || categoryId <= 0) {
    throw new Error('A valid category is required')
  }
  if (requireActiveCategory) {
    const category = getDb()
      .prepare('SELECT is_active FROM categories WHERE id = ?')
      .get(categoryId) as { is_active: number } | undefined
    if (!category || category.is_active !== 1) throw new Error('The selected category no longer exists')
  }
}

function validateRecipe(ingredients: RecipeIngredientInput[]): void {
  if (!Array.isArray(ingredients)) throw new Error('Recipe ingredients must be a list')
  const seenStockIds = new Set<number>()
  for (const ingredient of ingredients) {
    if (!Number.isInteger(ingredient?.stock_item_id) || ingredient.stock_item_id <= 0) {
      throw new Error('Every recipe ingredient must reference a valid stock item')
    }
    if (seenStockIds.has(ingredient.stock_item_id)) {
      throw new Error('The same stock item cannot appear twice in one recipe')
    }
    seenStockIds.add(ingredient.stock_item_id)
    if (!Number.isFinite(ingredient.quantity) || ingredient.quantity <= 0) {
      throw new Error('Recipe quantities must be finite numbers greater than zero')
    }
    if (!ALLOWED_RECIPE_UNITS.has(String(ingredient.unit || '').trim().toLowerCase())) {
      throw new Error(`Unsupported recipe unit: ${ingredient.unit}`)
    }
    const stock = getDb()
      .prepare('SELECT name, unit_type, is_active FROM stock_items WHERE id = ?')
      .get(ingredient.stock_item_id) as
      | { name: string; unit_type: string; is_active: number }
      | undefined
    if (!stock || stock.is_active !== 1) {
      throw new Error('Every recipe ingredient must reference an active stock item')
    }
    validateRecipeIngredientAgainstStock(ingredient, { id: ingredient.stock_item_id, ...stock })
  }
}

function recipeKey(ingredients: RecipeIngredientInput[]): string {
  return ingredients
    .map((i) => `${i.stock_item_id}:${Number(i.quantity)}:${canonicalUnit(i.unit)}`)
    .sort()
    .join('|')
}

function insertRecipe(menuItemId: number, ingredients: RecipeIngredientInput[]): void {
  if (!ingredients.length) return
  const stmt = getDb().prepare(
    `INSERT INTO menu_item_ingredients (menu_item_id, stock_item_id, quantity, unit)
     VALUES (?, ?, ?, ?)`
  )
  for (const ing of ingredients) {
    stmt.run(menuItemId, ing.stock_item_id, ing.quantity, String(ing.unit).trim().toLowerCase())
  }
}

const SELECT_WITH_CATEGORY = `
  SELECT mi.*, c.name as category_name, c.is_active as category_active
  FROM menu_items mi
  LEFT JOIN categories c ON mi.category_id = c.id`

export const menuRepo = {
  getAll(categoryId?: number): MenuItem[] {
    let query = `${SELECT_WITH_CATEGORY} WHERE mi.is_active = 1`
    const params: any[] = []
    if (categoryId) {
      query += ' AND mi.category_id = ?'
      params.push(categoryId)
    }
    query += ' ORDER BY c.sort_order, mi.name'
    return getDb().prepare(query).all(...params) as MenuItem[]
  },

  /** Soft-deleted items, most recently deleted first (for the "Show deleted" view). */
  getDeleted(): MenuItem[] {
    return getDb()
      .prepare(`${SELECT_WITH_CATEGORY} WHERE mi.is_active = 0 ORDER BY mi.updated_at DESC, mi.id DESC`)
      .all() as MenuItem[]
  },

  getById(id: number): MenuItem | undefined {
    const item = getDb().prepare(`${SELECT_WITH_CATEGORY} WHERE mi.id = ?`).get(id) as MenuItem | undefined

    if (item) {
      item.ingredients = this.getIngredients(id)
    }
    return item
  },

  /** New orders may only sell active products; historical/edit lookups still use getById(). */
  getActiveById(id: number): MenuItem | undefined {
    const item = getDb()
      .prepare(`${SELECT_WITH_CATEGORY} WHERE mi.id = ? AND mi.is_active = 1`)
      .get(id) as MenuItem | undefined
    if (item) item.ingredients = this.getIngredients(id)
    return item
  },

  getIngredients(menuItemId: number): MenuItemIngredient[] {
    return getDb()
      .prepare(
        `SELECT mii.*, si.name as stock_item_name, si.unit_type as stock_unit_type
         FROM menu_item_ingredients mii
         LEFT JOIN stock_items si ON mii.stock_item_id = si.id
         WHERE mii.menu_item_id = ?`
      )
      .all(menuItemId) as MenuItemIngredient[]
  },

  create(input: CreateMenuItemInput): MenuItem {
    validateMenuFields(input, true)
    validateRecipe(input.ingredients || [])
    const transaction = getDb().transaction(() => {
      const result = getDb()
        .prepare(
          `INSERT INTO menu_items (name, name_ar, name_fr, price, category_id, image_path, emoji)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          input.name.trim(),
          optionalText(input.name_ar, 'Arabic name', 200) ?? null,
          optionalText(input.name_fr, 'French name', 200) ?? null,
          input.price,
          input.category_id,
          optionalText(input.image_path, 'Image path', 4096) ?? null,
          optionalText(input.emoji, 'Emoji', 32) ?? null
        )

      const menuItemId = result.lastInsertRowid as number
      insertRecipe(menuItemId, input.ingredients || [])
      return menuItemId
    })

    const id = transaction()
    return this.getById(id)!
  },

  /**
   * Partial update. The recipe is validated and rewritten only when `ingredients` is supplied
   * AND differs from the stored recipe, so a price or name edit is never blocked by an older
   * recipe problem (the editor flags those rows separately).
   */
  update(id: number, input: Partial<CreateMenuItemInput>): MenuItem | undefined {
    const current = this.getById(id)
    if (!current) return undefined
    const next = {
      name: input.name === undefined ? current.name : input.name,
      name_ar: pick(optionalText(input.name_ar, 'Arabic name', 200), current.name_ar),
      name_fr: pick(optionalText(input.name_fr, 'French name', 200), current.name_fr),
      price: input.price === undefined ? current.price : input.price,
      category_id: input.category_id === undefined ? current.category_id : input.category_id,
      image_path: pick(optionalText(input.image_path, 'Image path', 4096), current.image_path),
      emoji: pick(optionalText(input.emoji, 'Emoji', 32), current.emoji)
    }
    validateMenuFields(next, next.category_id !== current.category_id)

    const currentRecipe = (current.ingredients || []).map((ingredient) => ({
      stock_item_id: ingredient.stock_item_id,
      quantity: ingredient.quantity,
      unit: ingredient.unit
    }))
    const recipeChanged =
      input.ingredients !== undefined && recipeKey(input.ingredients) !== recipeKey(currentRecipe)
    if (recipeChanged) validateRecipe(input.ingredients!)

    const transaction = getDb().transaction(() => {
      getDb()
        .prepare(
          `UPDATE menu_items SET name = ?, name_ar = ?, name_fr = ?, price = ?,
           category_id = ?, image_path = ?, emoji = ?, updated_at = datetime('now')
           WHERE id = ?`
        )
        .run(
          String(next.name).trim(),
          next.name_ar,
          next.name_fr,
          next.price,
          next.category_id,
          next.image_path,
          next.emoji,
          id
        )

      if (recipeChanged) {
        getDb().prepare('DELETE FROM menu_item_ingredients WHERE menu_item_id = ?').run(id)
        insertRecipe(id, input.ingredients!)
      }
    })

    transaction()
    return this.getById(id)
  },

  delete(id: number): boolean {
    const result = getDb()
      .prepare("UPDATE menu_items SET is_active = 0, updated_at = datetime('now') WHERE id = ?")
      .run(id)
    return result.changes > 0
  },

  /**
   * Undo a soft delete. If the item's category was deleted in the meantime it is restored too,
   * otherwise the item would be sellable but invisible on the order screen.
   */
  restore(id: number): { item: MenuItem; categoryRestored: boolean } | undefined {
    const current = this.getById(id)
    if (!current) return undefined
    const categoryRestored = current.category_active === 0
    getDb().transaction(() => {
      getDb()
        .prepare("UPDATE menu_items SET is_active = 1, updated_at = datetime('now') WHERE id = ?")
        .run(id)
      if (categoryRestored) {
        getDb()
          .prepare("UPDATE categories SET is_active = 1, updated_at = datetime('now') WHERE id = ?")
          .run(current.category_id)
      }
    })()
    return { item: this.getById(id)!, categoryRestored }
  },

  hardDelete(id: number): boolean {
    const result = getDb().prepare('DELETE FROM menu_items WHERE id = ?').run(id)
    return result.changes > 0
  }
}
