export interface SetupImportCategory {
  name: string
  name_ar?: string
  name_fr?: string
  icon?: string
}

export interface SetupImportMenuItem {
  name: string
  name_ar?: string
  name_fr?: string
  price: number
  category_name: string
  emoji?: string
}

export interface SetupImportStockItem {
  name: string
  name_ar?: string
  name_fr?: string
  unit_type: 'kg' | 'liter' | 'unit'
  quantity: number
  price_per_unit: number
  alert_threshold: number
}

export interface SetupImportWorker {
  name: string
  role: 'cook' | 'server' | 'cleaner' | 'cashier' | 'other'
  pay_full_day: number
  pay_half_day: number
  phone?: string
  category_names: string[]
}

export interface SetupImportIngredient {
  menu_item_name: string
  stock_item_name: string
  quantity: number
  unit: 'g' | 'kg' | 'ml' | 'l' | 'liter' | 'litre' | 'unit'
}

export interface SetupImportPayload {
  categories: SetupImportCategory[]
  menuItems: SetupImportMenuItem[]
  stockItems: SetupImportStockItem[]
  workers: SetupImportWorker[]
  ingredients: SetupImportIngredient[]
}

export interface SetupImportCounts {
  categories: number
  menuItems: number
  stockItems: number
  workers: number
  ingredients: number
}

export interface SetupImportResult {
  success: true
  snapshot: string
  counts: SetupImportCounts
  total: number
}

export const SETUP_IMPORT_LIMITS = {
  fileBytes: 10 * 1024 * 1024,
  categories: 200,
  menuItems: 5_000,
  stockItems: 5_000,
  workers: 1_000,
  ingredients: 25_000
} as const

const STOCK_UNITS = new Set(['kg', 'liter', 'unit'])
const RECIPE_UNITS = new Set(['g', 'kg', 'ml', 'l', 'liter', 'litre', 'unit'])
const WORKER_ROLES = new Set(['cook', 'server', 'cleaner', 'cashier', 'other'])

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`)
  }
  return value as Record<string, unknown>
}

function array(value: unknown, label: string, maximum: number): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`)
  if (value.length > maximum) {
    throw new Error(`${label} has ${value.length} rows; the maximum is ${maximum}`)
  }
  return value
}

function text(
  value: unknown,
  label: string,
  maximum = 200,
  optional = false
): string | undefined {
  if ((value === undefined || value === null || value === '') && optional) return undefined
  if (typeof value !== 'string') throw new Error(`${label} must be text`)
  const normalized = value.trim().normalize('NFKC')
  if (!normalized && optional) return undefined
  if (!normalized) throw new Error(`${label} is required`)
  if (normalized.length > maximum) {
    throw new Error(`${label} is longer than ${maximum} characters`)
  }
  return normalized
}

function numberInRange(
  value: unknown,
  label: string,
  minimum: number,
  maximum = 1_000_000_000
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number`)
  }
  if (value < minimum || value > maximum) {
    throw new Error(`${label} must be between ${minimum} and ${maximum}`)
  }
  return value
}

function key(value: string): string {
  return value.trim().normalize('NFKC').toLocaleLowerCase('en-US')
}

function assertUniqueNames(items: { name: string }[], label: string): void {
  const seen = new Set<string>()
  for (const item of items) {
    const normalized = key(item.name)
    if (seen.has(normalized)) throw new Error(`${label} contains duplicate name "${item.name}"`)
    seen.add(normalized)
  }
}

function recipeUnitMatchesStock(recipeUnit: string, stockUnit: string): boolean {
  if (stockUnit === 'kg') return recipeUnit === 'g' || recipeUnit === 'kg'
  if (stockUnit === 'liter') {
    return recipeUnit === 'ml' || recipeUnit === 'l' || recipeUnit === 'liter' || recipeUnit === 'litre'
  }
  return stockUnit === 'unit' && recipeUnit === 'unit'
}

/**
 * Treat every IPC payload as untrusted. This normalizes it and verifies every cross-sheet
 * reference before the main process starts its all-or-nothing setup import transaction.
 */
export function validateSetupImportPayload(value: unknown): SetupImportPayload {
  const root = record(value, 'Excel import')
  const rawCategories = array(
    root.categories,
    'Categories',
    SETUP_IMPORT_LIMITS.categories
  )
  const rawMenuItems = array(
    root.menuItems,
    'Menu Items',
    SETUP_IMPORT_LIMITS.menuItems
  )
  const rawStockItems = array(
    root.stockItems,
    'Stock Items',
    SETUP_IMPORT_LIMITS.stockItems
  )
  const rawWorkers = array(root.workers, 'Workers', SETUP_IMPORT_LIMITS.workers)
  const rawIngredients = array(
    root.ingredients,
    'Ingredients',
    SETUP_IMPORT_LIMITS.ingredients
  )

  if (rawCategories.length === 0) throw new Error('Categories must contain at least one row')
  if (rawMenuItems.length === 0) throw new Error('Menu Items must contain at least one row')

  const categories: SetupImportCategory[] = rawCategories.map((value, index) => {
    const row = record(value, `Categories row ${index + 2}`)
    return {
      name: text(row.name, `Categories row ${index + 2}: Name`)!,
      name_ar: text(row.name_ar, `Categories row ${index + 2}: Name_AR`, 200, true),
      name_fr: text(row.name_fr, `Categories row ${index + 2}: Name_FR`, 200, true),
      icon: text(row.icon, `Categories row ${index + 2}: Emoji`, 32, true)
    }
  })
  assertUniqueNames(categories, 'Categories')
  const categoryNames = new Set(categories.map((category) => key(category.name)))

  const stockItems: SetupImportStockItem[] = rawStockItems.map((value, index) => {
    const row = record(value, `Stock Items row ${index + 2}`)
    const unit = text(row.unit_type, `Stock Items row ${index + 2}: Unit_Type`, 20)!
      .toLocaleLowerCase('en-US')
    if (!STOCK_UNITS.has(unit)) {
      throw new Error(`Stock Items row ${index + 2}: Unit_Type must be kg, liter or unit`)
    }
    return {
      name: text(row.name, `Stock Items row ${index + 2}: Name`)!,
      name_ar: text(row.name_ar, `Stock Items row ${index + 2}: Name_AR`, 200, true),
      name_fr: text(row.name_fr, `Stock Items row ${index + 2}: Name_FR`, 200, true),
      unit_type: unit as SetupImportStockItem['unit_type'],
      quantity: numberInRange(row.quantity, `Stock Items row ${index + 2}: Initial_Quantity`, 0),
      price_per_unit: numberInRange(
        row.price_per_unit,
        `Stock Items row ${index + 2}: Price_Per_Unit`,
        0
      ),
      alert_threshold: numberInRange(
        row.alert_threshold,
        `Stock Items row ${index + 2}: Alert_Threshold`,
        0
      )
    }
  })
  assertUniqueNames(stockItems, 'Stock Items')
  const stockByName = new Map(stockItems.map((stock) => [key(stock.name), stock]))

  const menuItems: SetupImportMenuItem[] = rawMenuItems.map((value, index) => {
    const row = record(value, `Menu Items row ${index + 2}`)
    const categoryName = text(
      row.category_name,
      `Menu Items row ${index + 2}: Category_Name`
    )!
    if (!categoryNames.has(key(categoryName))) {
      throw new Error(
        `Menu Items row ${index + 2}: category "${categoryName}" does not exist in Categories`
      )
    }
    return {
      name: text(row.name, `Menu Items row ${index + 2}: Name`)!,
      name_ar: text(row.name_ar, `Menu Items row ${index + 2}: Name_AR`, 200, true),
      name_fr: text(row.name_fr, `Menu Items row ${index + 2}: Name_FR`, 200, true),
      price: numberInRange(row.price, `Menu Items row ${index + 2}: Price`, 0),
      category_name: categoryName,
      emoji: text(row.emoji, `Menu Items row ${index + 2}: Emoji`, 32, true)
    }
  })
  assertUniqueNames(menuItems, 'Menu Items')
  const menuNames = new Set(menuItems.map((item) => key(item.name)))

  const workers: SetupImportWorker[] = rawWorkers.map((value, index) => {
    const row = record(value, `Workers row ${index + 2}`)
    const role = text(row.role, `Workers row ${index + 2}: Role`, 20)!
      .toLocaleLowerCase('en-US')
    if (!WORKER_ROLES.has(role)) {
      throw new Error(
        `Workers row ${index + 2}: Role must be cook, server, cleaner, cashier or other`
      )
    }
    const categoryValues = array(
      row.category_names,
      `Workers row ${index + 2}: Categories`,
      SETUP_IMPORT_LIMITS.categories
    )
    const category_names = categoryValues.map((category, categoryIndex) =>
      text(
        category,
        `Workers row ${index + 2}: Categories value ${categoryIndex + 1}`
      )!
    )
    const seenCategories = new Set<string>()
    for (const categoryName of category_names) {
      const normalized = key(categoryName)
      if (!categoryNames.has(normalized)) {
        throw new Error(
          `Workers row ${index + 2}: category "${categoryName}" does not exist in Categories`
        )
      }
      if (seenCategories.has(normalized)) {
        throw new Error(
          `Workers row ${index + 2}: category "${categoryName}" is listed more than once`
        )
      }
      seenCategories.add(normalized)
    }
    return {
      name: text(row.name, `Workers row ${index + 2}: Name`)!,
      role: role as SetupImportWorker['role'],
      pay_full_day: numberInRange(row.pay_full_day, `Workers row ${index + 2}: Pay_Full_Day`, 0),
      pay_half_day: numberInRange(row.pay_half_day, `Workers row ${index + 2}: Pay_Half_Day`, 0),
      phone: text(row.phone, `Workers row ${index + 2}: Phone`, 80, true),
      category_names
    }
  })
  assertUniqueNames(workers, 'Workers')

  const ingredientPairs = new Set<string>()
  const ingredients: SetupImportIngredient[] = rawIngredients.map((value, index) => {
    const row = record(value, `Ingredients row ${index + 2}`)
    const menuName = text(
      row.menu_item_name,
      `Ingredients row ${index + 2}: Menu_Item_Name`
    )!
    const stockName = text(
      row.stock_item_name,
      `Ingredients row ${index + 2}: Stock_Item_Name`
    )!
    if (!menuNames.has(key(menuName))) {
      throw new Error(
        `Ingredients row ${index + 2}: menu item "${menuName}" does not exist in Menu Items`
      )
    }
    const stock = stockByName.get(key(stockName))
    if (!stock) {
      throw new Error(
        `Ingredients row ${index + 2}: stock item "${stockName}" does not exist in Stock Items`
      )
    }
    const unit = text(row.unit, `Ingredients row ${index + 2}: Unit`, 20)!
      .toLocaleLowerCase('en-US')
    if (!RECIPE_UNITS.has(unit)) {
      throw new Error(`Ingredients row ${index + 2}: unsupported recipe unit "${unit}"`)
    }
    if (!recipeUnitMatchesStock(unit, stock.unit_type)) {
      throw new Error(
        `Ingredients row ${index + 2}: ${unit} is incompatible with stock unit ${stock.unit_type}`
      )
    }
    const pair = `${key(menuName)}\u0000${key(stockName)}`
    if (ingredientPairs.has(pair)) {
      throw new Error(
        `Ingredients row ${index + 2}: "${stockName}" appears twice in recipe "${menuName}"`
      )
    }
    ingredientPairs.add(pair)
    return {
      menu_item_name: menuName,
      stock_item_name: stockName,
      quantity: numberInRange(row.quantity, `Ingredients row ${index + 2}: Quantity`, Number.MIN_VALUE),
      unit: unit as SetupImportIngredient['unit']
    }
  })

  return { categories, menuItems, stockItems, workers, ingredients }
}

export function setupImportNameKey(value: string): string {
  return key(value)
}
