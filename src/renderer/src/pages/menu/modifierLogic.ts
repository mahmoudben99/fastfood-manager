import type {
  ModifierGroup,
  ModifierKind,
  ModifierOption,
  ModifierOptionInput,
  ResolvedModifierGroup
} from '../../../../shared/catalog-types'
import { draftKey, parseAmount } from './catalogShared'
import { canonicalRecipeUnit, type RecipeRow } from './recipeUnits'

/**
 * Pure helpers for the option-group editors: the client-side mirror of the order screen's group
 * resolution (for live previews), draft shapes, and the diff that turns a draft into API calls.
 */

export const MODIFIER_KINDS: ModifierKind[] = ['none', 'extra', 'light', 'no']
/** Same cap as the main process (MAX_MODIFIER_QUANTITY). */
export const MAX_OPTION_QUANTITY = 10

export interface ItemAssignment {
  group_id: number
  sort_order: number
  excluded: boolean
}

/** Item rows get sort orders after every category row, so item-only groups follow the category ones. */
export const ITEM_SORT_BASE = 1000

/**
 * Mirrors resolveModifierGroups (main): category rows apply, item rows override the sort or hide
 * the group (`excluded`), inactive groups/options and empty groups are dropped.
 */
export function resolveGroupsLocal(
  library: ModifierGroup[],
  categoryRows: { group_id: number; sort_order: number }[],
  itemRows: ItemAssignment[]
): ResolvedModifierGroup[] {
  const picked = new Map<number, { sort: number; source: 'item' | 'category' }>()
  for (const row of categoryRows) picked.set(row.group_id, { sort: row.sort_order, source: 'category' })
  for (const row of itemRows) {
    if (row.excluded) picked.delete(row.group_id)
    else picked.set(row.group_id, { sort: row.sort_order, source: 'item' })
  }
  const out: ResolvedModifierGroup[] = []
  for (const group of library) {
    const hit = picked.get(group.id)
    if (!hit || group.is_active !== 1) continue
    const resolved = toResolved(group, hit.source, hit.sort)
    if (resolved.options.length > 0) out.push(resolved)
  }
  return out.sort(
    (a, b) =>
      a.sort_order - b.sort_order || (a.source === b.source ? 0 : a.source === 'item' ? -1 : 1) || a.id - b.id
  )
}

/** One library group as the order screen would resolve it (active options only). */
export function toResolved(group: ModifierGroup, source: 'item' | 'category' = 'item', sort = 0): ResolvedModifierGroup {
  const required = group.is_required === 1
  const max = group.max_select ?? null
  return {
    id: group.id,
    name: group.name,
    name_ar: group.name_ar,
    name_fr: group.name_fr,
    min_select: required ? Math.max(1, group.min_select) : 0,
    max_select: max,
    is_required: required,
    allow_quantity: group.allow_quantity === 1,
    max_quantity: group.allow_quantity === 1 ? Math.min(MAX_OPTION_QUANTITY, max ?? MAX_OPTION_QUANTITY) : 1,
    source,
    sort_order: sort,
    options: group.options
      .filter((option) => option.is_active === 1)
      .map((option) => ({
        id: option.id,
        group_id: option.group_id,
        name: option.name,
        name_ar: option.name_ar,
        name_fr: option.name_fr,
        kind: option.kind,
        price_delta: option.price_delta,
        is_default: option.is_default === 1,
        sort_order: option.sort_order
      }))
  }
}

// ─── Group editor drafts ────────────────────────────────────────────────────────────────────

export interface OptionDraft {
  key: string
  id: number | null
  name: string
  name_ar: string
  name_fr: string
  kind: ModifierKind
  /** Absolute amount as typed; the sign lives in `negative`. */
  price: string
  negative: boolean
  is_default: boolean
  is_active: boolean
  ingredients: RecipeRow[]
  /** Fingerprint of the saved option (null = new) to skip untouched rows on save. */
  saved: string | null
}

export interface GroupDraft {
  id: number | null
  name: string
  name_ar: string
  name_fr: string
  is_required: boolean
  min_select: number
  /** null = no limit */
  max_select: number | null
  allow_quantity: boolean
  is_active: boolean
  options: OptionDraft[]
  /** Category ids that show this group. */
  categoryIds: number[]
}

export function optionToDraft(option: ModifierOption): OptionDraft {
  const draft: OptionDraft = {
    key: `o${option.id}`,
    id: option.id,
    name: option.name,
    name_ar: option.name_ar ?? '',
    name_fr: option.name_fr ?? '',
    kind: option.kind,
    price: option.price_delta ? String(Math.abs(option.price_delta)) : '',
    negative: option.price_delta < 0,
    is_default: option.is_default === 1,
    is_active: option.is_active === 1,
    ingredients: option.ingredients.map((row) => ({
      stock_item_id: row.stock_item_id,
      quantity: String(row.quantity),
      unit: row.unit
    })),
    saved: null
  }
  draft.saved = optionFingerprint(draft, 0)
  return draft
}

export function newOptionDraft(name = ''): OptionDraft {
  return {
    key: draftKey('o'),
    id: null,
    name,
    name_ar: '',
    name_fr: '',
    kind: 'none',
    price: '',
    negative: false,
    is_default: false,
    is_active: true,
    ingredients: [],
    saved: null
  }
}

export function groupToDraft(group: ModifierGroup | null, categoryIds: number[]): GroupDraft {
  if (!group) {
    return {
      id: null,
      name: '',
      name_ar: '',
      name_fr: '',
      is_required: false,
      min_select: 0,
      max_select: 1,
      allow_quantity: false,
      is_active: true,
      options: [newOptionDraft()],
      categoryIds
    }
  }
  return {
    id: group.id,
    name: group.name,
    name_ar: group.name_ar ?? '',
    name_fr: group.name_fr ?? '',
    is_required: group.is_required === 1,
    min_select: group.is_required === 1 ? Math.max(1, group.min_select) : 0,
    max_select: group.max_select,
    allow_quantity: group.allow_quantity === 1,
    is_active: group.is_active === 1,
    options: group.options.map(optionToDraft),
    categoryIds
  }
}

export function optionDelta(option: Pick<OptionDraft, 'price' | 'negative' | 'kind'>): number {
  const amount = parseAmount(option.price)
  if (!Number.isFinite(amount) || amount === 0) return 0
  return option.negative ? -Math.abs(amount) : Math.abs(amount)
}

export function optionInput(option: OptionDraft, sortOrder: number): ModifierOptionInput {
  return {
    name: option.name.trim(),
    name_ar: option.name_ar.trim() || null,
    name_fr: option.name_fr.trim() || null,
    kind: option.kind,
    price_delta: optionDelta(option),
    is_default: option.is_default,
    is_active: option.is_active,
    sort_order: sortOrder,
    ingredients:
      option.kind === 'no'
        ? []
        : option.ingredients.map((row) => ({
            stock_item_id: row.stock_item_id,
            quantity: Math.round(parseAmount(row.quantity) * 1e6) / 1e6,
            unit: canonicalRecipeUnit(row.unit)
          }))
  }
}

function optionFingerprint(option: OptionDraft, sortOrder: number): string {
  return JSON.stringify(optionInput(option, sortOrder))
}

/** True when the saved option must be written again (content or position changed). */
export function optionChanged(option: OptionDraft, index: number, originalIndex: number): boolean {
  if (option.saved === null) return true
  return optionFingerprint(option, 0) !== option.saved || index !== originalIndex
}

/** Problems that block saving the group (i18n keys under modifiers.errors). */
export function validateGroupDraft(draft: GroupDraft): string | null {
  if (!draft.name.trim()) return 'groupName'
  const live = draft.options
  if (live.length === 0) return 'noOptions'
  if (live.some((option) => !option.name.trim())) return 'optionName'
  if (live.some((option) => option.price.trim() && !Number.isFinite(parseAmount(option.price)))) return 'optionPrice'
  if (draft.max_select !== null && draft.is_required && draft.max_select < Math.max(1, draft.min_select)) return 'rules'
  const defaults = live.filter((option) => option.is_default && option.is_active).length
  if (draft.max_select !== null && defaults > draft.max_select) return 'tooManyDefaults'
  return null
}

/** Draft → the shape the preview renders (as the cashier would see it). */
export function draftToResolved(draft: GroupDraft): ResolvedModifierGroup {
  const required = draft.is_required
  return {
    id: draft.id ?? -1,
    name: draft.name || '…',
    name_ar: draft.name_ar || null,
    name_fr: draft.name_fr || null,
    min_select: required ? Math.max(1, draft.min_select) : 0,
    max_select: draft.max_select,
    is_required: required,
    allow_quantity: draft.allow_quantity,
    max_quantity: draft.allow_quantity ? Math.min(MAX_OPTION_QUANTITY, draft.max_select ?? MAX_OPTION_QUANTITY) : 1,
    source: 'item',
    sort_order: 0,
    options: draft.options
      .filter((option) => option.is_active && option.name.trim())
      .map((option, index) => ({
        id: -(index + 1),
        group_id: draft.id ?? -1,
        name: option.name,
        name_ar: option.name_ar || null,
        name_fr: option.name_fr || null,
        kind: option.kind,
        price_delta: optionDelta(option),
        is_default: option.is_default,
        sort_order: index
      }))
  }
}
