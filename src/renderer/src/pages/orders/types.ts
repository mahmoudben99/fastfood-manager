/**
 * Order screen data shapes (renderer side). Menu reads may carry the v4 catalog flags and, once the
 * channels agent lands, per-channel prices / time availability; every v4 field is optional so the
 * screen keeps working against older menus.
 */
import type { ChannelPrices, OrderType } from '../../store/orderStore'

export type { ChannelPrices, OrderType }

export interface MenuItemData {
  id: number
  name: string
  name_ar: string | null
  name_fr: string | null
  price: number
  category_id: number
  image_path: string | null
  emoji: string | null
  category_name?: string
  /** v4 catalog: 1 = combo (price = combo price, children picked in the combo sheet). */
  is_combo?: number
  /** v4 catalog: effective sold-out flag (manual 86 or auto stock rule). */
  sold_out?: number | boolean
  /** v4 channels (optional): price per sales channel ({ channel: price }). */
  channel_prices?: ChannelPrices | null
  /** v4 channels (optional): 0 / false outside the item's availability window. */
  available_now?: number | boolean
}

export interface CategoryData {
  id: number
  name: string
  name_ar: string | null
  name_fr: string | null
  icon: string | null
}

export interface OrderItemModifierData {
  option_id: number | null
  group_id: number | null
  name: string
  name_ar: string | null
  name_fr: string | null
  kind: 'none' | 'extra' | 'light' | 'no'
  price_delta: number
  quantity: number
}

export interface OrderItemData {
  id: number
  menu_item_id: number
  menu_item_name: string
  menu_item_name_ar?: string | null
  menu_item_name_fr?: string | null
  quantity: number
  unit_price: number
  total_price: number
  notes: string | null
  worker_id: number | null
  line_kind?: string
  parent_order_item_id?: number | null
  combo_slot_id?: number | null
  combo_upcharge?: number
  modifiers?: OrderItemModifierData[]
  category_id?: number
  image_path?: string | null
}

export interface OrderData {
  id: number
  daily_number: number
  order_date: string
  order_type: string
  table_number: string | null
  status: string
  subtotal?: number
  discount_amount?: number
  discount_details?: string | null
  delivery_fee?: number
  total: number
  created_at: string
  notes: string | null
  customer_phone: string | null
  customer_name?: string | null
  payment_status?: string | null
  /** v4 channels: sales channel the order was sold on. */
  channel?: string | null
  items?: OrderItemData[]
  delivery?: {
    address?: string | null
    address_id?: number | null
    zone_id?: number | null
    driver_id?: number | null
    fee?: number | null
    notes?: string | null
  } | null
}

export interface OrderWorker {
  id: number
  name: string
  itemCount: number
}

export type PrintResult = { success: boolean; error?: string; printerName?: string }

export interface PrintJobData {
  id: number
  order_id: number
  daily_number: number
  event_type: 'new' | 'updated' | 'cancelled' | 'restored'
  document_type: 'receipt' | 'kitchen'
  scope: 'all' | 'worker' | 'unassigned'
  worker_id: number | null
  worker_name: string | null
  status: 'pending' | 'printing' | 'attention'
  attempts: number
  last_error: string | null
}

/** Sheets are mounted only while open; one at a time. */
export type SheetState =
  | { kind: 'item'; menuItemId: number; lineKey?: string }
  | { kind: 'combo'; menuItemId: number; lineKey?: string }
  | { kind: 'orderNote' }
  | { kind: 'delivery' }
  | { kind: 'discount' }

/** Top-level (non combo-child) order lines. */
export function topLevelItems<T extends { line_kind?: string; parent_order_item_id?: number | null }>(items?: T[]): T[] {
  return (items || []).filter((item) => item.line_kind !== 'combo_child' && item.parent_order_item_id == null)
}
