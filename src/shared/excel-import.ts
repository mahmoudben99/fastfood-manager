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
  role: 'cook' | 'server' | 'cleaner' | 'cashier' | 'driver' | 'other'
  pay_full_day: number
  pay_half_day: number
  phone?: string
  category_names: string[]
}

export interface SetupImportIngredient {
  menu_item_name: string
  stock_item_name: string
  quantity: number
  unit: SetupImportRecipeUnit
}

export type SetupImportStockUnit = 'kg' | 'liter' | 'unit'
export type SetupImportRecipeUnit = 'g' | 'kg' | 'ml' | 'liter' | 'unit'

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

// Keep this module import-free: unit tests load it directly with Node's type stripping.
const MASS_KG = ['kg', 'kgs', 'kilo', 'kilos', 'kilogram', 'kilograms', 'kilogramme', 'kilogrammes', 'كغ', 'كلغ', 'كيلو', 'كيلوغرام']
const MASS_G = ['g', 'gr', 'grs', 'gram', 'grams', 'gramme', 'grammes', 'غ', 'غرام']
const VOLUME_L = ['l', 'lt', 'ltr', 'liter', 'liters', 'litre', 'litres', 'لتر']
const VOLUME_ML = ['ml', 'milliliter', 'milliliters', 'millilitre', 'millilitres', 'مل']
const COUNT = ['unit', 'units', 'u', 'pc', 'pcs', 'piece', 'pieces', 'pièce', 'pièces', 'unité', 'unités', 'unite', 'unites', 'وحدة', 'قطعة', 'حبة']

const STOCK_UNIT_ALIASES = new Map<string, SetupImportStockUnit>([
  ...MASS_KG.map((alias) => [alias, 'kg'] as const),
  ...VOLUME_L.map((alias) => [alias, 'liter'] as const),
  ...COUNT.map((alias) => [alias, 'unit'] as const)
])
const RECIPE_UNIT_ALIASES = new Map<string, SetupImportRecipeUnit>([
  ...MASS_G.map((alias) => [alias, 'g'] as const),
  ...MASS_KG.map((alias) => [alias, 'kg'] as const),
  ...VOLUME_ML.map((alias) => [alias, 'ml'] as const),
  ...VOLUME_L.map((alias) => [alias, 'liter'] as const),
  ...COUNT.map((alias) => [alias, 'unit'] as const)
])

function unitKey(value: string): string {
  return value.trim().normalize('NFKC').toLocaleLowerCase('fr-FR').replace(/\.$/, '')
}

/** "KG", "Kilo", "litre", "L", "pcs", "pièce", "وحدة" … → kg | liter | unit. */
export function normalizeStockUnit(value: string): SetupImportStockUnit | undefined {
  return STOCK_UNIT_ALIASES.get(unitKey(value))
}

/** Recipe units additionally accept g and ml; litre spellings become "liter". */
export function normalizeRecipeUnit(value: string): SetupImportRecipeUnit | undefined {
  return RECIPE_UNIT_ALIASES.get(unitKey(value))
}

/** The recipe units a stock item tracked in `stockUnit` can be written in. */
export function recipeUnitsForStock(stockUnit: SetupImportStockUnit): SetupImportRecipeUnit[] {
  if (stockUnit === 'kg') return ['g', 'kg']
  if (stockUnit === 'liter') return ['ml', 'liter']
  return ['unit']
}

/**
 * Parse a number typed into a spreadsheet cell. "0,5" (French/Arabic decimal comma) is accepted
 * when unambiguous: one comma, no dot, and not shaped like a thousands group ("1,200" could be
 * 1.2 or 1200, so it is refused rather than guessed).
 */
export function parseSetupImportNumber(value: unknown): number | 'ambiguous' | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  let normalized = trimmed
  const commas = (trimmed.match(/,/g) || []).length
  if (commas > 0) {
    if (commas > 1 || trimmed.includes('.')) return undefined
    if (/^[-+]?[1-9]\d{0,2},\d{3}$/.test(trimmed)) return 'ambiguous'
    normalized = trimmed.replace(',', '.')
  }
  if (!/^[-+]?(\d+\.?\d*|\.\d+)$/.test(normalized)) return undefined
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : undefined
}

const WORKER_ROLES = new Set(['cook', 'server', 'cleaner', 'cashier', 'driver', 'other'])

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

const STOCK_UNIT_LABEL: Record<SetupImportStockUnit, string> = { kg: 'kg', liter: 'L (liter)', unit: 'unit (pcs)' }
const RECIPE_UNIT_HINT: Record<SetupImportStockUnit, string> = { kg: 'g or kg', liter: 'ml or L', unit: 'unit' }

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
    const rawUnit = text(row.unit_type, `Stock Items row ${index + 2}: Unit_Type`, 20)!
    const unit = normalizeStockUnit(rawUnit)
    if (!unit) {
      throw new Error(
        `Stock Items row ${index + 2}: Unit_Type "${rawUnit}" is not recognised. Use kg, L (liter) or unit (pcs)`
      )
    }
    return {
      name: text(row.name, `Stock Items row ${index + 2}: Name`)!,
      name_ar: text(row.name_ar, `Stock Items row ${index + 2}: Name_AR`, 200, true),
      name_fr: text(row.name_fr, `Stock Items row ${index + 2}: Name_FR`, 200, true),
      unit_type: unit,
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
        `Workers row ${index + 2}: Role must be cook, server, cleaner, cashier, driver or other`
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
    // Never guess a blank unit: "150" of a kg item used to be imported as 150 kg per sale.
    // A blank unit is only unambiguous for items counted in pieces.
    const rawUnit =
      text(row.unit, `Ingredients row ${index + 2}: Unit`, 20, true) ??
      (stock.unit_type === 'unit' ? 'unit' : undefined)
    if (!rawUnit) {
      throw new Error(
        `Ingredients row ${index + 2}: Unit is required for "${stockName}" ` +
          `(stock counted in ${STOCK_UNIT_LABEL[stock.unit_type]}). Write ${RECIPE_UNIT_HINT[stock.unit_type]}`
      )
    }
    const unit = normalizeRecipeUnit(rawUnit)
    if (!unit) {
      throw new Error(`Ingredients row ${index + 2}: unsupported recipe unit "${rawUnit}"`)
    }
    if (!recipeUnitsForStock(stock.unit_type).includes(unit)) {
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
      unit
    }
  })

  return { categories, menuItems, stockItems, workers, ingredients }
}

export function setupImportNameKey(value: string): string {
  return key(value)
}
