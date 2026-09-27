/**
 * v4 catalog (modifiers + combos) in the insights cost basis.
 *
 * Option recipes  modifier_option_ingredients of options that use stock. Kind 'no' ("No onions")
 *                 never deducts anything at sale time (order-catalog.ts), so it is left out here too.
 * Standard build  what one unit of a menu item consumes when sold "as is": its own recipe plus the
 *                 ingredients of its DEFAULT options — the same defaults order-catalog applies to a
 *                 line sent without picks (per group: default options, capped at max_select).
 * Combos          own recipe (packaging…) + the standard build of every slot's default choices
 *                 (direct item choices flagged default, capped at max_select — again the same rule
 *                 as order-catalog prepareChildren without picks).
 * The menu profit check and the margin alarm cost the standard build; the shopping list uses the
 * forecast of options and combo children instead (see forecast.ts / shopping-list.ts).
 */
import type Database from 'better-sqlite3'
import type { LocalizedName } from '../../../shared/insights'
import { resolveModifierGroups } from '../modifiers'
import { resolveComboSlots } from '../combos'
import { loadRecipes, type RecipeLine } from './costs'

/** Ingredient lines of every stock-using modifier option, keyed by option id. `via` = the option. */
export function loadOptionRecipes(db: Database.Database): Map<number, RecipeLine[]> {
  const rows = db.prepare(
    `SELECT moi.option_id AS optionId, moi.stock_item_id AS stockItemId, moi.quantity, moi.unit,
            si.unit_type AS stockUnit, si.is_active AS stockActive, si.name AS stockName,
            si.name_ar AS stockName_ar, si.name_fr AS stockName_fr,
            mo.name AS optionName, mo.name_ar AS optionName_ar, mo.name_fr AS optionName_fr
     FROM modifier_option_ingredients moi
     JOIN modifier_options mo ON mo.id = moi.option_id
     JOIN stock_items si ON si.id = moi.stock_item_id
     WHERE mo.kind <> 'no'
     ORDER BY moi.option_id, moi.id`
  ).all() as {
    optionId: number; stockItemId: number; quantity: number; unit: string; stockUnit: string; stockActive: number
    stockName: string; stockName_ar: string | null; stockName_fr: string | null
    optionName: string; optionName_ar: string | null; optionName_fr: string | null
  }[]
  const out = new Map<number, RecipeLine[]>()
  for (const row of rows) {
    const list = out.get(row.optionId) ?? []
    list.push({
      menuItemId: 0,
      stockItemId: row.stockItemId,
      quantity: row.quantity,
      unit: row.unit,
      stockUnit: row.stockUnit,
      stockActive: row.stockActive === 1,
      stockName: row.stockName,
      stockName_ar: row.stockName_ar,
      stockName_fr: row.stockName_fr,
      via: { name: row.optionName, name_ar: row.optionName_ar, name_fr: row.optionName_fr }
    })
    out.set(row.optionId, list)
  }
  return out
}

/** Default option ids of a menu item (order-catalog prepareModifiers with no picks). */
export function defaultOptionIds(db: Database.Database, menuItemId: number): number[] {
  const ids: number[] = []
  for (const group of resolveModifierGroups(db, menuItemId)) {
    const defaults = group.options.filter((option) => option.is_default)
    for (const option of defaults.slice(0, group.max_select ?? defaults.length)) ids.push(option.id)
  }
  return ids
}

/** "Burger · Extra cheese" in every language (falls back to the base name). */
function joinNames(outer: LocalizedName, inner: LocalizedName): LocalizedName {
  return {
    name: `${outer.name} · ${inner.name}`,
    name_ar: `${outer.name_ar || outer.name} · ${inner.name_ar || inner.name}`,
    name_fr: `${outer.name_fr || outer.name} · ${inner.name_fr || inner.name}`
  }
}

/** Standard-build recipe lines (see header) of every ACTIVE menu item that has any. */
export function loadCostingRecipes(db: Database.Database): Map<number, RecipeLine[]> {
  const own = loadRecipes(db)
  const optionRecipes = loadOptionRecipes(db)
  const hasModifiers = optionRecipes.size > 0
  const standard = new Map<number, RecipeLine[]>()
  const standardOf = (menuItemId: number): RecipeLine[] => {
    const cached = standard.get(menuItemId)
    if (cached) return cached
    const lines = [...(own.get(menuItemId) ?? [])]
    if (hasModifiers) {
      for (const optionId of defaultOptionIds(db, menuItemId)) {
        for (const line of optionRecipes.get(optionId) ?? []) lines.push({ ...line, menuItemId })
      }
    }
    standard.set(menuItemId, lines)
    return lines
  }

  const items = db.prepare('SELECT id, is_combo FROM menu_items WHERE is_active = 1').all() as { id: number; is_combo: number }[]
  const out = new Map<number, RecipeLine[]>()
  for (const item of items) {
    if (item.is_combo !== 1) {
      const lines = standardOf(item.id)
      if (lines.length > 0) out.set(item.id, lines)
      continue
    }
    const lines = [...(own.get(item.id) ?? [])]
    for (const slot of resolveComboSlots(db, item.id)) {
      for (const choice of slot.choices.filter((c) => c.is_default).slice(0, slot.max_select)) {
        const pick: LocalizedName = { name: choice.name, name_ar: choice.name_ar ?? null, name_fr: choice.name_fr ?? null }
        for (const line of standardOf(choice.menu_item_id)) {
          lines.push({ ...line, menuItemId: item.id, via: line.via ? joinNames(pick, line.via) : pick })
        }
      }
    }
    if (lines.length > 0) out.set(item.id, lines)
  }
  return out
}
