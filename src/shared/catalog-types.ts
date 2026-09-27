/**
 * v4 catalog types shared by the main process (services, IPC) and the preload/renderer API:
 * modifier groups/options, combos, and the order-line input shapes.
 */

export type ModifierKind = 'none' | 'extra' | 'light' | 'no'

export interface IngredientInput {
  stock_item_id: number
  quantity: number
  unit: string
}

export interface ModifierGroupInput {
  name: string
  name_ar?: string | null
  name_fr?: string | null
  min_select?: number
  max_select?: number | null
  is_required?: boolean
  allow_quantity?: boolean
  sort_order?: number
  is_active?: boolean
}

export interface ModifierOptionInput {
  name: string
  name_ar?: string | null
  name_fr?: string | null
  kind?: ModifierKind
  /** Per unit of the option; may be negative ("No cheese -50"). The line price never goes below 0. */
  price_delta?: number
  is_default?: boolean
  sort_order?: number
  is_active?: boolean
  /** Stock deducted per unit of the option (recipe units). Omit on update to keep. Not allowed for kind 'no'. */
  ingredients?: IngredientInput[]
}

export interface ModifierOption {
  id: number
  group_id: number
  name: string
  name_ar: string | null
  name_fr: string | null
  kind: ModifierKind
  price_delta: number
  is_default: number
  sort_order: number
  is_active: number
  ingredients: (IngredientInput & { stock_item_name: string | null; stock_unit_type: string | null })[]
}

export interface ModifierGroup {
  id: number
  name: string
  name_ar: string | null
  name_fr: string | null
  min_select: number
  max_select: number | null
  is_required: number
  allow_quantity: number
  sort_order: number
  is_active: number
  options: ModifierOption[]
}

export interface ModifierAssignmentInput {
  group_id: number
  sort_order?: number
  /** Item-level only: hide this category-assigned group for the item. */
  excluded?: boolean
}

export interface ResolvedModifierOption {
  id: number
  group_id: number
  name: string
  name_ar: string | null
  name_fr: string | null
  kind: ModifierKind
  price_delta: number
  is_default: boolean
  sort_order: number
}

export interface ResolvedModifierGroup {
  id: number
  name: string
  name_ar: string | null
  name_fr: string | null
  /** Effective minimum units (0 unless required). */
  min_select: number
  /** null = no limit. */
  max_select: number | null
  is_required: boolean
  allow_quantity: boolean
  /** Most units of ONE option per line unit (1 unless allow_quantity). */
  max_quantity: number
  source: 'item' | 'category'
  sort_order: number
  options: ResolvedModifierOption[]
}

export interface ComboChoiceInput {
  /** Exactly one of menu_item_id / category_id. A category offers every active item in it. */
  menu_item_id?: number | null
  category_id?: number | null
  upcharge?: number
  /** Only for menu_item choices. */
  is_default?: boolean
  sort_order?: number
}

export interface ComboSlotInput {
  /** Existing slot id to keep it stable (order history references slot ids). */
  id?: number
  name: string
  name_ar?: string | null
  name_fr?: string | null
  min_select?: number
  max_select?: number
  sort_order?: number
  choices: ComboChoiceInput[]
}

export interface ComboChoice {
  id: number
  slot_id: number
  menu_item_id: number | null
  category_id: number | null
  upcharge: number
  is_default: number
  sort_order: number
  menu_item_name: string | null
  category_name: string | null
}

export interface ComboSlot {
  id: number
  combo_item_id: number
  name: string
  name_ar: string | null
  name_fr: string | null
  min_select: number
  max_select: number
  sort_order: number
  choices: ComboChoice[]
}

export interface ComboDefinition {
  menu_item_id: number
  name: string
  name_ar: string | null
  name_fr: string | null
  price: number
  is_active: number
  slots: ComboSlot[]
}

export interface ResolvedComboChoice {
  menu_item_id: number
  name: string
  name_ar: string | null
  name_fr: string | null
  category_id: number
  /** The item's normal menu price (used to split the combo price for reports). */
  price: number
  upcharge: number
  is_default: boolean
  sold_out: boolean
  /** True when the item has modifier groups (ask modifiers.getForMenuItem for them). */
  has_modifiers: boolean
  emoji: string | null
  image_path: string | null
}

export interface ResolvedComboSlot {
  id: number
  name: string
  name_ar: string | null
  name_fr: string | null
  min_select: number
  max_select: number
  sort_order: number
  choices: ResolvedComboChoice[]
}

export interface ResolvedCombo {
  menu_item_id: number
  name: string
  name_ar: string | null
  name_fr: string | null
  price: number
  sold_out: boolean
  slots: ResolvedComboSlot[]
}

/** One chosen option of an order line. `quantity` = units per ONE unit of the line (default 1). */
export interface OrderLineModifierInput {
  option_id: number
  quantity?: number
}

/** One chosen item of a combo line (one entry per pick). */
export interface OrderLineComboChildInput {
  slot_id: number
  menu_item_id: number
  /** Omit = the child item's default options. */
  modifiers?: OrderLineModifierInput[]
  note?: string
}
