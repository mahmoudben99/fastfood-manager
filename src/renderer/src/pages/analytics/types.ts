/** Shapes of the analytics:* rows the page uses (analytics.repo.ts) + the page's own trend points. */

export interface ProfitSummary {
  total_revenue: number
  total_delivery_fees: number
  order_count: number
  total_stock_cost: number
  total_worker_cost: number
  net_profit: number
}

export interface TopItemRow {
  name: string
  name_ar?: string | null
  name_fr?: string | null
  total_quantity: number
  total_revenue: number
  category_name: string
}

export interface CategoryRow {
  name: string
  name_ar?: string | null
  name_fr?: string | null
  total_revenue: number
  total_quantity: number
}

export interface WorkerRow {
  id: number
  name: string
  role: string
  orders_handled: number
  total_revenue: number
  total_pay: number
}

export interface MethodRow {
  method: string
  amount: number
  count: number
}

/** One point of the revenue trend: a day, or an hour when the period is a single day. */
export interface TrendPoint {
  key: string
  label: string
  revenue: number
  orders: number
}

export interface AnalyticsData {
  summary: ProfitSummary
  trend: TrendPoint[]
  /** Trend points are hours of one day. */
  hourly: boolean
  top: TopItemRow[]
  categories: CategoryRow[]
  workers: WorkerRow[]
  methods: MethodRow[]
  /** Custom payment-method labels by id ('' = use the built-in translation). */
  methodLabels: Record<string, string>
  /** Category id by name — colours are keyed by id everywhere (categoryColor(id)). */
  categoryIds: Record<string, number>
}
