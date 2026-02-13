import { getDb } from '../connection'

export interface Category {
  id: number
  name: string
  name_ar: string | null
  name_fr: string | null
  sort_order: number
  icon: string | null
  created_at: string
  updated_at: string
}

export interface CreateCategoryInput {
  name: string
  name_ar?: string
  name_fr?: string
  sort_order?: number
  icon?: string
}

export const categoriesRepo = {
  getAll(): Category[] {
    return getDb()
      .prepare('SELECT * FROM categories ORDER BY sort_order, id')
      .all() as Category[]
  },

  getById(id: number): Category | undefined {
    return getDb().prepare('SELECT * FROM categories WHERE id = ?').get(id) as
      | Category
      | undefined
  },

  create(input: CreateCategoryInput): Category {
    const maxOrder = getDb()
      .prepare('SELECT MAX(sort_order) as max_order FROM categories')
      .get() as { max_order: number | null }
    const sortOrder = input.sort_order ?? (maxOrder.max_order ?? -1) + 1

    const result = getDb()
      .prepare(
        `INSERT INTO categories (name, name_ar, name_fr, sort_order, icon)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(input.name, input.name_ar ?? null, input.name_fr ?? null, sortOrder, input.icon ?? null)

    return this.getById(result.lastInsertRowid as number)!
  },

  update(id: number, input: Partial<CreateCategoryInput>): Category | undefined {
    const current = this.getById(id)
    if (!current) return undefined

    getDb()
      .prepare(
        `UPDATE categories SET name = ?, name_ar = ?, name_fr = ?, sort_order = ?, icon = ?, updated_at = datetime('now')
         WHERE id = ?`
      )
      .run(
        input.name ?? current.name,
        input.name_ar ?? current.name_ar,
        input.name_fr ?? current.name_fr,
        input.sort_order ?? current.sort_order,
        input.icon ?? current.icon,
        id
      )

    return this.getById(id)
  },

  delete(id: number): boolean {
    const result = getDb().prepare('DELETE FROM categories WHERE id = ?').run(id)
    return result.changes > 0
  },

  reorder(orderedIds: number[]): void {
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
