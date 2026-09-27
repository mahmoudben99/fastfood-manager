import { getDb } from '../connection'
import { recipeUnitCompatibleWithStock } from '../../services/stock-units'

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

/** Optional text fields: undefined = leave unchanged (update), null or '' = clear. */
export interface CreateStockItemInput {
  name: string
  name_ar?: string | null
  name_fr?: string | null
  unit_type: string
  quantity?: number
  price_per_unit: number
  alert_threshold?: number
}

export interface StockRecipeUsage {
  menu_item_id: number
  menu_item_name: string
  quantity: number
  unit: string
}

const STOCK_UNITS = new Set(['kg', 'liter', 'unit'])

function optionalText(value: unknown, label: string): string | null | undefined {
  if (value === undefined) return undefined
  if (value === null) return null
  if (typeof value !== 'string') throw new Error(`${label} must be text`)
  const trimmed = value.trim()
  if (trimmed.length > 200) throw new Error(`${label} is longer than 200 characters`)
  return trimmed || null
}

function pick<T>(next: T | undefined, current: T): T {
  return next === undefined ? current : next
}

function usageList(usage: StockRecipeUsage[]): string {
  const names = usage.slice(0, 10).map((row) => `"${row.menu_item_name}"`)
  return usage.length > 10 ? `${names.join(', ')} and ${usage.length - 10} more` : names.join(', ')
}

function finiteAtLeast(value: number, minimum: number, label: string): void {
  if (!Number.isFinite(value) || value < minimum) {
    throw new Error(`${label} must be a finite number of at least ${minimum}`)
  }
}

function validateStockInput(input: CreateStockItemInput): void {
  if (typeof input.name !== 'string' || !input.name.trim()) throw new Error('Stock item name is required')
  if (!STOCK_UNITS.has(input.unit_type)) throw new Error('Stock unit must be kg, liter or unit')
  finiteAtLeast(input.quantity ?? 0, 0, 'Stock quantity')
  finiteAtLeast(input.price_per_unit, 0, 'Stock price')
  finiteAtLeast(input.alert_threshold ?? 0, 0, 'Low-stock threshold')
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

  /** Recipes of ACTIVE menu items that deduct from this stock item. */
  getRecipeUsage(id: number): StockRecipeUsage[] {
    return getDb()
      .prepare(
        `SELECT mi.id AS menu_item_id, mi.name AS menu_item_name, mii.quantity, mii.unit
         FROM menu_item_ingredients mii
         JOIN menu_items mi ON mi.id = mii.menu_item_id
         WHERE mii.stock_item_id = ? AND mi.is_active = 1
         ORDER BY mi.name`
      )
      .all(id) as StockRecipeUsage[]
  },

  create(input: CreateStockItemInput): StockItem {
    validateStockInput(input)
    const result = getDb()
      .prepare(
        `INSERT INTO stock_items (name, name_ar, name_fr, unit_type, quantity, price_per_unit, alert_threshold)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        input.name.trim(),
        optionalText(input.name_ar, 'Arabic name') ?? null,
        optionalText(input.name_fr, 'French name') ?? null,
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
    const next = {
      name: input.name === undefined ? current.name : (input.name as string),
      name_ar: pick(optionalText(input.name_ar, 'Arabic name'), current.name_ar),
      name_fr: pick(optionalText(input.name_fr, 'French name'), current.name_fr),
      unit_type: input.unit_type ?? current.unit_type,
      price_per_unit: input.price_per_unit ?? current.price_per_unit,
      alert_threshold: input.alert_threshold ?? current.alert_threshold
    }
    // Stock can legitimately be negative after sales; only the edited fields are validated here.
    validateStockInput({ ...next, quantity: Math.max(0, current.quantity) })

    // A unit change must not strand existing recipes: every sale of such an item would fail
    // with "Recipe unit g is incompatible with ...". Compatible changes are allowed.
    if (next.unit_type !== current.unit_type) {
      const broken = this.getRecipeUsage(id).filter(
        (row) => !recipeUnitCompatibleWithStock(row.unit, next.unit_type)
      )
      if (broken.length > 0) {
        throw new Error(
          `Cannot change the unit of "${current.name}" from ${current.unit_type} to ${next.unit_type}: ` +
            `the recipe of ${usageList(broken)} uses it. Remove it from ${broken.length === 1 ? 'that recipe' : 'those recipes'}, ` +
            'change the unit, then add it back with a matching unit.'
        )
      }
    }

    getDb()
      .prepare(
        `UPDATE stock_items SET name = ?, name_ar = ?, name_fr = ?, unit_type = ?,
         price_per_unit = ?, alert_threshold = ?, updated_at = datetime('now')
         WHERE id = ?`
      )
      .run(
        next.name.trim(),
        next.name_ar,
        next.name_fr,
        next.unit_type,
        next.price_per_unit,
        next.alert_threshold,
        id
      )
    return this.getById(id)
  },

  delete(id: number): boolean {
    const usage = this.getRecipeUsage(id)
    if (usage.length > 0) {
      throw new Error(
        `This stock item is still used in the recipe of ${usageList(usage)}. Remove it from those recipes first.`
      )
    }
    const result = getDb()
      .prepare("UPDATE stock_items SET is_active = 0, updated_at = datetime('now') WHERE id = ?")
      .run(id)
    return result.changes > 0
  },

  // Fix: wrong input correction - adjusts cost
  fix(id: number, newQuantity: number, reason: string): StockItem | undefined {
    finiteAtLeast(newQuantity, 0, 'Corrected stock quantity')
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
    finiteAtLeast(newQuantity, 0, 'Adjusted stock quantity')
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
    finiteAtLeast(quantity, Number.MIN_VALUE, 'Purchase quantity')
    finiteAtLeast(pricePerUnit, 0, 'Purchase price')
    const current = this.getById(id)
    if (!current) return undefined

    const totalCost = quantity * pricePerUnit
    const newQuantity = current.quantity + quantity

    // Weighted average price. Clamp the on-hand quantity at 0 for the average: stock can go
    // negative (deduct() doesn't floor at 0), and a negative on-hand quantity would poison
    // the weighted average — even flipping price_per_unit negative, which then corrupts
    // every future order's cost snapshot and the profit report. The stored quantity itself
    // (newQuantity) still tracks the real physical count.
    const onHand = Math.max(0, current.quantity)
    const totalValue = onHand * current.price_per_unit + totalCost
    const denom = onHand + quantity
    const newPricePerUnit = denom > 0 ? Math.max(0, totalValue / denom) : pricePerUnit

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
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error('Stock deduction must be a finite number greater than zero')
    }
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
