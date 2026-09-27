import type Database from 'better-sqlite3'
import { catalogMessage, type CatalogLang, type CatalogMessageCode } from '../../shared/catalog-messages'
import { isSoldOut } from './catalog-common'
import { resolveComboSlots, type ResolvedComboSlot } from './combos'
import { MAX_MODIFIER_QUANTITY, resolveModifierGroups, type ModifierKind } from './modifiers'
import { recipeQuantityInStockUnits } from './stock-units'
import type { OrderLineComboChildInput, OrderLineModifierInput } from '../../shared/catalog-types'

export type { OrderLineComboChildInput, OrderLineModifierInput }

/**
 * Order-time validation of modifiers and combo choices (no writes). Prices and rules always come
 * from the database; the client only says WHICH options / choices it wants. Writes (snapshots,
 * stock, child lines, revenue allocation) are in order-catalog-effects.ts.
 */

export type CatalogFailCode = 'invalid_input' | 'inactive_item' | 'incompatible_unit'

export interface CatalogContext {
  lang: CatalogLang
  /** Builds the caller's own error (order-service's DomainError) so its catch blocks keep working. */
  fail: (code: CatalogFailCode, message: string) => Error
}

export interface PreparedIngredient {
  stock_item_id: number
  recipe_quantity: number
  unit: string
  stock_unit: string
  price_per_unit: number
}

export interface PreparedModifier {
  option_id: number
  group_id: number
  group_name: string
  name: string
  name_ar: string | null
  name_fr: string | null
  kind: ModifierKind
  price_delta: number
  quantity: number
  sort_order: number
  ingredients: PreparedIngredient[]
}

export interface PreparedChild {
  slot_id: number
  menu: any
  workerId: number | null
  upcharge: number
  note: string | null
  recipe: PreparedIngredient[]
  modifiers: PreparedModifier[]
}

export interface PreparedCatalogLine {
  isCombo: boolean
  modifiers: PreparedModifier[]
  children: PreparedChild[]
  /** Added to the base (menu) unit price: Σ option deltas + Σ child upcharges and child option deltas. */
  extrasPerUnit: number
}

const MAX_PICKS = 50
export const roundCents = (value: number): number => Math.round(value * 100) / 100

export function modifierExtras(modifiers: { price_delta: number; quantity: number }[]): number {
  return roundCents(modifiers.reduce((sum, modifier) => sum + modifier.price_delta * modifier.quantity, 0))
}

export function childrenExtras(children: { upcharge: number; modifiers: { price_delta: number; quantity: number }[] }[]): number {
  return roundCents(children.reduce((sum, child) => sum + child.upcharge + modifierExtras(child.modifiers), 0))
}

function say(ctx: CatalogContext, code: CatalogMessageCode, params: Record<string, string | number>): string {
  return catalogMessage(code, ctx.lang, params)
}

/** Recipe rows of a menu item, validated like the order-service recipe check. */
export function prepareRecipe(db: Database.Database, menuItemId: number, ctx: CatalogContext): PreparedIngredient[] {
  const rows = db.prepare(
    `SELECT mii.stock_item_id, mii.quantity, mii.unit, si.name AS stock_name, si.unit_type, si.price_per_unit, si.is_active
     FROM menu_item_ingredients mii LEFT JOIN stock_items si ON si.id = mii.stock_item_id
     WHERE mii.menu_item_id = ?`
  ).all(menuItemId) as any[]
  return rows.map((row) => checkedIngredient(row, ctx))
}

function checkedIngredient(row: any, ctx: CatalogContext): PreparedIngredient {
  if (!row.stock_name || row.is_active !== 1) throw ctx.fail('inactive_item', say(ctx, 'invalid_ingredient', {}))
  try {
    recipeQuantityInStockUnits(row.quantity, row.unit, row.unit_type)
  } catch {
    throw ctx.fail('incompatible_unit', say(ctx, 'incompatible_unit', { unit: row.unit, stock: row.stock_name, stockUnit: row.unit_type }))
  }
  return {
    stock_item_id: row.stock_item_id,
    recipe_quantity: row.quantity,
    unit: row.unit,
    stock_unit: row.unit_type,
    price_per_unit: row.price_per_unit
  }
}

function normalizePicks(raw: unknown, ctx: CatalogContext, item: string): { option_id: number; quantity: number }[] {
  if (!Array.isArray(raw) || raw.length > MAX_PICKS) throw ctx.fail('invalid_input', say(ctx, 'modifier_invalid_input', { item }))
  return raw.map((entry) => {
    const optionId = Number(entry?.option_id ?? entry?.optionId)
    const quantity = entry?.quantity === undefined || entry?.quantity === null ? 1 : Number(entry.quantity)
    if (!Number.isInteger(optionId) || optionId <= 0) throw ctx.fail('invalid_input', say(ctx, 'modifier_invalid_input', { item }))
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_MODIFIER_QUANTITY) {
      throw ctx.fail('invalid_input', say(ctx, 'modifier_quantity_invalid', { max: MAX_MODIFIER_QUANTITY }))
    }
    return { option_id: optionId, quantity }
  })
}

/**
 * Validates the chosen options of one line against the item's resolved groups (min / max /
 * required / quantity rules). `raw` undefined = apply the default options (legacy clients).
 */
export function prepareModifiers(db: Database.Database, menu: any, raw: unknown, ctx: CatalogContext): PreparedModifier[] {
  const groups = resolveModifierGroups(db, menu.id)
  const item = String(menu.name)
  let picks: { option_id: number; quantity: number }[] = []
  if (raw === undefined || raw === null) {
    for (const group of groups) {
      const defaults = group.options.filter((option) => option.is_default)
      for (const option of defaults.slice(0, group.max_select ?? defaults.length)) picks.push({ option_id: option.id, quantity: 1 })
    }
  } else {
    picks = normalizePicks(raw, ctx, item)
  }

  const index = new Map<number, { groupIndex: number; group: (typeof groups)[number]; option: (typeof groups)[number]['options'][number] }>()
  groups.forEach((group, groupIndex) => { for (const option of group.options) index.set(option.id, { groupIndex, group, option }) })
  const seen = new Set<number>()
  const units = new Map<number, number>()
  const chosen: (PreparedModifier & { groupIndex: number })[] = []
  for (const pick of picks) {
    const hit = index.get(pick.option_id)
    if (!hit) throw ctx.fail('inactive_item', say(ctx, 'modifier_unknown_option', { item }))
    if (seen.has(pick.option_id)) throw ctx.fail('invalid_input', say(ctx, 'modifier_repeated', { item, option: hit.option.name }))
    seen.add(pick.option_id)
    if (pick.quantity > hit.group.max_quantity) {
      throw ctx.fail('invalid_input', hit.group.allow_quantity
        ? say(ctx, 'modifier_group_max', { item, group: hit.group.name, max: hit.group.max_quantity })
        : say(ctx, 'modifier_quantity_not_allowed', { group: hit.group.name }))
    }
    units.set(hit.group.id, (units.get(hit.group.id) ?? 0) + pick.quantity)
    const ingredients = hit.option.kind === 'no'
      ? []
      : (db.prepare(
          `SELECT moi.stock_item_id, moi.quantity, moi.unit, si.name AS stock_name, si.unit_type, si.price_per_unit, si.is_active
           FROM modifier_option_ingredients moi LEFT JOIN stock_items si ON si.id = moi.stock_item_id
           WHERE moi.option_id = ? ORDER BY moi.id`
        ).all(pick.option_id) as any[]).map((row) => checkedIngredient(row, ctx))
    chosen.push({
      groupIndex: hit.groupIndex,
      option_id: hit.option.id,
      group_id: hit.group.id,
      group_name: hit.group.name,
      name: hit.option.name,
      name_ar: hit.option.name_ar,
      name_fr: hit.option.name_fr,
      kind: hit.option.kind,
      price_delta: hit.option.price_delta,
      quantity: pick.quantity,
      sort_order: 0,
      ingredients
    })
  }
  for (const group of groups) {
    const count = units.get(group.id) ?? 0
    if (count < group.min_select) {
      throw ctx.fail('invalid_input', say(ctx, 'modifier_group_min', { item, group: group.name, min: group.min_select }))
    }
    if (group.max_select !== null && count > group.max_select) {
      throw ctx.fail('invalid_input', say(ctx, 'modifier_group_max', { item, group: group.name, max: group.max_select }))
    }
  }
  const optionOrder = (entry: PreparedModifier & { groupIndex: number }): number =>
    groups[entry.groupIndex].options.findIndex((option) => option.id === entry.option_id)
  return chosen
    .sort((a, b) => a.groupIndex - b.groupIndex || optionOrder(a) - optionOrder(b))
    .map(({ groupIndex: _unused, ...modifier }, position) => ({ ...modifier, sort_order: position }))
}

function defaultWorker(db: Database.Database, categoryId: number): number | null {
  return (db.prepare(
    `SELECT w.id FROM workers w JOIN worker_categories wc ON wc.worker_id = w.id
     WHERE wc.category_id = ? AND w.is_active = 1 ORDER BY w.id LIMIT 1`
  ).get(categoryId) as { id: number } | undefined)?.id ?? null
}

/** Validates combo picks against the combo's slots. `raw` undefined = every slot's default choices. */
export function prepareChildren(db: Database.Database, combo: any, raw: unknown, ctx: CatalogContext): PreparedChild[] {
  const slots = resolveComboSlots(db, combo.id)
  const item = String(combo.name)
  let picks: { slot_id: number; menu_item_id: number; modifiers?: unknown; note?: string }[] = []
  if (raw === undefined || raw === null) {
    for (const slot of slots) {
      for (const choice of slot.choices.filter((c) => c.is_default).slice(0, slot.max_select)) {
        picks.push({ slot_id: slot.id, menu_item_id: choice.menu_item_id })
      }
    }
  } else {
    if (!Array.isArray(raw) || raw.length > MAX_PICKS) throw ctx.fail('invalid_input', say(ctx, 'combo_invalid_input', { item }))
    picks = raw.map((entry) => {
      const slotId = Number(entry?.slot_id ?? entry?.slotId)
      const menuItemId = Number(entry?.menu_item_id ?? entry?.menuItemId)
      const note = entry?.note ?? entry?.notes
      if (!Number.isInteger(slotId) || !Number.isInteger(menuItemId) || menuItemId <= 0 ||
          (note !== undefined && note !== null && typeof note !== 'string')) {
        throw ctx.fail('invalid_input', say(ctx, 'combo_invalid_input', { item }))
      }
      return { slot_id: slotId, menu_item_id: menuItemId, modifiers: entry?.modifiers, note: note ? String(note).slice(0, 500) : undefined }
    })
  }

  const counts = new Map<number, number>()
  const children: (PreparedChild & { slotIndex: number; pickIndex: number })[] = []
  picks.forEach((pick, pickIndex) => {
    const slotIndex = slots.findIndex((slot) => slot.id === pick.slot_id)
    const slot: ResolvedComboSlot | undefined = slots[slotIndex]
    if (!slot) throw ctx.fail('invalid_input', say(ctx, 'combo_unknown_slot', { item }))
    const choice = slot.choices.find((c) => c.menu_item_id === pick.menu_item_id)
    if (!choice) {
      const named = db.prepare('SELECT name FROM menu_items WHERE id = ?').get(pick.menu_item_id) as { name: string } | undefined
      throw ctx.fail('invalid_input', say(ctx, 'combo_choice_not_allowed', { choice: named?.name ?? `#${pick.menu_item_id}`, slot: slot.name }))
    }
    if (choice.sold_out) throw ctx.fail('inactive_item', say(ctx, 'item_sold_out', { item: choice.name }))
    const menu = db.prepare('SELECT * FROM menu_items WHERE id = ? AND is_active = 1').get(pick.menu_item_id) as any
    if (!menu) throw ctx.fail('inactive_item', say(ctx, 'item_unavailable', { item: choice.name }))
    counts.set(slot.id, (counts.get(slot.id) ?? 0) + 1)
    children.push({
      slotIndex,
      pickIndex,
      slot_id: slot.id,
      menu,
      workerId: defaultWorker(db, menu.category_id),
      upcharge: choice.upcharge,
      note: pick.note ?? null,
      recipe: prepareRecipe(db, menu.id, ctx),
      modifiers: prepareModifiers(db, menu, pick.modifiers, ctx)
    })
  })
  for (const slot of slots) {
    const count = counts.get(slot.id) ?? 0
    if (count < slot.min_select) throw ctx.fail('invalid_input', say(ctx, 'combo_slot_min', { item, slot: slot.name, min: slot.min_select }))
    if (count > slot.max_select) throw ctx.fail('invalid_input', say(ctx, 'combo_slot_max', { item, slot: slot.name, max: slot.max_select }))
  }
  return children
    .sort((a, b) => a.slotIndex - b.slotIndex || a.pickIndex - b.pickIndex)
    .map(({ slotIndex: _s, pickIndex: _p, ...child }) => child)
}

/**
 * Everything a NEW order line needs beyond the base item: sold-out check, options, combo picks.
 * `line.modifiers` / `line.children` undefined = defaults (clients that do not know about them).
 */
export function prepareCatalogLine(
  db: Database.Database,
  menu: any,
  line: { modifiers?: unknown; children?: unknown },
  ctx: CatalogContext
): PreparedCatalogLine {
  if (isSoldOut(db, menu.id)) throw ctx.fail('inactive_item', say(ctx, 'item_sold_out', { item: menu.name }))
  const isCombo = menu.is_combo === 1
  if (!isCombo && Array.isArray(line.children) && line.children.length > 0) {
    throw ctx.fail('invalid_input', say(ctx, 'combo_not_a_combo', { item: menu.name }))
  }
  const modifiers = prepareModifiers(db, menu, line.modifiers, ctx)
  const children = isCombo ? prepareChildren(db, menu, line.children, ctx) : []
  return { isCombo, modifiers, children, extrasPerUnit: roundCents(modifierExtras(modifiers) + childrenExtras(children)) }
}

/**
 * Untrusted LAN/cloud clients: keep only ids and quantities (never prices). Returns null when the
 * shape is invalid; missing fields stay undefined (= defaults).
 */
export function sanitizeCatalogFields(raw: any): { modifiers?: OrderLineModifierInput[]; children?: OrderLineComboChildInput[] } | null {
  const mods = (value: unknown): OrderLineModifierInput[] | undefined | null => {
    if (value === undefined || value === null) return undefined
    if (!Array.isArray(value) || value.length > MAX_PICKS) return null
    const out: OrderLineModifierInput[] = []
    for (const entry of value as any[]) {
      const optionId = Number(entry?.option_id ?? entry?.optionId ?? entry?.id)
      const quantity = entry?.quantity === undefined || entry?.quantity === null ? 1 : Number(entry.quantity)
      if (!Number.isInteger(optionId) || optionId <= 0 || !Number.isInteger(quantity) || quantity < 1 || quantity > MAX_MODIFIER_QUANTITY) return null
      out.push({ option_id: optionId, quantity })
    }
    return out
  }
  const modifiers = mods(raw?.modifiers)
  if (modifiers === null) return null
  let children: OrderLineComboChildInput[] | undefined
  if (raw?.children !== undefined && raw?.children !== null) {
    if (!Array.isArray(raw.children) || raw.children.length > MAX_PICKS) return null
    children = []
    for (const entry of raw.children as any[]) {
      const slotId = Number(entry?.slot_id ?? entry?.slotId)
      const menuItemId = Number(entry?.menu_item_id ?? entry?.menuItemId)
      const childMods = mods(entry?.modifiers)
      if (!Number.isInteger(slotId) || !Number.isInteger(menuItemId) || menuItemId <= 0 || childMods === null) return null
      children.push({
        slot_id: slotId,
        menu_item_id: menuItemId,
        ...(childMods ? { modifiers: childMods } : {}),
        ...(typeof entry?.note === 'string' && entry.note.trim() ? { note: entry.note.slice(0, 500) } : {})
      })
    }
  }
  return { ...(modifiers ? { modifiers } : {}), ...(children ? { children } : {}) }
}
