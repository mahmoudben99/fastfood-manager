/**
 * Modifier selection model for the item / combo sheets. Mirrors the main-process rules
 * (services/order-catalog.ts prepareModifiers): per group min_select ≤ units ≤ max_select,
 * one option at most max_quantity units, defaults applied up to max_select.
 */
import type { ResolvedModifierGroup } from '../../../../../shared/catalog-types'
import type { CartModifier } from '../../../store/orderStore'

/** groupId → optionId → units. */
export type Selection = Record<number, Record<number, number>>

export function isRequiredGroup(group: ResolvedModifierGroup): boolean {
  return group.is_required || group.min_select > 0
}

/** Required groups first (Toast/Square order), otherwise the configured order. */
export function sortGroups(groups: ResolvedModifierGroup[]): ResolvedModifierGroup[] {
  return groups
    .map((group, index) => ({ group, index }))
    .sort((a, b) => Number(isRequiredGroup(b.group)) - Number(isRequiredGroup(a.group)) || a.index - b.index)
    .map((entry) => entry.group)
}

export function defaultSelection(groups: ResolvedModifierGroup[]): Selection {
  const sel: Selection = {}
  for (const group of groups) {
    const defaults = group.options.filter((o) => o.is_default)
    const limited = group.max_select === null ? defaults : defaults.slice(0, group.max_select)
    sel[group.id] = Object.fromEntries(limited.map((o) => [o.id, 1]))
  }
  return sel
}

export function selectionFromCart(groups: ResolvedModifierGroup[], mods: CartModifier[] | undefined): Selection {
  if (!mods) return defaultSelection(groups)
  const sel: Selection = Object.fromEntries(groups.map((g) => [g.id, {}]))
  for (const mod of mods) {
    const group = groups.find((g) => g.options.some((o) => o.id === mod.option_id))
    if (group) sel[group.id][mod.option_id] = mod.quantity
  }
  return sel
}

export function groupUnits(sel: Selection, groupId: number): number {
  return Object.values(sel[groupId] || {}).reduce((sum, n) => sum + n, 0)
}

export function toggleOption(sel: Selection, group: ResolvedModifierGroup, optionId: number): Selection {
  const current = sel[group.id] || {}
  const selected = (current[optionId] || 0) > 0
  if (group.max_select === 1) {
    if (selected) return isRequiredGroup(group) ? sel : { ...sel, [group.id]: {} }
    return { ...sel, [group.id]: { [optionId]: 1 } }
  }
  if (selected) {
    const next = { ...current }
    delete next[optionId]
    return { ...sel, [group.id]: next }
  }
  if (group.max_select !== null && groupUnits(sel, group.id) >= group.max_select) return sel
  return { ...sel, [group.id]: { ...current, [optionId]: 1 } }
}

/** Units of one option (allow_quantity groups); 0 removes it. */
export function setOptionUnits(sel: Selection, group: ResolvedModifierGroup, optionId: number, units: number): Selection {
  const current = { ...(sel[group.id] || {}) }
  const others = groupUnits(sel, group.id) - (current[optionId] || 0)
  const groupRoom = group.max_select === null ? Infinity : group.max_select - others
  const next = Math.max(0, Math.min(units, group.max_quantity || 1, groupRoom))
  if (next === 0) delete current[optionId]
  else current[optionId] = next
  return { ...sel, [group.id]: current }
}

export function canAddMore(sel: Selection, group: ResolvedModifierGroup): boolean {
  return group.max_select === null || groupUnits(sel, group.id) < group.max_select
}

export function missingGroups(groups: ResolvedModifierGroup[], sel: Selection): ResolvedModifierGroup[] {
  return groups.filter((g) => groupUnits(sel, g.id) < g.min_select)
}

export function selectionToCart(groups: ResolvedModifierGroup[], sel: Selection): CartModifier[] {
  const out: CartModifier[] = []
  for (const group of groups) {
    for (const option of group.options) {
      const units = sel[group.id]?.[option.id] || 0
      if (units <= 0) continue
      out.push({
        option_id: option.id,
        group_id: group.id,
        name: option.name,
        name_ar: option.name_ar,
        name_fr: option.name_fr,
        kind: option.kind,
        price_delta: option.price_delta,
        quantity: units
      })
    }
  }
  return out
}

export function selectionExtra(groups: ResolvedModifierGroup[], sel: Selection): number {
  return selectionToCart(groups, sel).reduce((sum, m) => sum + m.price_delta * m.quantity, 0)
}

/** Modifiers the server would apply for an omitted list (defaults), as cart rows for display. */
export function defaultCartModifiers(groups: ResolvedModifierGroup[]): CartModifier[] {
  return selectionToCart(groups, defaultSelection(groups))
}
