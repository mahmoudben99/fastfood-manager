import { getDb } from '../connection'
import { recipeQuantityInStockUnits } from '../../services/stock-units'

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

export interface CreateMenuItemInput {
  name: string
  name_ar?: string
  name_fr?: string
  price: number
  category_id: number
  image_path?: string
  emoji?: string
  ingredients?: { stock_item_id: number; quantity: number; unit: string }[]
}

const ALLOWED_RECIPE_UNITS = new Set(['g', 'kg', 'ml', 'l', 'liter', 'litre', 'unit'])

function validateMenuItem(input: CreateMenuItemInput): void {
  if (!input.name?.trim()) throw new Error('Menu item name is required')
  if (!Number.isFinite(input.price) || input.price < 0 || input.price > 1_000_000_000) {
    throw new Error('Menu price must be a finite number between 0 and 1,000,000,000')
  }
  if (!Number.isInteger(input.category_id) || input.category_id <= 0) {
    throw new Error('A valid category is required')
  }
  const seenStockIds = new Set<number>()
  for (const ingredient of input.ingredients || []) {
    if (!Number.isInteger(ingredient.stock_item_id) || ingredient.stock_item_id <= 0) {
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
    try {
      recipeQuantityInStockUnits(ingredient.quantity, ingredient.unit, stock.unit_type)
    } catch {
      throw new Error(
        `Recipe unit ${ingredient.unit} is incompatible with ${stock.name} (${stock.unit_type})`
      )
    }
  }
}

export const menuRepo = {
  getAll(categoryId?: number): MenuItem[] {
    let query = `
      SELECT mi.*, c.name as category_name
      FROM menu_items mi
      LEFT JOIN categories c ON mi.category_id = c.id
      WHERE mi.is_active = 1
    `
    const params: any[] = []
    if (categoryId) {
      query += ' AND mi.category_id = ?'
      params.push(categoryId)
    }
    query += ' ORDER BY c.sort_order, mi.name'
    return getDb().prepare(query).all(...params) as MenuItem[]
  },

  getById(id: number): MenuItem | undefined {
    const item = getDb()
      .prepare(
        `SELECT mi.*, c.name as category_name
         FROM menu_items mi
         LEFT JOIN categories c ON mi.category_id = c.id
         WHERE mi.id = ?`
      )
      .get(id) as MenuItem | undefined

    if (item) {
      item.ingredients = this.getIngredients(id)
    }
    return item
  },

  /** New orders may only sell active products; historical/edit lookups still use getById(). */
  getActiveById(id: number): MenuItem | undefined {
    const item = getDb()
      .prepare(
        `SELECT mi.*, c.name as category_name
         FROM menu_items mi
         LEFT JOIN categories c ON mi.category_id = c.id
         WHERE mi.id = ? AND mi.is_active = 1`
      )
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
    validateMenuItem(input)
    const transaction = getDb().transaction(() => {
      const result = getDb()
        .prepare(
          `INSERT INTO menu_items (name, name_ar, name_fr, price, category_id, image_path, emoji)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          input.name,
          input.name_ar ?? null,
          input.name_fr ?? null,
          input.price,
          input.category_id,
          input.image_path ?? null,
          input.emoji ?? null
        )

      const menuItemId = result.lastInsertRowid as number

      if (input.ingredients?.length) {
        const stmt = getDb().prepare(
          `INSERT INTO menu_item_ingredients (menu_item_id, stock_item_id, quantity, unit)
           VALUES (?, ?, ?, ?)`
        )
        for (const ing of input.ingredients) {
          stmt.run(menuItemId, ing.stock_item_id, ing.quantity, ing.unit)
        }
      }

      return menuItemId
    })

    const id = transaction()
    return this.getById(id)!
  },

  update(
    id: number,
    input: Partial<CreateMenuItemInput>
  ): MenuItem | undefined {
    const current = this.getById(id)
    if (!current) return undefined
    validateMenuItem({
      name: input.name ?? current.name,
      name_ar: input.name_ar ?? current.name_ar ?? undefined,
      name_fr: input.name_fr ?? current.name_fr ?? undefined,
      price: input.price ?? current.price,
      category_id: input.category_id ?? current.category_id,
      image_path: input.image_path ?? current.image_path ?? undefined,
      emoji: input.emoji ?? current.emoji ?? undefined,
      ingredients: input.ingredients ?? current.ingredients?.map((ingredient) => ({
        stock_item_id: ingredient.stock_item_id,
        quantity: ingredient.quantity,
        unit: ingredient.unit
      }))
    })

    const transaction = getDb().transaction(() => {
      getDb()
        .prepare(
          `UPDATE menu_items SET name = ?, name_ar = ?, name_fr = ?, price = ?,
           category_id = ?, image_path = ?, emoji = ?, updated_at = datetime('now')
           WHERE id = ?`
        )
        .run(
          input.name ?? current.name,
          input.name_ar ?? current.name_ar,
          input.name_fr ?? current.name_fr,
          input.price ?? current.price,
          input.category_id ?? current.category_id,
          input.image_path ?? current.image_path,
          input.emoji !== undefined ? input.emoji : current.emoji,
          id
        )

      if (input.ingredients !== undefined) {
        getDb().prepare('DELETE FROM menu_item_ingredients WHERE menu_item_id = ?').run(id)
        if (input.ingredients.length) {
          const stmt = getDb().prepare(
            `INSERT INTO menu_item_ingredients (menu_item_id, stock_item_id, quantity, unit)
             VALUES (?, ?, ?, ?)`
          )
          for (const ing of input.ingredients) {
            stmt.run(id, ing.stock_item_id, ing.quantity, ing.unit)
          }
        }
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

  hardDelete(id: number): boolean {
    const result = getDb().prepare('DELETE FROM menu_items WHERE id = ?').run(id)
    return result.changes > 0
  }
}
