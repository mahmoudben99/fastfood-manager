/**
 * v4 checkout: customer lookup, "repeat last order" and personal-data consent (Algerian law 18-07).
 * Shapes shared by the main process (customers IPC) and the renderer (checkout components).
 * No imports, no side effects.
 */

/**
 * Version of the consent wording shown at the POS ("save my phone and address for next time").
 * Stored with the consent so a later wording change can ask again. Bump when the text changes.
 */
export const CUSTOMER_CONSENT_VERSION = 'pos-2026-09'

export interface CustomerRecord {
  id: number
  phone: string
  phone_normalized: string
  name: string | null
  total_spent: number
  /** Visits (orders). */
  order_count: number
  last_order_date: string | null
  notes: string | null
  /** When the customer agreed that the shop keeps their phone + addresses (NULL = no consent). */
  consent_at: string | null
  consent_version: string | null
  created_at: string
  updated_at: string
}

export interface RepeatModifier {
  option_id: number
  quantity: number
  name: string
}

export interface RepeatChild {
  slot_id: number
  menu_item_id: number
  name: string
  note: string | null
  modifiers: RepeatModifier[]
}

/** A line of the previous order that can be put back in the cart as it is now. */
export interface RepeatOrderLine {
  menu_item_id: number
  name: string
  name_ar: string | null
  name_fr: string | null
  quantity: number
  notes: string | null
  /** Chosen options; null = send none so the item's current default options apply. */
  modifiers: RepeatModifier[] | null
  /** Combo picks (empty for a plain item). */
  children: RepeatChild[]
}

/**
 * unavailable = deleted / deactivated item or category; sold_out = 86'd now;
 * changed = its options or combo picks are no longer valid for the current menu.
 */
export type RepeatSkipReason = 'unavailable' | 'sold_out' | 'changed'

export interface RepeatSkippedLine {
  name: string
  quantity: number
  reason: RepeatSkipReason
}

export interface LastOrderInfo {
  id: number
  daily_number: number
  order_date: string
  created_at: string
  order_type: string
  total: number
  /** Σ quantity of the top-level lines. */
  item_count: number
}

export interface LastOrderResult {
  /** Most recent non-cancelled order of the customer; null when there is none. */
  order: LastOrderInfo | null
  lines: RepeatOrderLine[]
  skipped: RepeatSkippedLine[]
  /** Names of lines put back without an option that no longer exists. */
  trimmed: string[]
}

export interface ConsentInput {
  /** An existing customer, or `phone` (the customer is created when new). */
  customer_id?: number
  phone?: string
  name?: string | null
  /** Defaults to CUSTOMER_CONSENT_VERSION. */
  version?: string
}
