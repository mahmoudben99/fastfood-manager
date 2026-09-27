/**
 * Insights ("smart" features) — shared contract between the main process and the renderer.
 * Pure: no side effects (only re-exports ./insights-settings). Every shape returned by the
 * `window.api.insights.*` IPC lives here so the admin UI can type its props against it.
 *
 * Dates are restaurant-local calendar dates `YYYY-MM-DD` (Africa/Algiers, UTC+1, no DST).
 * Money is in the app currency (DA), rounded to whole dinars unless noted.
 */

export * from './insights-settings'

// ─── Common ───────────────────────────────────────────────────────────────────

export interface LocalizedName {
  name: string
  name_ar: string | null
  name_fr: string | null
}

/** Stock units as stored on stock_items.unit_type. */
export type StockUnit = 'kg' | 'liter' | 'unit' | string

// ─── 1. Prep forecast + shopping list ─────────────────────────────────────────

/**
 * weekday          same weekday over the last 6 weeks, recent weeks weigh more (≥ 2 open samples)
 * daily_average    too little same-weekday history: average of the open days in the last 28 days
 * none             no sales history at all
 */
export type ForecastMethod = 'weekday' | 'daily_average' | 'none'

export interface ForecastItem extends LocalizedName {
  menuItemId: number
  categoryId: number
  /** Expected units, one decimal. */
  expected: number
  /** Whole units to prep (Math.round of expected). */
  rounded: number
}

export interface PrepForecast {
  date: string
  /** 0 = Sunday … 6 = Saturday. */
  weekday: number
  method: ForecastMethod
  /** Same-weekday (or daily-average) open days the forecast is based on. */
  sampleDays: string[]
  /** 'high' ≥ 4 weekday samples, 'medium' 2–3, 'low' fallback/none. */
  confidence: 'high' | 'medium' | 'low'
  /** Multiplier applied from the recent trend (1 when disabled or not enough data). */
  trendFactor: number
  expectedOrders: number
  expectedRevenue: number
  /** Active menu items with expected > 0, highest first. */
  items: ForecastItem[]
}

export interface ShoppingListUsage {
  menuItemId: number
  name: string
  /** Stock units this menu item needs today. */
  quantity: number
}

export interface ShoppingListItem extends LocalizedName {
  stockItemId: number
  unit: StockUnit
  /** Stock still needed for the date: forecast need − already consumed by its orders (stock units). */
  need: number
  /** Stock already deducted by the date's non-cancelled orders (0 before service / future dates). */
  consumedToday: number
  /** Current stock (can be negative after sales). */
  have: number
  threshold: number
  /** max(0, need + threshold − max(0, have)), unrounded. */
  toBuyExact: number
  /** Rounded up to a sensible purchase step (0.1/0.5/1 kg·L, whole units). */
  toBuy: number
  /** Latest purchase price per unit, else the stock item's price. */
  unitCost: number
  estCost: number
  /** Stock does not even cover today's forecast (have < need). */
  critical: boolean
  reason: 'forecast' | 'low_stock' | 'both'
  /** Top consumers today (max 3). */
  usedBy: ShoppingListUsage[]
}

export interface ShoppingList {
  date: string
  forecast: PrepForecast
  items: ShoppingListItem[]
  totalEstCost: number
  criticalCount: number
  /** Recipe lines skipped (unit mismatch / inactive stock), human-readable. */
  warnings: string[]
}

// ─── 2. Menu profit check ─────────────────────────────────────────────────────

export type MenuQuadrant = 'star' | 'plowhorse' | 'puzzle' | 'dog'
export type MenuProfitFlag = 'low_margin' | 'no_recipe' | 'cost_increase' | 'unit_mismatch' | 'missing_cost'

export interface MenuIngredientCost extends LocalizedName {
  stockItemId: number
  recipeQuantity: number
  recipeUnit: string
  /** Recipe quantity converted to the stock unit (null on a unit mismatch). */
  stockQuantity: number | null
  stockUnit: StockUnit
  unitCost: number
  cost: number
}

export interface CostIncrease {
  /** Menu item cost change over the last 30 days, percent (e.g. 14.2). */
  pct: number
  previousCost: number
  currentCost: number
  /** Ingredient responsible for most of the increase. */
  stockItemId: number
  stockItemName: string
  /** That ingredient's own unit-price change, percent. */
  ingredientPct: number
}

export interface MenuProfitItem extends LocalizedName {
  menuItemId: number
  categoryId: number
  categoryName: string
  price: number
  /** Recipe cost at latest unit costs; null without a recipe. */
  cost: number | null
  marginDa: number | null
  marginPct: number | null
  foodCostPct: number | null
  qtySold: number
  revenue: number
  quadrant: MenuQuadrant | null
  flags: MenuProfitFlag[]
  costIncrease: CostIncrease | null
  ingredients: MenuIngredientCost[]
}

export interface StockPriceChange extends LocalizedName {
  stockItemId: number
  unit: StockUnit
  fromPrice: number
  toPrice: number
  pct: number
}

export interface MenuProfitReport {
  startDate: string
  endDate: string
  marginWarnPct: number
  /** Quadrant split lines: qty-weighted average margin (DA) and 70 % of the average item share. */
  averageMarginDa: number
  popularityThreshold: number
  items: MenuProfitItem[]
  /** Stock items whose purchase price rose > 10 % over the last 30 days. */
  priceIncreases: StockPriceChange[]
  counts: { lowMargin: number; noRecipe: number; costIncrease: number; star: number; plowhorse: number; puzzle: number; dog: number }
}

// ─── 3. Upsell ────────────────────────────────────────────────────────────────

export interface UpsellSuggestion extends LocalizedName {
  menuItemId: number
  categoryId: number
  price: number
  emoji: string | null
  /** P(suggested | anchor), 0..1. */
  probability: number
  /** Whole percent for the UI: "62% also take …". */
  percent: number
  /** Cart item this suggestion comes from. */
  anchorMenuItemId: number
  anchorName: string
  /** Orders (last 60 days) that contained both. */
  supportOrders: number
}

// ─── 4. Rush hours ────────────────────────────────────────────────────────────

export interface RushHourCell {
  weekday: number
  hour: number
  orders: number
  revenue: number
  avgTicket: number
  /** orders / open days of that weekday in the range. */
  avgOrders: number
  /** Days in the range on which this weekday-hour had at least one order. */
  activeDays: number
}

export interface StaffingBlock {
  weekday: number
  fromHour: number
  /** Exclusive end hour. */
  toHour: number
  level: 'peak' | 'quiet'
  avgOrders: number
  /** avgOrders per hour ÷ average open hour of the whole range (2 = twice as busy). */
  loadFactor: number
}

export interface RushHoursReport {
  startDate: string
  endDate: string
  /** Only non-empty cells. */
  cells: RushHourCell[]
  /** Open days per weekday (index 0 = Sunday). */
  openDays: number[]
  byHour: { hour: number; orders: number; revenue: number; avgOrdersPerDay: number }[]
  best: RushHourCell[]
  worst: RushHourCell[]
  staffing: StaffingBlock[]
}

// ─── 5. Owner alerts ──────────────────────────────────────────────────────────

export type InsightAlertKind = 'cancellations' | 'discounts' | 'slow_day' | 'low_stock' | 'margin'

export interface InsightAlert {
  kind: InsightAlertKind
  /** Per-day dedupe key, e.g. 'cancellations' or 'margin:12'. */
  key: string
  severity: 'info' | 'warning' | 'critical'
  /** Plain text in the app language (the Telegram text uses the same wording). */
  title: string
  message: string
  /** Kind-specific numbers for the UI. */
  data: Record<string, unknown>
  /** Already sent to Telegram today. */
  sent: boolean
}

// ─── 6. Dashboard ─────────────────────────────────────────────────────────────

export interface DashboardKpis {
  revenue: number
  orders: number
  avgTicket: number
}

export interface DashboardSummary {
  date: string
  /** Local time 'HH:MM' the "so far" figures stop at. */
  asOf: string
  today: DashboardKpis
  /** Same weekday last week, up to the same local time. */
  lastWeekSameTime: DashboardKpis
  lastWeekFullDay: DashboardKpis
  /** Percent change today vs lastWeekSameTime; null when last week was 0. */
  deltaPct: { revenue: number | null; orders: number | null; avgTicket: number | null }
  /** Last 14 days including today, oldest first, zero-filled. */
  sparkline: { date: string; revenue: number; orders: number }[]
  topItemsToday: { menuItemId: number; name: string; name_ar: string | null; name_fr: string | null; quantity: number; revenue: number }[]
  lowStockCount: number
  forecastToday: { expectedOrders: number; expectedRevenue: number; method: ForecastMethod }
  pendingAlerts: InsightAlert[]
}

// ─── Print / Telegram results ─────────────────────────────────────────────────

export interface InsightsPrintResult {
  success: boolean
  error?: string
  printerName?: string
}

export interface InsightsSendResult {
  ok: boolean
  error?: string
}
