import type { OrderDelivery } from '../../../../../shared/delivery'

/** Sale-time option snapshot (order_item_modifiers row) as returned by orders.getById. */
export interface HistoryModifier {
  id: number
  group_name: string | null
  name: string
  name_ar: string | null
  name_fr: string | null
  kind: 'none' | 'extra' | 'light' | 'no'
  /** Per unit of the option. */
  price_delta: number
  /** Units per ONE unit of the line. */
  quantity: number
}

export interface HistoryItem {
  id: number
  menu_item_id: number
  quantity: number
  unit_price: number
  total_price: number
  notes: string | null
  worker_id: number | null
  worker_name?: string | null
  menu_item_name?: string
  menu_item_name_ar?: string | null
  menu_item_name_fr?: string | null
  /** v4 catalog: 'item' | 'combo' (parent, carries the price) | 'combo_child'. */
  line_kind?: string
  parent_order_item_id?: number | null
  combo_upcharge?: number
  combo_name?: string | null
  modifiers?: HistoryModifier[]
}

export interface HistoryOrder {
  id: number
  daily_number: number
  order_date: string
  order_type: string
  table_number: string | null
  customer_phone: string | null
  customer_name: string | null
  status: string
  subtotal: number
  total: number
  discount_amount: number
  discount_details: string | null
  notes: string | null
  /** v4: total = subtotal − discount + delivery_fee. */
  delivery_fee?: number
  /** v4: NULL = pre-v4 order (paid in cash); unpaid | partial | paid | void. */
  payment_status?: string | null
  cashier_name?: string | null
  created_at: string
  completed_at: string | null
  items?: HistoryItem[]
  delivery?: OrderDelivery | null
}

/** One editable (top-level) line in edit mode. Combo children follow their parent line. */
export interface EditLine {
  order_item_id: number
  menu_item_id: number
  menu_item_name?: string
  quantity: number
  unit_price: number
  notes: string | null
  worker_id: number | null
}

export type StatusFilter = 'all' | 'ongoing' | 'completed' | 'cancelled' | 'unpaid'
export type PeriodPreset = 'today' | 'yesterday' | 'week' | 'month' | 'custom'

/** Manual print result from printer:* / payments:printInvoice. */
export type PrintResult = { success: boolean; error?: string; printerName?: string }
