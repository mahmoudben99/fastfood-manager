import { getDb } from '../connection'

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
