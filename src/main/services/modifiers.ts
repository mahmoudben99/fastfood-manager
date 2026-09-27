import type Database from 'better-sqlite3'
import type {
  ModifierAssignmentInput, ModifierGroup, ModifierGroupInput, ModifierKind, ModifierOption, ModifierOptionInput,
  ResolvedModifierGroup, ResolvedModifierOption
} from '../../shared/catalog-types'
import {
  MAX_MONEY, catalogError, catalogLang, flag, optionalName, requiredName, sortValue, validateIngredients
} from './catalog-common'

export type {
  ModifierAssignmentInput, ModifierGroup, ModifierGroupInput, ModifierKind, ModifierOption, ModifierOptionInput,
  ResolvedModifierGroup, ResolvedModifierOption
}

/**
 * Modifier groups ("Sauce", "Extras", "Remove") and their options, assigned to menu items and/or
 * whole categories. Admin CRUD + the resolved view the order screen needs. Order-time validation
 * and snapshots live in order-catalog.ts.
 *
 * Selection rules (Toast model): `min_select` only counts when `is_required` (then at least 1);
 * `max_select` (null = no limit) caps the total units chosen in the group; with `allow_quantity`
 * one option may be taken several times ("Extra cheese x2"), each unit counting toward max.
 * Assignment: category rows apply to every item of the category; an item row for the same group
 * overrides its sort order, or hides it with `excluded: true`; item-only rows add groups.
 */

export const MODIFIER_KINDS: readonly ModifierKind[] = ['none', 'extra', 'light', 'no']
/** Hard cap on how many times one option can be taken per unit of an order line. */
export const MAX_MODIFIER_QUANTITY = 10
const MAX_RULE = 50

/** Every active group (with its active options) that applies to a menu item, in display order. */
export function resolveModifierGroups(db: Database.Database, menuItemId: number): ResolvedModifierGroup[] {
  const item = db.prepare('SELECT id, category_id FROM menu_items WHERE id = ?').get(menuItemId) as
    | { id: number; category_id: number }
    | undefined
  if (!item) return []
  const picked = new Map<number, { sort: number; source: 'item' | 'category' }>()
  const categoryRows = db.prepare(
    'SELECT group_id, sort_order FROM category_modifier_groups WHERE category_id = ?'
  ).all(item.category_id) as { group_id: number; sort_order: number }[]
  for (const row of categoryRows) picked.set(row.group_id, { sort: row.sort_order, source: 'category' })
  const itemRows = db.prepare(
    'SELECT group_id, sort_order, is_excluded FROM menu_item_modifier_groups WHERE menu_item_id = ?'
  ).all(menuItemId) as { group_id: number; sort_order: number; is_excluded: number }[]
  for (const row of itemRows) {
    if (row.is_excluded === 1) picked.delete(row.group_id)
    else picked.set(row.group_id, { sort: row.sort_order, source: 'item' })
  }
  if (picked.size === 0) return []

  const ids = [...picked.keys()]
  const groups = db.prepare(
    `SELECT * FROM modifier_groups WHERE is_active = 1 AND id IN (${ids.map(() => '?').join(',')})`
  ).all(...ids) as Omit<ModifierGroup, 'options'>[]
  const options = db.prepare(
    `SELECT id, group_id, name, name_ar, name_fr, kind, price_delta, is_default, sort_order
     FROM modifier_options WHERE is_active = 1 AND group_id IN (${ids.map(() => '?').join(',')})
     ORDER BY sort_order, id`
  ).all(...ids) as (Omit<ResolvedModifierOption, 'is_default'> & { is_default: number })[]

  return groups
    .map((group) => {
      const assignment = picked.get(group.id)!
      const required = group.is_required === 1
      const max = group.max_select == null ? null : group.max_select
      return {
        id: group.id,
        name: group.name,
        name_ar: group.name_ar,
        name_fr: group.name_fr,
        min_select: required ? Math.max(1, group.min_select) : 0,
        max_select: max,
        is_required: required,
        allow_quantity: group.allow_quantity === 1,
        max_quantity: group.allow_quantity === 1 ? Math.min(MAX_MODIFIER_QUANTITY, max ?? MAX_MODIFIER_QUANTITY) : 1,
        source: assignment.source,
        sort_order: assignment.sort,
        options: options
          .filter((option) => option.group_id === group.id)
          .map((option) => ({ ...option, is_default: option.is_default === 1 }))
      }
    })
    .filter((group) => group.options.length > 0)
    .sort((a, b) =>
      a.sort_order - b.sort_order ||
      (a.source === b.source ? 0 : a.source === 'item' ? -1 : 1) ||
      a.id - b.id)
}

export function createModifiersService(db: Database.Database) {
  const lang = () => catalogLang(db)

  function groupRow(id: number): Omit<ModifierGroup, 'options'> | undefined {
    return db.prepare('SELECT * FROM modifier_groups WHERE id = ?').get(id) as Omit<ModifierGroup, 'options'> | undefined
  }

  function optionsOf(groupIds: number[]): ModifierOption[] {
    if (groupIds.length === 0) return []
    const options = db.prepare(
      `SELECT * FROM modifier_options WHERE group_id IN (${groupIds.map(() => '?').join(',')}) ORDER BY sort_order, id`
    ).all(...groupIds) as ModifierOption[]
    const ingredients = db.prepare(
      `SELECT moi.option_id, moi.stock_item_id, moi.quantity, moi.unit,
              si.name AS stock_item_name, si.unit_type AS stock_unit_type
       FROM modifier_option_ingredients moi LEFT JOIN stock_items si ON si.id = moi.stock_item_id
       WHERE moi.option_id IN (SELECT id FROM modifier_options WHERE group_id IN (${groupIds.map(() => '?').join(',')}))
       ORDER BY moi.id`
    ).all(...groupIds) as (ModifierOption['ingredients'][number] & { option_id: number })[]
    return options.map((option) => ({
      ...option,
      ingredients: ingredients
        .filter((row) => row.option_id === option.id)
        .map(({ option_id: _unused, ...rest }) => rest)
    }))
  }

  function getGroup(id: number): ModifierGroup | undefined {
    const group = groupRow(id)
    return group ? { ...group, options: optionsOf([id]) } : undefined
  }

  function listGroups(opts: { includeInactive?: boolean } = {}): ModifierGroup[] {
    const groups = db.prepare(
      `SELECT * FROM modifier_groups ${opts.includeInactive ? '' : 'WHERE is_active = 1'} ORDER BY sort_order, name, id`
    ).all() as Omit<ModifierGroup, 'options'>[]
    const options = optionsOf(groups.map((group) => group.id))
    return groups.map((group) => ({ ...group, options: options.filter((option) => option.group_id === group.id) }))
  }

  function groupFields(input: Partial<ModifierGroupInput>, current?: Omit<ModifierGroup, 'options'>) {
    const l = lang()
    const pick = <T>(next: T | undefined, fallback: T): T => (next === undefined ? fallback : next)
    const min = input.min_select === undefined ? current?.min_select ?? 0 : Number(input.min_select)
    const max = input.max_select === undefined ? current?.max_select ?? null : input.max_select === null ? null : Number(input.max_select)
    if (!Number.isInteger(min) || min < 0 || min > MAX_RULE ||
        (max !== null && (!Number.isInteger(max) || max < 1 || max > MAX_RULE || max < min))) {
      throw catalogError(l, 'invalid_selection_rules')
    }
    const required = flag(input.is_required, current?.is_required ?? 0)
    if (required === 1 && max !== null && max < Math.max(1, min)) throw catalogError(l, 'invalid_selection_rules')
    return {
      name: input.name === undefined && current ? current.name : requiredName(input.name, l),
      name_ar: pick(optionalName(input.name_ar, 'name_ar', l), current?.name_ar ?? null),
      name_fr: pick(optionalName(input.name_fr, 'name_fr', l), current?.name_fr ?? null),
      min_select: min,
      max_select: max,
      is_required: required,
      allow_quantity: flag(input.allow_quantity, current?.allow_quantity ?? 0),
      sort_order: sortValue(input.sort_order, current?.sort_order ?? 0),
      is_active: flag(input.is_active, current?.is_active ?? 1)
    }
  }

  function createGroup(input: ModifierGroupInput): ModifierGroup {
    const f = groupFields(input ?? ({} as ModifierGroupInput))
    const id = Number(db.prepare(
      `INSERT INTO modifier_groups (name, name_ar, name_fr, min_select, max_select, is_required, allow_quantity, sort_order, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(f.name, f.name_ar, f.name_fr, f.min_select, f.max_select, f.is_required, f.allow_quantity, f.sort_order, f.is_active).lastInsertRowid)
    return getGroup(id)!
  }

  function updateGroup(id: number, input: Partial<ModifierGroupInput>): ModifierGroup {
    const current = groupRow(id)
    if (!current) throw catalogError(lang(), 'group_not_found')
    const f = groupFields(input ?? {}, current)
    db.prepare(
      `UPDATE modifier_groups SET name = ?, name_ar = ?, name_fr = ?, min_select = ?, max_select = ?, is_required = ?,
       allow_quantity = ?, sort_order = ?, is_active = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(f.name, f.name_ar, f.name_fr, f.min_select, f.max_select, f.is_required, f.allow_quantity, f.sort_order, f.is_active, id)
    return getGroup(id)!
  }

  /** Hard delete (options, ingredients and assignments cascade). Sold orders keep their snapshots. */
  function deleteGroup(id: number): boolean {
    return db.prepare('DELETE FROM modifier_groups WHERE id = ?').run(id).changes > 0
  }

  function optionRow(id: number): Omit<ModifierOption, 'ingredients'> | undefined {
    return db.prepare('SELECT * FROM modifier_options WHERE id = ?').get(id) as Omit<ModifierOption, 'ingredients'> | undefined
  }

  function saveOption(groupId: number, input: Partial<ModifierOptionInput>, current?: Omit<ModifierOption, 'ingredients'>): number {
    const l = lang()
    const kind = (input.kind === undefined ? current?.kind ?? 'none' : input.kind) as ModifierKind
    if (!MODIFIER_KINDS.includes(kind)) throw catalogError(l, 'invalid_kind')
    const delta = input.price_delta === undefined ? current?.price_delta ?? 0 : Number(input.price_delta)
    if (!Number.isFinite(delta) || Math.abs(delta) > MAX_MONEY) throw catalogError(l, 'invalid_price_delta', { max: MAX_MONEY })
    const ingredients = input.ingredients === undefined ? undefined : validateIngredients(db, input.ingredients, l)
    const keptIngredients = current && ingredients === undefined
      ? (db.prepare('SELECT COUNT(*) AS n FROM modifier_option_ingredients WHERE option_id = ?').get(current.id) as { n: number }).n
      : ingredients?.length ?? 0
    if (kind === 'no' && keptIngredients > 0) throw catalogError(l, 'no_kind_ingredients')
    const pick = <T>(next: T | undefined, fallback: T): T => (next === undefined ? fallback : next)
    const values = [
      input.name === undefined && current ? current.name : requiredName(input.name, l),
      pick(optionalName(input.name_ar, 'name_ar', l), current?.name_ar ?? null),
      pick(optionalName(input.name_fr, 'name_fr', l), current?.name_fr ?? null),
      kind,
      delta,
      flag(input.is_default, current?.is_default ?? 0),
      sortValue(input.sort_order, current?.sort_order ?? 0),
      flag(input.is_active, current?.is_active ?? 1)
    ]
    return db.transaction(() => {
      let id = current?.id
      if (id === undefined) {
        id = Number(db.prepare(
          `INSERT INTO modifier_options (name, name_ar, name_fr, kind, price_delta, is_default, sort_order, is_active, group_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(...values, groupId).lastInsertRowid)
      } else {
        db.prepare(
          `UPDATE modifier_options SET name = ?, name_ar = ?, name_fr = ?, kind = ?, price_delta = ?, is_default = ?,
           sort_order = ?, is_active = ?, updated_at = datetime('now') WHERE id = ?`
        ).run(...values, id)
      }
      if (ingredients !== undefined) {
        db.prepare('DELETE FROM modifier_option_ingredients WHERE option_id = ?').run(id)
        const insert = db.prepare('INSERT INTO modifier_option_ingredients (option_id, stock_item_id, quantity, unit) VALUES (?, ?, ?, ?)')
        for (const ingredient of ingredients) insert.run(id, ingredient.stock_item_id, ingredient.quantity, ingredient.unit)
      }
      return id
    })()
  }

  function getOption(id: number): ModifierOption | undefined {
    const row = optionRow(id)
    return row ? optionsOf([row.group_id]).find((option) => option.id === id) : undefined
  }

  function createOption(groupId: number, input: ModifierOptionInput): ModifierOption {
    if (!groupRow(groupId)) throw catalogError(lang(), 'group_not_found')
    return getOption(saveOption(groupId, input ?? ({} as ModifierOptionInput)))!
  }

  function updateOption(id: number, input: Partial<ModifierOptionInput>): ModifierOption {
    const current = optionRow(id)
    if (!current) throw catalogError(lang(), 'option_not_found')
    return getOption(saveOption(current.group_id, input ?? {}, current))!
  }

  function deleteOption(id: number): boolean {
    return db.prepare('DELETE FROM modifier_options WHERE id = ?').run(id).changes > 0
  }

  function normalizeAssignments(entries: unknown, allowExclude: boolean): Required<ModifierAssignmentInput>[] {
    const l = lang()
    if (!Array.isArray(entries) || entries.length > 100) throw catalogError(l, 'invalid_assignment')
    const seen = new Set<number>()
    return entries.map((entry, index) => {
      const groupId = Number(entry?.group_id)
      if (!Number.isInteger(groupId) || seen.has(groupId)) throw catalogError(l, 'invalid_assignment')
      if (!groupRow(groupId)) throw catalogError(l, 'group_not_found')
      seen.add(groupId)
      return {
        group_id: groupId,
        sort_order: sortValue(entry?.sort_order, index),
        excluded: allowExclude && flag(entry?.excluded, 0) === 1
      }
    })
  }

  function getItemAssignments(menuItemId: number): Required<ModifierAssignmentInput>[] {
    return (db.prepare(
      'SELECT group_id, sort_order, is_excluded FROM menu_item_modifier_groups WHERE menu_item_id = ? ORDER BY sort_order, id'
    ).all(menuItemId) as { group_id: number; sort_order: number; is_excluded: number }[])
      .map((row) => ({ group_id: row.group_id, sort_order: row.sort_order, excluded: row.is_excluded === 1 }))
  }

  /** Replaces every item-level row of the menu item. */
  function setItemAssignments(menuItemId: number, entries: ModifierAssignmentInput[]): Required<ModifierAssignmentInput>[] {
    if (!db.prepare('SELECT 1 FROM menu_items WHERE id = ?').get(menuItemId)) throw catalogError(lang(), 'menu_item_not_found')
    const rows = normalizeAssignments(entries, true)
    db.transaction(() => {
      db.prepare('DELETE FROM menu_item_modifier_groups WHERE menu_item_id = ?').run(menuItemId)
      const insert = db.prepare('INSERT INTO menu_item_modifier_groups (menu_item_id, group_id, sort_order, is_excluded) VALUES (?, ?, ?, ?)')
      for (const row of rows) insert.run(menuItemId, row.group_id, row.sort_order, row.excluded ? 1 : 0)
    })()
    return getItemAssignments(menuItemId)
  }

  function getCategoryAssignments(categoryId: number): { group_id: number; sort_order: number }[] {
    return db.prepare(
      'SELECT group_id, sort_order FROM category_modifier_groups WHERE category_id = ? ORDER BY sort_order, id'
    ).all(categoryId) as { group_id: number; sort_order: number }[]
  }

  /** Replaces every row of the category. */
  function setCategoryAssignments(categoryId: number, entries: ModifierAssignmentInput[]): { group_id: number; sort_order: number }[] {
    if (!db.prepare('SELECT 1 FROM categories WHERE id = ?').get(categoryId)) throw catalogError(lang(), 'category_not_found')
    const rows = normalizeAssignments(entries, false)
    db.transaction(() => {
      db.prepare('DELETE FROM category_modifier_groups WHERE category_id = ?').run(categoryId)
      const insert = db.prepare('INSERT INTO category_modifier_groups (category_id, group_id, sort_order) VALUES (?, ?, ?)')
      for (const row of rows) insert.run(categoryId, row.group_id, row.sort_order)
    })()
    return getCategoryAssignments(categoryId)
  }

  return {
    listGroups, getGroup, createGroup, updateGroup, deleteGroup,
    createOption, updateOption, deleteOption,
    getItemAssignments, setItemAssignments, getCategoryAssignments, setCategoryAssignments,
    getForMenuItem: (menuItemId: number) => resolveModifierGroups(db, menuItemId)
  }
}
