/**
 * v4 shift / cash-drawer shapes shared by the main process and the renderer (types only).
 * Amounts are whole Algerian dinars (DA).
 */
import type { DenominationCounts } from './cash'

export interface Shift {
  id: number
  register_id: string
  status: 'open' | 'closed'
  cashier_name: string
  cashier_worker_id: number | null
  opening_float: number
  opened_at: string
  business_date: string
  open_note: string | null
  closed_at: string | null
  closed_by: string | null
  counted_cash: number | null
  /** JSON DenominationCounts when the drawer was counted by denomination. */
  denominations: string | null
  expected_cash: number | null
  over_short: number | null
  close_note: string | null
}

export interface OpenShiftInput {
  /** Free-text cashier name; defaults to the worker's name when cashier_worker_id is given. */
  cashier_name?: string
  cashier_worker_id?: number
  opening_float: number
  note?: string
}

export interface CashMovementInput {
  kind: 'pay_in' | 'pay_out'
  amount: number
  /** e.g. "bought bread". Required. */
  reason: string
  operator?: string
}

export interface CashMovement {
  id: number
  shift_id: number
  kind: 'pay_in' | 'pay_out'
  amount: number
  reason: string
  operator: string | null
  created_at: string
}

export interface CloseShiftInput {
  /** Counted cash in the drawer; ignored when `denominations` is given. One of both is required. */
  counted_cash?: number
  denominations?: DenominationCounts
  closed_by?: string
  note?: string
  /** Print the Z report on the receipt printer after closing. */
  print?: boolean
}

export interface ShiftReportLine {
  name: string
  quantity: number
  revenue: number
}

export interface ShiftReport {
  kind: 'X' | 'Z'
  generated_at: string
  shift: Shift
  orders: {
    count: number
    /** Σ subtotal (before discounts). */
    gross_sales: number
    discounts: number
    delivery_fees: number
    /** Σ total = gross − discounts + delivery fees. */
    net_sales: number
    average_ticket: number
    by_type: Record<'local' | 'takeout' | 'delivery', { count: number; total: number }>
  }
  /** Money taken in this shift, by method (includes pay-later orders from earlier shifts). */
  payments: { method: string; label: string; count: number; amount: number; refunds: number; net: number }[]
  cash: {
    opening_float: number
    cash_sales: number
    /** Negative. */
    cash_refunds: number
    rounding: number
    pay_ins: number
    pay_outs: number
    /** Σ (collected − expected) of driver settlements in this shift. */
    driver_differences: number
    change_given: number
    /** float + cash sales − cash refunds + rounding + pay-ins − pay-outs + driver differences. Null = hidden (blind count). */
    expected: number | null
    counted: number | null
    /** counted − expected; null until counted (or while hidden). */
    over_short: number | null
    denominations: DenominationCounts | null
  }
  /** Orders of this shift that still have a balance due (pay later / COD). */
  unpaid: { count: number; amount: number }
  categories: ShiftReportLine[]
  top_items: ShiftReportLine[]
  discounts: { count: number; amount: number; by_cashier: { cashier: string; count: number; amount: number }[] }
  cancellations: {
    count: number
    amount: number
    list: { order_id: number; daily_number: number; total: number; at: string; by: string; reason: string | null }[]
  }
  voids: {
    count: number
    amount: number
    list: { order_id: number; daily_number: number; item_name: string; quantity: number; amount: number; at: string; by: string }[]
    by_operator: { operator: string; count: number; amount: number }[]
  }
  movements: CashMovement[]
  driver_settlements: { driver_name: string; expected: number; collected: number; difference: number }[]
  /** True while the expected cash is hidden for a blind count (X report before close). */
  blind: boolean
}
