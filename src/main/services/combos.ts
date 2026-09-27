import type Database from 'better-sqlite3'
import {
  MAX_MONEY, catalogError, catalogLang, flag, optionalName, requiredName, sortValue, soldOutSql
} from './catalog-common'
import type {
  ComboChoice, ComboChoiceInput, ComboDefinition, ComboSlot, ComboSlotInput, ResolvedCombo, ResolvedComboChoice,
  ResolvedComboSlot
} from '../../shared/catalog-types'

export type {
  ComboChoice, ComboChoiceInput, ComboDefinition, ComboSlot, ComboSlotInput, ResolvedCombo, ResolvedComboChoice,
  ResolvedComboSlot
}

/**
 * Combos: a menu item flagged is_combo (its price = the combo price) with ordered slots
 * ("Burger", "Side", "Drink"). Each slot allows min..max picks among menu items and/or whole
 * categories, with an optional upcharge per choice ("Large fries +100") and default choices.
 * Order-time expansion into child lines lives in order-catalog.ts.
 */

const MAX_SLOTS = 20
const MAX_PICKS = 20
const MAX_CHOICES = 200

/** Slots with their sellable choices (inactive items, combos and the combo itself are skipped). */
export function resolveComboSlots(db: Database.Database, comboItemId: number): ResolvedComboSlot[] {
  const slots = db.prepare('SELECT * FROM combo_slots WHERE combo_item_id = ? ORDER BY sort_order, id').all(comboItemId) as
    Omit<ComboSlot, 'choices'>[]
  const choiceRows = db.prepare(
    `SELECT csc.* FROM combo_slot_choices csc JOIN combo_slots cs ON cs.id = csc.slot_id
     WHERE cs.combo_item_id = ? ORDER BY csc.sort_order, csc.id`
  ).all(comboItemId) as Omit<ComboChoice, 'menu_item_name' | 'category_name'>[]
  const items = db.prepare(
    `SELECT mi.id, mi.name, mi.name_ar, mi.name_fr, mi.category_id, mi.price, mi.emoji, mi.image_path,
            ${soldOutSql('mi')} AS sold_out,
            (EXISTS (SELECT 1 FROM menu_item_modifier_groups WHERE menu_item_id = mi.id AND is_excluded = 0)
             OR EXISTS (SELECT 1 FROM category_modifier_groups WHERE category_id = mi.category_id)) AS has_modifiers
     FROM menu_items mi JOIN categories c ON c.id = mi.category_id
     WHERE mi.is_active = 1 AND c.is_active = 1 AND mi.is_combo = 0 AND mi.id <> ?
     ORDER BY mi.name, mi.id`
  ).all(comboItemId) as any[]
  const byId = new Map(items.map((item) => [item.id, item]))

  return slots.map((slot) => {
    const choices = new Map<number, ResolvedComboChoice>()
    const add = (item: any, row: { upcharge: number; is_default: number }, direct: boolean): void => {
      if (!item || (choices.has(item.id) && !direct)) return
      choices.set(item.id, {
        menu_item_id: item.id,
        name: item.name,
        name_ar: item.name_ar,
        name_fr: item.name_fr,
        category_id: item.category_id,
        price: item.price,
        upcharge: row.upcharge,
        is_default: direct && row.is_default === 1,
        sold_out: item.sold_out === 1,
        has_modifiers: item.has_modifiers === 1,
        emoji: item.emoji ?? null,
        image_path: item.image_path ?? null
      })
    }
    const rows = choiceRows.filter((row) => row.slot_id === slot.id)
    // Direct item choices win over the same item reached through a category choice.
    for (const row of rows) if (row.menu_item_id != null) add(byId.get(row.menu_item_id), row, true)
    for (const row of rows) {
      if (row.category_id == null) continue
      for (const item of items) if (item.category_id === row.category_id) add(item, row, false)
    }
    return {
      id: slot.id,
      name: slot.name,
      name_ar: slot.name_ar,
      name_fr: slot.name_fr,
      min_select: slot.min_select,
      max_select: slot.max_select,
      sort_order: slot.sort_order,
      choices: [...choices.values()]
    }
  })
}

export function createCombosService(db: Database.Database) {
  const lang = () => catalogLang(db)

  function get(menuItemId: number): ComboDefinition | null {
    const item = db.prepare('SELECT id, name, name_ar, name_fr, price, is_active, is_combo FROM menu_items WHERE id = ?')
      .get(menuItemId) as any
    if (!item || item.is_combo !== 1) return null
    const slots = db.prepare('SELECT * FROM combo_slots WHERE combo_item_id = ? ORDER BY sort_order, id').all(menuItemId) as
      Omit<ComboSlot, 'choices'>[]
    const choices = db.prepare(
      `SELECT csc.*, mi.name AS menu_item_name, c.name AS category_name
       FROM combo_slot_choices csc JOIN combo_slots cs ON cs.id = csc.slot_id
       LEFT JOIN menu_items mi ON mi.id = csc.menu_item_id LEFT JOIN categories c ON c.id = csc.category_id
       WHERE cs.combo_item_id = ? ORDER BY csc.sort_order, csc.id`
    ).all(menuItemId) as ComboChoice[]
    return {
      menu_item_id: item.id,
      name: item.name,
      name_ar: item.name_ar,
      name_fr: item.name_fr,
      price: item.price,
      is_active: item.is_active,
      slots: slots.map((slot) => ({ ...slot, choices: choices.filter((choice) => choice.slot_id === slot.id) }))
    }
  }

  function list(): ComboDefinition[] {
    const ids = db.prepare('SELECT id FROM menu_items WHERE is_combo = 1 ORDER BY is_active DESC, name, id').all() as { id: number }[]
    return ids.map((row) => get(row.id)!).filter(Boolean)
  }

  function normalizeSlots(menuItemId: number, raw: unknown) {
    const l = lang()
    if (!Array.isArray(raw) || raw.length === 0) throw catalogError(l, 'combo_needs_slot')
    if (raw.length > MAX_SLOTS) throw catalogError(l, 'invalid_choice')
    const existing = new Set((db.prepare('SELECT id FROM combo_slots WHERE combo_item_id = ?').all(menuItemId) as { id: number }[])
      .map((row) => row.id))
    return raw.map((slot: any, slotIndex) => {
      const name = requiredName(slot?.name, l)
      const min = slot?.min_select === undefined ? 1 : Number(slot.min_select)
      const max = slot?.max_select === undefined ? Math.max(1, min) : Number(slot.max_select)
      if (!Number.isInteger(min) || !Number.isInteger(max) || min < 0 || max < 1 || max < min || max > MAX_PICKS) {
        throw catalogError(l, 'invalid_selection_rules')
      }
      if (!Array.isArray(slot?.choices) || slot.choices.length === 0) throw catalogError(l, 'slot_needs_choice', { slot: name })
      if (slot.choices.length > MAX_CHOICES) throw catalogError(l, 'invalid_choice')
      const seen = new Set<string>()
      const choices = slot.choices.map((choice: any, choiceIndex: number) => {
        const itemId = choice?.menu_item_id == null ? null : Number(choice.menu_item_id)
        const categoryId = choice?.category_id == null ? null : Number(choice.category_id)
        if ((itemId === null) === (categoryId === null)) throw catalogError(l, 'invalid_choice')
        const key = itemId !== null ? `i${itemId}` : `c${categoryId}`
        if (seen.has(key)) throw catalogError(l, 'invalid_choice')
        seen.add(key)
        if (itemId !== null) {
          const item = Number.isInteger(itemId) ? db.prepare('SELECT is_combo FROM menu_items WHERE id = ?').get(itemId) as
            { is_combo: number } | undefined : undefined
          if (!item) throw catalogError(l, 'menu_item_not_found')
          if (item.is_combo === 1 || itemId === menuItemId) throw catalogError(l, 'combo_nested')
        } else if (!Number.isInteger(categoryId) || !db.prepare('SELECT 1 FROM categories WHERE id = ?').get(categoryId)) {
          throw catalogError(l, 'category_not_found')
        }
        const upcharge = choice?.upcharge === undefined || choice?.upcharge === null ? 0 : Number(choice.upcharge)
        if (!Number.isFinite(upcharge) || upcharge < 0 || upcharge > MAX_MONEY) throw catalogError(l, 'invalid_upcharge', { max: MAX_MONEY })
        const isDefault = flag(choice?.is_default, 0)
        if (isDefault === 1 && itemId === null) throw catalogError(l, 'default_choice_category')
        return { menu_item_id: itemId, category_id: categoryId, upcharge, is_default: isDefault, sort_order: sortValue(choice?.sort_order, choiceIndex) }
      })
      if (choices.filter((choice: { is_default: number }) => choice.is_default === 1).length > max) {
        throw catalogError(l, 'too_many_defaults', { slot: name })
      }
      const id = Number(slot?.id)
      return {
        id: Number.isInteger(id) && existing.has(id) ? id : null,
        name,
        name_ar: optionalName(slot?.name_ar, 'name_ar', l) ?? null,
        name_fr: optionalName(slot?.name_fr, 'name_fr', l) ?? null,
        min_select: min,
        max_select: max,
        sort_order: sortValue(slot?.sort_order, slotIndex),
        choices
      }
    })
  }

  /** Flags the menu item as a combo and replaces its slots (ids given in `slots[].id` are kept). */
  function save(menuItemId: number, input: { slots: ComboSlotInput[] }): ComboDefinition {
    const l = lang()
    const item = db.prepare('SELECT id FROM menu_items WHERE id = ?').get(menuItemId)
    if (!item) throw catalogError(l, 'menu_item_not_found')
    const usedAsChoice = db.prepare(
      `SELECT 1 FROM combo_slot_choices csc JOIN combo_slots cs ON cs.id = csc.slot_id
       WHERE csc.menu_item_id = ? AND cs.combo_item_id <> ? LIMIT 1`
    ).get(menuItemId, menuItemId)
    if (usedAsChoice) throw catalogError(l, 'combo_nested')
    const slots = normalizeSlots(menuItemId, input?.slots)
    db.transaction(() => {
      db.prepare("UPDATE menu_items SET is_combo = 1, updated_at = datetime('now') WHERE id = ?").run(menuItemId)
      const keep = slots.map((slot) => slot.id).filter((id): id is number => id !== null)
      db.prepare(
        `DELETE FROM combo_slots WHERE combo_item_id = ? ${keep.length ? `AND id NOT IN (${keep.map(() => '?').join(',')})` : ''}`
      ).run(menuItemId, ...keep)
      const insertChoice = db.prepare(
        `INSERT INTO combo_slot_choices (slot_id, menu_item_id, category_id, upcharge, is_default, sort_order)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      for (const slot of slots) {
        let slotId = slot.id
        const fields = [slot.name, slot.name_ar, slot.name_fr, slot.min_select, slot.max_select, slot.sort_order]
        if (slotId === null) {
          slotId = Number(db.prepare(
            `INSERT INTO combo_slots (name, name_ar, name_fr, min_select, max_select, sort_order, combo_item_id)
             VALUES (?, ?, ?, ?, ?, ?, ?)`
          ).run(...fields, menuItemId).lastInsertRowid)
        } else {
          db.prepare(
            `UPDATE combo_slots SET name = ?, name_ar = ?, name_fr = ?, min_select = ?, max_select = ?, sort_order = ?,
             updated_at = datetime('now') WHERE id = ?`
          ).run(...fields, slotId)
          db.prepare('DELETE FROM combo_slot_choices WHERE slot_id = ?').run(slotId)
        }
        for (const choice of slot.choices) {
          insertChoice.run(slotId, choice.menu_item_id, choice.category_id, choice.upcharge, choice.is_default, choice.sort_order)
        }
      }
    })()
    return get(menuItemId)!
  }

  /** Turns the item back into a plain menu item (its slots are deleted; sold orders are untouched). */
  function remove(menuItemId: number): boolean {
    return db.transaction(() => {
      db.prepare('DELETE FROM combo_slots WHERE combo_item_id = ?').run(menuItemId)
      return db.prepare("UPDATE menu_items SET is_combo = 0, updated_at = datetime('now') WHERE id = ? AND is_combo = 1")
        .run(menuItemId).changes > 0
    })()
  }

  /** The order screen's view: null when the item is not a combo. */
  function getForMenuItem(menuItemId: number): ResolvedCombo | null {
    const item = db.prepare(
      `SELECT mi.id, mi.name, mi.name_ar, mi.name_fr, mi.price, mi.is_combo, ${soldOutSql('mi')} AS sold_out
       FROM menu_items mi WHERE mi.id = ?`
    ).get(menuItemId) as any
    if (!item || item.is_combo !== 1) return null
    return {
      menu_item_id: item.id,
      name: item.name,
      name_ar: item.name_ar,
      name_fr: item.name_fr,
      price: item.price,
      sold_out: item.sold_out === 1,
      slots: resolveComboSlots(db, menuItemId)
    }
  }

  return { list, get, save, remove, getForMenuItem }
}

/** Manual 86 flag + the automatic "no stock left" rule (setting auto_sold_out). */
export function createSoldOutService(db: Database.Database) {
  return {
    set(menuItemId: number, soldOut: boolean): { id: number; is_sold_out: number; sold_out: number } {
      if (!Number.isInteger(menuItemId) || !db.prepare('SELECT 1 FROM menu_items WHERE id = ?').get(menuItemId)) {
        throw catalogError(catalogLang(db), 'menu_item_not_found')
      }
      db.prepare("UPDATE menu_items SET is_sold_out = ?, updated_at = datetime('now') WHERE id = ?").run(soldOut ? 1 : 0, menuItemId)
      return db.prepare(`SELECT mi.id, mi.is_sold_out, ${soldOutSql('mi')} AS sold_out FROM menu_items mi WHERE mi.id = ?`)
        .get(menuItemId) as { id: number; is_sold_out: number; sold_out: number }
    },
    /** Active items that cannot be ordered right now; `manual` = 86'd by hand, `auto` = out of stock. */
    list(): { id: number; name: string; manual: boolean; auto: boolean }[] {
      const rows = db.prepare(
        `SELECT mi.id, mi.name, mi.is_sold_out, ${soldOutSql('mi')} AS sold_out FROM menu_items mi
         WHERE mi.is_active = 1 ORDER BY mi.name, mi.id`
      ).all() as { id: number; name: string; is_sold_out: number; sold_out: number }[]
      return rows.filter((row) => row.sold_out === 1)
        .map((row) => ({ id: row.id, name: row.name, manual: row.is_sold_out === 1, auto: row.is_sold_out !== 1 }))
    },
    getAuto(): boolean {
      return (db.prepare("SELECT value FROM settings WHERE key = 'auto_sold_out'").get() as { value: string } | undefined)?.value === 'true'
    },
    setAuto(enabled: boolean): boolean {
      db.prepare("INSERT INTO settings (key, value) VALUES ('auto_sold_out', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
        .run(enabled ? 'true' : 'false')
      return enabled
    }
  }
}
