import { getDb } from '../connection'

export interface Category {
  id: number
  name: string
  name_ar: string | null
  name_fr: string | null
  sort_order: number
  icon: string | null
  is_active: number
  created_at: string
  updated_at: string
}

/** Optional text fields: undefined = leave unchanged, null or '' = clear. */
export interface CreateCategoryInput {
  name: string
  name_ar?: string | null
  name_fr?: string | null
  sort_order?: number
  icon?: string | null
}

function requiredName(value: unknown): string {
  const name = typeof value === 'string' ? value.trim() : ''
  if (!name) throw new Error('Category name is required')
  if (name.length > 200) throw new Error('Category name is longer than 200 characters')
  return name
}

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

export const categoriesRepo = {
  /** Active categories only — every picker, the POS, tablets and cloud sync list these. */
  getAll(): Category[] {
    return getDb()
      .prepare('SELECT * FROM categories WHERE is_active = 1 ORDER BY sort_order, id')
      .all() as Category[]
  },

  /** Any category, deleted or not (historical lookups). */
  getById(id: number): Category | undefined {
    return getDb().prepare('SELECT * FROM categories WHERE id = ?').get(id) as
      | Category
      | undefined
  },

  create(input: CreateCategoryInput): Category {
    const name = requiredName(input?.name)
    const maxOrder = getDb()
      .prepare('SELECT MAX(sort_order) as max_order FROM categories WHERE is_active = 1')
      .get() as { max_order: number | null }
    const sortOrder = Number.isInteger(input.sort_order)
      ? (input.sort_order as number)
      : (maxOrder.max_order ?? -1) + 1

    const result = getDb()
      .prepare(
        `INSERT INTO categories (name, name_ar, name_fr, sort_order, icon)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(
        name,
        optionalText(input.name_ar, 'Arabic name', 200) ?? null,
        optionalText(input.name_fr, 'French name', 200) ?? null,
        sortOrder,
        optionalText(input.icon, 'Category icon', 32) ?? null
      )

    return this.getById(result.lastInsertRowid as number)!
  },

  update(id: number, input: Partial<CreateCategoryInput>): Category | undefined {
    const current = this.getById(id)
    if (!current) return undefined
    const name = input.name === undefined ? current.name : requiredName(input.name)

    getDb()
      .prepare(
        `UPDATE categories SET name = ?, name_ar = ?, name_fr = ?, sort_order = ?, icon = ?, updated_at = datetime('now')
         WHERE id = ?`
      )
      .run(
        name,
        pick(optionalText(input.name_ar, 'Arabic name', 200), current.name_ar),
        pick(optionalText(input.name_fr, 'French name', 200), current.name_fr),
        Number.isInteger(input.sort_order) ? (input.sort_order as number) : current.sort_order,
        pick(optionalText(input.icon, 'Category icon', 32), current.icon),
        id
      )

    return this.getById(id)
  },

  /** Number of active (sellable) menu items still filed under this category. */
  countActiveItems(id: number): number {
    const row = getDb()
      .prepare('SELECT COUNT(*) AS count FROM menu_items WHERE category_id = ? AND is_active = 1')
      .get(id) as { count: number }
    return row.count
  },

  /**
   * Soft delete. A hard DELETE broke on the foreign key held by deleted menu items and order
   * history. A category that still holds active items is refused so nothing disappears silently.
   */
  delete(id: number): boolean {
    const current = this.getById(id)
    if (!current || current.is_active !== 1) return false
    const activeItems = this.countActiveItems(id)
    if (activeItems > 0) {
      throw new Error(
        `Category "${current.name}" still has ${activeItems} active menu item(s). ` +
          'Move them to another category or delete them first.'
      )
    }
    const result = getDb()
      .prepare("UPDATE categories SET is_active = 0, updated_at = datetime('now') WHERE id = ?")
      .run(id)
    return result.changes > 0
  },

  reorder(orderedIds: number[]): void {
    if (!Array.isArray(orderedIds) || orderedIds.some((id) => !Number.isInteger(id) || id <= 0)) {
      throw new Error('Category order must be a list of category ids')
    }
    const stmt = getDb().prepare('UPDATE categories SET sort_order = ? WHERE id = ?')
    const transaction = getDb().transaction((ids: number[]) => {
      ids.forEach((id, index) => {
        stmt.run(index, id)
      })
    })
    transaction(orderedIds)
  },

  createMany(inputs: CreateCategoryInput[]): Category[] {
    const stmt = getDb().prepare(
      `INSERT INTO categories (name, name_ar, name_fr, sort_order, icon)
       VALUES (?, ?, ?, ?, ?)`
    )
    const transaction = getDb().transaction((items: CreateCategoryInput[]) => {
      items.forEach((input, index) => {
        stmt.run(
          input.name,
          input.name_ar ?? null,
          input.name_fr ?? null,
          input.sort_order ?? index,
          input.icon ?? null
        )
      })
    })
    transaction(inputs)
    return this.getAll()
  }
}
