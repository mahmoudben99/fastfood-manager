/**
 * v4 delivery rules shared by the main process and the renderer: status timeline, input and row
 * shapes. No imports, no side effects. Amounts are whole Algerian dinars (DA).
 */

export const DELIVERY_STATUSES = ['pending', 'preparing', 'out_for_delivery', 'delivered', 'failed'] as const
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number]

/** Workers whose `role` is 'driver' can be assigned to delivery orders. */
export const DRIVER_ROLE = 'driver'

const NEXT: Record<DeliveryStatus, DeliveryStatus[]> = {
  pending: ['preparing', 'out_for_delivery', 'failed'],
  preparing: ['pending', 'out_for_delivery', 'failed'],
  out_for_delivery: ['preparing', 'delivered', 'failed'],
  // A mistaken "delivered" can be corrected while the driver has not been settled.
  delivered: ['out_for_delivery'],
  // Retry after a failed attempt.
  failed: ['pending', 'preparing', 'out_for_delivery']
}

export function canMoveDelivery(from: DeliveryStatus, to: DeliveryStatus): boolean {
  return NEXT[from]?.includes(to) ?? false
}

/** Delivery details sent with an order (renderer shape, snake_case like the other order input). */
export interface OrderDeliveryInput {
  /** Free-text address; required unless address_id is given. */
  address?: string | null
  /** A saved customer address (customer_addresses.id). */
  address_id?: number | null
  /** Delivery zone → fee (unless `fee` is given), minimum order, ETA. */
  zone_id?: number | null
  /** Worker with role 'driver'. */
  driver_id?: number | null
  /** Explicit fee in DA, overriding the zone fee. */
  fee?: number | null
  notes?: string | null
  /** Save the address to the customer's address book (needs a customer phone). */
  save_address?: boolean
  /** Accept an order below the zone's minimum. */
  ignore_min_order?: boolean
}

export interface DeliveryZone {
  id: number
  name: string
  fee: number
  min_order: number | null
  estimated_minutes: number | null
  is_active: number
  sort_order: number
  created_at: string
  updated_at: string
}

export interface DeliveryZoneInput {
  id?: number
  name: string
  fee: number
  min_order?: number | null
  estimated_minutes?: number | null
  is_active?: boolean
  sort_order?: number
}

export interface CustomerAddress {
  id: number
  customer_id: number
  label: string | null
  address: string
  zone_id: number | null
  notes: string | null
  is_default: number
  last_used_at: string | null
  created_at: string
  updated_at: string
}

export interface CustomerAddressInput {
  id?: number
  /** Either customer_id or customer_phone (the customer is created if needed). */
  customer_id?: number
  customer_phone?: string
  label?: string | null
  address: string
  zone_id?: number | null
  notes?: string | null
  is_default?: boolean
}

export interface OrderDelivery {
  order_id: number
  address: string
  address_id: number | null
  zone_id: number | null
  /** Zone name at order time. */
  zone_name: string | null
  estimated_minutes: number | null
  driver_id: number | null
  driver_name?: string | null
  notes: string | null
  status: DeliveryStatus
  failure_reason: string | null
  /** Timeline: pending = created_at. */
  created_at: string
  preparing_at: string | null
  out_for_delivery_at: string | null
  delivered_at: string | null
  failed_at: string | null
  settlement_id: number | null
  updated_at: string
}

/** A delivery order as listed for the dispatch screen. */
export interface DeliveryListEntry extends OrderDelivery {
  daily_number: number
  order_date: string
  order_status: string
  customer_name: string | null
  customer_phone: string | null
  total: number
  delivery_fee: number
  payment_status: string | null
  balance_due: number
}

export interface DriverSettlementPreview {
  driverId: number
  driverName: string
  /** Delivered, not yet settled delivery orders of this driver. */
  orders: { orderId: number; dailyNumber: number; orderDate: string; total: number; balanceDue: number }[]
  /** Σ balance due of those orders = cash the driver should hand over (COD). */
  expectedCash: number
  deliveryFees: number
  outForDelivery: number
  failed: number
}

export interface DriverSettlement {
  id: number
  driver_id: number
  driver_name?: string | null
  shift_id: number | null
  business_date: string
  order_count: number
  expected_cash: number
  collected_cash: number
  /** collected − expected (negative = driver short). */
  difference: number
  note: string | null
  operator: string | null
  created_at: string
}
