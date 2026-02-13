import { getDb } from '../connection'

export interface StockItem {
  id: number
  name: string
  name_ar: string | null
  name_fr: string | null
  unit_type: string
  quantity: number
  price_per_unit: number
  alert_threshold: number
  is_active: number
  created_at: string
  updated_at: string
}

export interface CreateStockItemInput {
  name: string
  name_ar?: string
  name_fr?: string
  unit_type: string
  quantity?: number
  price_per_unit: number
  alert_threshold?: number
}

export const stockRepo = {
  getAll(): StockItem[] {
    return getDb()
      .prepare('SELECT * FROM stock_items WHERE is_active = 1 ORDER BY name')
      .all() as StockItem[]
  },

  getById(id: number): StockItem | undefined {
    return getDb().prepare('SELECT * FROM stock_items WHERE id = ?').get(id) as
      | StockItem
      | undefined
  },

  getLowStock(): StockItem[] {
    return getDb()
      .prepare(
        'SELECT * FROM stock_items WHERE is_active = 1 AND quantity <= alert_threshold ORDER BY quantity ASC'
      )
      .all() as StockItem[]
  },

  getLowStockCount(): number {
    const result = getDb()
      .prepare(
        'SELECT COUNT(*) as count FROM stock_items WHERE is_active = 1 AND quantity <= alert_threshold'
      )
      .get() as { count: number }
    return result.count
  },

  create(input: CreateStockItemInput): StockItem {
    const result = getDb()
      .prepare(
        `INSERT INTO stock_items (name, name_ar, name_fr, unit_type, quantity, price_per_unit, alert_threshold)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        input.name,
        input.name_ar ?? null,
        input.name_fr ?? null,
        input.unit_type,
        input.quantity ?? 0,
        input.price_per_unit,
        input.alert_threshold ?? 0
      )
    return this.getById(result.lastInsertRowid as number)!
  },

  update(id: number, input: Partial<CreateStockItemInput>): StockItem | undefined {
    const current = this.getById(id)
    if (!current) return undefined

    getDb()
      .prepare(
        `UPDATE stock_items SET name = ?, name_ar = ?, name_fr = ?, unit_type = ?,
         price_per_unit = ?, alert_threshold = ?, updated_at = datetime('now')
         WHERE id = ?`
      )
      .run(
        input.name ?? current.name,
        input.name_ar ?? current.name_ar,
        input.name_fr ?? current.name_fr,
        input.unit_type ?? current.unit_type,
        input.price_per_unit ?? current.price_per_unit,
        input.alert_threshold ?? current.alert_threshold,
        id
      )
    return this.getById(id)
  },

  delete(id: number): boolean {
    const result = getDb()
      .prepare("UPDATE stock_items SET is_active = 0, updated_at = datetime('now') WHERE id = ?")
      .run(id)
    return result.changes > 0
  },

  // Fix: wrong input correction - adjusts cost
  fix(id: number, newQuantity: number, reason: string): StockItem | undefined {
    const current = this.getById(id)
    if (!current) return undefined

    const transaction = getDb().transaction(() => {
      const diff = newQuantity - current.quantity

      // Log the fix adjustment
      getDb()
        .prepare(
          `INSERT INTO stock_adjustments (stock_item_id, adjustment_type, quantity_change, previous_qty, new_qty, affects_cost, reason)
           VALUES (?, 'fix', ?, ?, ?, 1, ?)`
        )
        .run(id, diff, current.quantity, newQuantity, reason)

      // Update quantity
      getDb()
        .prepare(
          "UPDATE stock_items SET quantity = ?, updated_at = datetime('now') WHERE id = ?"
        )
        .run(newQuantity, id)

      // If reducing, add negative purchase to correct cost
      if (diff < 0) {
        getDb()
          .prepare(
            `INSERT INTO stock_purchases (stock_item_id, quantity, price_per_unit, total_cost)
             VALUES (?, ?, ?, ?)`
          )
          .run(id, diff, current.price_per_unit, diff * current.price_per_unit)
      }
    })

    transaction()
    return this.getById(id)
  },

  // Adjust: consumption/waste - no cost change
  adjust(id: number, newQuantity: number, reason: string): StockItem | undefined {
    const current = this.getById(id)
    if (!current) return undefined

    const diff = newQuantity - current.quantity

    getDb()
      .prepare(
        `INSERT INTO stock_adjustments (stock_item_id, adjustment_type, quantity_change, previous_qty, new_qty, affects_cost, reason)
         VALUES (?, 'adjust', ?, ?, ?, 0, ?)`
      )
      .run(id, diff, current.quantity, newQuantity, reason)

    getDb()
      .prepare(
        "UPDATE stock_items SET quantity = ?, updated_at = datetime('now') WHERE id = ?"
      )
      .run(newQuantity, id)

    return this.getById(id)
  },

  // Add purchase
  addPurchase(
    id: number,
    quantity: number,
    pricePerUnit: number
  ): StockItem | undefined {
    const current = this.getById(id)
    if (!current) return undefined

    const totalCost = quantity * pricePerUnit
    const newQuantity = current.quantity + quantity

    // Weighted average price
    const totalValue = current.quantity * current.price_per_unit + totalCost
    const newPricePerUnit = newQuantity > 0 ? totalValue / newQuantity : pricePerUnit

    const transaction = getDb().transaction(() => {
      getDb()
        .prepare(
          `INSERT INTO stock_purchases (stock_item_id, quantity, price_per_unit, total_cost)
           VALUES (?, ?, ?, ?)`
        )
        .run(id, quantity, pricePerUnit, totalCost)

      getDb()
        .prepare(
          `INSERT INTO stock_adjustments (stock_item_id, adjustment_type, quantity_change, previous_qty, new_qty, affects_cost, reason)
           VALUES (?, 'purchase', ?, ?, ?, 1, ?)`
        )
        .run(id, quantity, current.quantity, newQuantity, `Purchase: ${quantity} @ ${pricePerUnit}`)

      getDb()
        .prepare(
          "UPDATE stock_items SET quantity = ?, price_per_unit = ?, updated_at = datetime('now') WHERE id = ?"
        )
        .run(newQuantity, newPricePerUnit, id)
    })

    transaction()
    return this.getById(id)
  },

  // Deduct stock (used by order system)
  deduct(id: number, amount: number): { success: boolean; newQuantity: number } {
    const current = this.getById(id)
    if (!current) return { success: false, newQuantity: 0 }

    const newQuantity = current.quantity - amount

    getDb()
      .prepare(
        "UPDATE stock_items SET quantity = ?, updated_at = datetime('now') WHERE id = ?"
      )
      .run(newQuantity, id)

    return { success: true, newQuantity }
  }
}
