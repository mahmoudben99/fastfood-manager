/**
 * v4 wave-2 CONTRACT between the order screen (pages/orders) and the checkout components in this
 * folder. The order screen imports ONLY from './index'. Implementations may change freely; these
 * exported names and prop shapes may not (extend with optional props only).
 */
import type { ApprovalAction, ApprovalInput, OrderPaymentInput } from '../../../../shared/cash'
import type { OrderDeliveryInput } from '../../../../shared/delivery'

export type { ApprovalAction, ApprovalInput, OrderPaymentInput, OrderDeliveryInput }

export interface PaymentSheetProps {
  open: boolean
  /** Amount due in DA (after discount, incl. delivery fee). */
  total: number
  onCancel: () => void
  /** Resolves the payment lines to send as `payments` with orders.create. */
  onConfirm: (payments: OrderPaymentInput[]) => void
  /** Show "Pay later / cash on delivery" (sends payments: []). */
  allowPayLater?: boolean
  /** Disables the confirm button while the order is being saved (double-tap guard). */
  busy?: boolean
}

/** Delivery details collected on the order screen; `customer_*` go on the order, the rest in `delivery`. */
export interface DeliveryDraft extends OrderDeliveryInput {
  customer_phone?: string | null
  customer_name?: string | null
}

export interface DeliveryPanelProps {
  value: DeliveryDraft | null
  onChange: (value: DeliveryDraft | null) => void
  /** Order subtotal after discount (for the zone minimum check). */
  subtotal: number
  /** Shows "Repeat last order" in the customer lookup (same as CustomerLookupProps.onRepeatOrder). */
  onRepeatOrder?: (lines: RepeatLine[]) => void
}

/** A line to re-add to the cart from a customer's previous order. */
export interface RepeatLine {
  menu_item_id: number
  quantity: number
  notes?: string | null
  modifiers?: { option_id: number; quantity?: number }[]
  children?: { slot_id: number; menu_item_id: number; modifiers?: { option_id: number; quantity?: number }[]; note?: string | null }[]
}

export interface CustomerPick {
  id?: number
  phone: string
  name?: string | null
  /** When the customer agreed to keep their phone + addresses (law 18-07); absent/null = no consent on file. */
  consent_at?: string | null
  /** Previous orders (visits); absent for a new number. */
  order_count?: number
}

export interface CustomerLookupProps {
  /** Pre-filled phone (e.g. typed in the order form). */
  phone?: string
  onSelect: (customer: CustomerPick) => void
  /** "Repeat last order" — lines of the customer's most recent non-cancelled order. */
  onRepeatOrder?: (lines: RepeatLine[]) => void
  /** The selection was cleared ("Change customer"). */
  onClear?: () => void
  /** Focus the search field on mount (physical keyboard tills). */
  autoFocus?: boolean
}

export interface ShiftBarProps {
  /** Compact pill for the order screen header; full panel otherwise. */
  compact?: boolean
  /** Tab shown first when a shift is open (default 'summary' = X report). */
  initialTab?: 'summary' | 'cash' | 'close'
}

/**
 * Runs `run` once; if the main process answers APPROVAL_REQUIRED/INVALID (see parseApprovalError),
 * shows the manager PIN + reason dialog (mounted once via <ApprovalHost/> in App.tsx) and retries
 * with the approval. Resolves null if the user cancels the dialog.
 */
export type WithApproval = <T>(
  run: (approval?: ApprovalInput) => Promise<T>,
  opts?: { action?: ApprovalAction; reason?: string }
) => Promise<T | null>
