import type Database from 'better-sqlite3'
import { catalogMessage } from '../../shared/catalog-messages'
import {
  childrenExtras, modifierExtras, prepareChildren, prepareModifiers, roundCents,
  type CatalogContext, type PreparedCatalogLine, type PreparedChild, type PreparedModifier
} from './order-catalog'
import type { KitchenLineSnapshot } from './print-routing'
import { totalRecipeDeduction } from './stock-units'

/**
 * Database effects of modifiers and combos on order lines, recorded exactly like recipe
 * deductions (order_item_deductions + stock_adjustments) so cancel / restore / quantity edits in
 * order-service keep working unchanged: every deduction row belongs to the line it was made for
 * and is proportional to that line's quantity. Modifier-caused rows also carry
 * order_item_modifier_id so an edit of the option set reverses exactly those.
 */

export interface CatalogWriteContext {
  orderId: number
  /** 'order_deduction' when the order is created, 'order_edit' for edits (same as order-service). */
  adjustmentType: 'order_deduction' | 'order_edit'
  reason: string
}

function deduct(
  db: Database.Database,
  w: CatalogWriteContext,
  orderItemId: number,
  stockItemId: number,
  amount: number,
  costPerUnit: number,
  modifierId: number | null
): void {
  const before = (db.prepare('SELECT quantity FROM stock_items WHERE id = ?').get(stockItemId) as { quantity: number }).quantity
  db.prepare("UPDATE stock_items SET quantity = quantity - ?, updated_at = datetime('now') WHERE id = ?").run(amount, stockItemId)
  db.prepare(
    `INSERT INTO order_item_deductions (order_item_id, stock_item_id, quantity_deducted, cost_per_unit, order_item_modifier_id)
     VALUES (?, ?, ?, ?, ?)`
  ).run(orderItemId, stockItemId, amount, costPerUnit, modifierId)
  db.prepare(
    `INSERT INTO stock_adjustments (stock_item_id, adjustment_type, quantity_change, previous_qty, new_qty, affects_cost, reason)
     VALUES (?, ?, ?, ?, ?, 0, ?)`
  ).run(stockItemId, w.adjustmentType, -amount, before, before - amount, w.reason)
}

function adjust(db: Database.Database, stockItemId: number, change: number, reason: string): void {
  if (Math.abs(change) < 1e-12) return
  const stock = db.prepare('SELECT quantity FROM stock_items WHERE id = ?').get(stockItemId) as { quantity: number } | undefined
  if (!stock) return
  db.prepare("UPDATE stock_items SET quantity = ?, updated_at = datetime('now') WHERE id = ?").run(stock.quantity + change, stockItemId)
  db.prepare(
    `INSERT INTO stock_adjustments (stock_item_id, adjustment_type, quantity_change, previous_qty, new_qty, affects_cost, reason)
     VALUES (?, 'order_edit', ?, ?, ?, 0, ?)`
  ).run(stockItemId, change, stock.quantity, stock.quantity + change, reason)
}

/** Gives back and deletes deduction rows (edit only). */
function restoreRows(db: Database.Database, rows: { id: number; stock_item_id: number; quantity_deducted: number }[], reason: string): void {
  for (const row of rows) {
    adjust(db, row.stock_item_id, row.quantity_deducted, reason)
    db.prepare('DELETE FROM order_item_deductions WHERE id = ?').run(row.id)
  }
}

function insertModifiers(db: Database.Database, w: CatalogWriteContext, orderItemId: number, lineQuantity: number, modifiers: PreparedModifier[]): void {
  const insert = db.prepare(
    `INSERT INTO order_item_modifiers
     (order_item_id, option_id, group_id, group_name, name, name_ar, name_fr, kind, price_delta, quantity, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
  for (const m of modifiers) {
    const modifierId = Number(insert.run(
      orderItemId, m.option_id, m.group_id, m.group_name, m.name, m.name_ar, m.name_fr, m.kind, m.price_delta, m.quantity, m.sort_order
    ).lastInsertRowid)
    for (const ingredient of m.ingredients) {
      const amount = totalRecipeDeduction(ingredient.recipe_quantity, lineQuantity * m.quantity, ingredient.unit, ingredient.stock_unit)
      deduct(db, w, orderItemId, ingredient.stock_item_id, amount, ingredient.price_per_unit, modifierId)
    }
  }
}

function insertChildren(db: Database.Database, w: CatalogWriteContext, parentId: number, quantity: number, children: PreparedChild[]): number[] {
  const insert = db.prepare(
    `INSERT INTO order_items
     (order_id, menu_item_id, quantity, unit_price, total_price, notes, worker_id, item_name, item_name_ar, item_name_fr,
      parent_order_item_id, line_kind, combo_slot_id, combo_upcharge)
     VALUES (?, ?, ?, 0, 0, ?, ?, ?, ?, ?, ?, 'combo_child', ?, ?)`
  )
  return children.map((child) => {
    const childId = Number(insert.run(
      w.orderId, child.menu.id, quantity, child.note, child.workerId, child.menu.name, child.menu.name_ar ?? null,
      child.menu.name_fr ?? null, parentId, child.slot_id, child.upcharge
    ).lastInsertRowid)
    for (const ingredient of child.recipe) {
      const amount = totalRecipeDeduction(ingredient.recipe_quantity, quantity, ingredient.unit, ingredient.stock_unit)
      deduct(db, w, childId, ingredient.stock_item_id, amount, ingredient.price_per_unit, null)
    }
    insertModifiers(db, w, childId, quantity, child.modifiers)
    return childId
  })
}

/**
 * Splits a combo line's total over its children: premium upcharges and paid options stay with
 * the child that caused them; the rest (the combo price) is shared in proportion to each child's
 * normal menu price (equally when those are all 0). Cent-rounded; the sum is exactly `total`.
 */
export function allocateComboRevenue(total: number, parts: { weight: number; own: number }[]): number[] {
  if (parts.length === 0) return []
  const ownSum = parts.reduce((sum, part) => sum + Math.max(0, part.own), 0)
  let raw: number[]
  if (total >= ownSum) {
    const pool = total - ownSum
    const weightSum = parts.reduce((sum, part) => sum + Math.max(0, part.weight), 0)
    raw = parts.map((part) => Math.max(0, part.own) +
      (weightSum > 0 ? (pool * Math.max(0, part.weight)) / weightSum : pool / parts.length))
  } else {
    raw = parts.map((part) => (ownSum > 0 ? (total * Math.max(0, part.own)) / ownSum : total / parts.length))
  }
  return fixRounding(total, raw)
}

function fixRounding(total: number, raw: number[]): number[] {
  const rounded = raw.map(roundCents)
  const diff = roundCents(total - rounded.reduce((sum, value) => sum + value, 0))
  if (diff !== 0) {
    const largest = rounded.indexOf(Math.max(...rounded))
    rounded[largest] = roundCents(rounded[largest] + diff)
  }
  return rounded
}

function storeAllocation(db: Database.Database, ids: number[], amounts: number[]): void {
  const update = db.prepare('UPDATE order_items SET allocated_revenue = ? WHERE id = ?')
  ids.forEach((id, index) => update.run(amounts[index], id))
}

/** After the base line (and its recipe) is written: options, combo children, allocation. */
export function applyCatalogLine(
  db: Database.Database,
  w: CatalogWriteContext,
  line: { itemId: number; prepared: PreparedCatalogLine; quantity: number; lineTotal: number }
): void {
  const { itemId, prepared, quantity } = line
  if (prepared.isCombo) db.prepare("UPDATE order_items SET line_kind = 'combo', worker_id = NULL WHERE id = ?").run(itemId)
  insertModifiers(db, w, itemId, quantity, prepared.modifiers)
  if (!prepared.isCombo) return
  const ids = insertChildren(db, w, itemId, quantity, prepared.children)
  storeAllocation(db, ids, allocateComboRevenue(line.lineTotal, prepared.children.map((child) => ({
    weight: Number(child.menu.price) || 0,
    own: (child.upcharge + modifierExtras(child.modifiers)) * quantity
  }))))
}

// ─── Editing an existing line ───────────────────────────────────────────────────────────────

interface StoredLine { id: number; menu_item_id: number; quantity: number; unit_price: number; line_kind?: string | null }

function storedModifiers(db: Database.Database, orderItemId: number): { option_id: number | null; quantity: number; price_delta: number }[] {
  return db.prepare('SELECT option_id, quantity, price_delta FROM order_item_modifiers WHERE order_item_id = ? ORDER BY sort_order, id')
    .all(orderItemId) as { option_id: number | null; quantity: number; price_delta: number }[]
}

function storedChildren(db: Database.Database, parentId: number): { id: number; menu_item_id: number; combo_slot_id: number | null; combo_upcharge: number; quantity: number }[] {
  return db.prepare('SELECT id, menu_item_id, combo_slot_id, combo_upcharge, quantity FROM order_items WHERE parent_order_item_id = ? ORDER BY id')
    .all(parentId) as { id: number; menu_item_id: number; combo_slot_id: number | null; combo_upcharge: number; quantity: number }[]
}

const pickKey = (list: { option_id?: unknown; optionId?: unknown; quantity?: unknown }[]): string =>
  list.map((entry) => `${Number(entry.option_id ?? entry.optionId)}:${entry.quantity == null ? 1 : Number(entry.quantity)}`).sort().join(',')

function sameChildren(db: Database.Database, parentId: number, raw: unknown): boolean {
  if (!Array.isArray(raw)) return false
  const stored = storedChildren(db, parentId)
  if (stored.length !== raw.length) return false
  const storedKeys = stored.map((child) => ({ key: `${child.combo_slot_id}:${child.menu_item_id}`, mods: pickKey(storedModifiers(db, child.id)) }))
  const pending = [...storedKeys]
  return raw.every((entry: any) => {
    const key = `${Number(entry?.slot_id ?? entry?.slotId)}:${Number(entry?.menu_item_id ?? entry?.menuItemId)}`
    const mods = Array.isArray(entry?.modifiers) ? pickKey(entry.modifiers) : null
    const index = pending.findIndex((candidate) => candidate.key === key && (mods === null || candidate.mods === mods))
    if (index < 0) return false
    pending.splice(index, 1)
    return true
  })
}

export interface ExistingLineCatalogPlan {
  old: StoredLine
  isCombo: boolean
  /** Set when the option set changes. */
  modifiers?: PreparedModifier[]
  /** Set when the combo picks change. */
  children?: PreparedChild[]
  changed: boolean
  /** The price without an explicit override: the old price, or old base + the new extras. */
  computedUnit: number
}

/** Validation only (no writes): what an edit of `modifiers` / `children` does to an existing line. */
export function planExistingLineCatalogEdit(
  db: Database.Database,
  old: StoredLine,
  line: { modifiers?: unknown; children?: unknown },
  ctx: CatalogContext
): ExistingLineCatalogPlan {
  const isCombo = old.line_kind === 'combo'
  const menu = () => db.prepare('SELECT * FROM menu_items WHERE id = ?').get(old.menu_item_id) as any
  let modifiers: PreparedModifier[] | undefined
  let children: PreparedChild[] | undefined
  if (line.modifiers !== undefined && line.modifiers !== null &&
      !(Array.isArray(line.modifiers) && pickKey(line.modifiers) === pickKey(storedModifiers(db, old.id)))) {
    modifiers = prepareModifiers(db, menu(), line.modifiers, ctx)
  }
  if (line.children !== undefined && line.children !== null) {
    if (!isCombo) {
      if (!Array.isArray(line.children) || line.children.length > 0) {
        throw ctx.fail('invalid_input', catalogMessage('combo_not_a_combo', ctx.lang, { item: menu()?.name ?? '' }))
      }
    } else if (!sameChildren(db, old.id, line.children)) {
      children = prepareChildren(db, menu(), line.children, ctx)
    }
  }
  const changed = modifiers !== undefined || children !== undefined
  let computedUnit = old.unit_price
  if (changed) {
    const oldChildren = isCombo ? storedChildren(db, old.id) : []
    const oldChildExtras = oldChildren.reduce((sum, child) => sum + child.combo_upcharge + modifierExtras(storedModifiers(db, child.id)), 0)
    const before = modifierExtras(storedModifiers(db, old.id)) + oldChildExtras
    const after = (modifiers ? modifierExtras(modifiers) : modifierExtras(storedModifiers(db, old.id))) +
      (children ? childrenExtras(children) : oldChildExtras)
    computedUnit = Math.max(0, roundCents(old.unit_price - before + after))
  }
  return { old, isCombo, modifiers, children, changed, computedUnit }
}

/**
 * Applies a plan AFTER order-service has scaled this line's own deductions to `quantity` and
 * updated the row. Combo children follow the parent quantity; allocation follows its total.
 */
export function applyExistingLineCatalogEdit(
  db: Database.Database,
  w: CatalogWriteContext,
  plan: ExistingLineCatalogPlan,
  line: { quantity: number; lineTotal: number }
): void {
  const { old } = plan
  if (plan.modifiers) {
    const rows = db.prepare(
      'SELECT id, stock_item_id, quantity_deducted FROM order_item_deductions WHERE order_item_id = ? AND order_item_modifier_id IS NOT NULL'
    ).all(old.id) as { id: number; stock_item_id: number; quantity_deducted: number }[]
    restoreRows(db, rows, `${w.reason}: options changed`)
    db.prepare('DELETE FROM order_item_modifiers WHERE order_item_id = ?').run(old.id)
    insertModifiers(db, w, old.id, line.quantity, plan.modifiers)
  }
  if (!plan.isCombo) return
  if (plan.children) {
    // Keep the children that did not change (same slot, item and options): their kitchen
    // stations are not told anything; only removed/added picks are.
    const pending = storedChildren(db, old.id).map((child) => ({
      ...child, key: `${child.combo_slot_id}:${child.menu_item_id}:${pickKey(storedModifiers(db, child.id))}`
    }))
    const kept = plan.children.map((child) => {
      const index = pending.findIndex((stored) => stored.key === `${child.slot_id}:${child.menu.id}:${pickKey(child.modifiers)}`)
      return index >= 0 ? pending.splice(index, 1)[0] : null
    })
    for (const gone of pending) removeChild(db, gone.id, `${w.reason}: combo choice changed`)
    const childIds = plan.children.map((child, index) => {
      const same = kept[index]
      if (!same) return insertChildren(db, w, old.id, line.quantity, [child])[0]
      scaleChild(db, same, line.quantity, `${w.reason}: quantity delta`)
      db.prepare('UPDATE order_items SET combo_upcharge = ? WHERE id = ?').run(child.upcharge, same.id)
      return same.id
    })
    storeAllocation(db, childIds, allocateComboRevenue(line.lineTotal, plan.children.map((child) => ({
      weight: Number(child.menu.price) || 0,
      own: (child.upcharge + modifierExtras(child.modifiers)) * line.quantity
    }))))
    return
  }
  for (const child of storedChildren(db, old.id)) scaleChild(db, child, line.quantity, `${w.reason}: quantity delta`)
  const current = (db.prepare('SELECT id, allocated_revenue FROM order_items WHERE parent_order_item_id = ? ORDER BY id')
    .all(old.id) as { id: number; allocated_revenue: number | null }[])
  const sum = current.reduce((total, row) => total + (row.allocated_revenue ?? 0), 0)
  const raw = current.map((row) => (sum > 0 ? ((row.allocated_revenue ?? 0) * line.lineTotal) / sum : line.lineTotal / current.length))
  storeAllocation(db, current.map((row) => row.id), fixRounding(line.lineTotal, raw))
}

/** A child follows its combo's quantity; its deductions scale like order-service's quantity edit. */
function scaleChild(db: Database.Database, child: { id: number; quantity: number }, quantity: number, reason: string): void {
  if (child.quantity === quantity || child.quantity <= 0) return
  const rows = db.prepare('SELECT id, stock_item_id, quantity_deducted FROM order_item_deductions WHERE order_item_id = ?')
    .all(child.id) as { id: number; stock_item_id: number; quantity_deducted: number }[]
  for (const row of rows) {
    const next = (row.quantity_deducted / child.quantity) * quantity
    adjust(db, row.stock_item_id, row.quantity_deducted - next, reason)
    db.prepare('UPDATE order_item_deductions SET quantity_deducted = ? WHERE id = ?').run(next, row.id)
  }
  db.prepare('UPDATE order_items SET quantity = ? WHERE id = ?').run(quantity, child.id)
}

function removeChild(db: Database.Database, childId: number, reason: string): void {
  const rows = db.prepare('SELECT id, stock_item_id, quantity_deducted FROM order_item_deductions WHERE order_item_id = ?')
    .all(childId) as { id: number; stock_item_id: number; quantity_deducted: number }[]
  restoreRows(db, rows, reason)
  db.prepare('DELETE FROM order_items WHERE id = ?').run(childId)
}

// ─── Kitchen helpers ──────────────────────────────────────────────────────────────────────────

/** order_item_id → a stable signature of its options, to detect option changes on UPDATED tickets. */
export function kitchenModifierKeys(db: Database.Database, orderId: number): Map<number, string> {
  const rows = db.prepare(
    `SELECT m.order_item_id, m.option_id, m.name, m.kind, m.quantity FROM order_item_modifiers m
     JOIN order_items oi ON oi.id = m.order_item_id WHERE oi.order_id = ?`
  ).all(orderId) as { order_item_id: number; option_id: number | null; name: string; kind: string; quantity: number }[]
  const keys = new Map<number, string[]>()
  for (const row of rows) {
    if (!keys.has(row.order_item_id)) keys.set(row.order_item_id, [])
    keys.get(row.order_item_id)!.push(`${row.option_id ?? row.name}:${row.kind}:${row.quantity}`)
  }
  return new Map([...keys].map(([id, list]) => [id, list.sort().join(',')]))
}

/** Cookable lines only (a combo parent is a container) with their option signature. */
export function kitchenSnapshots(
  items: { id: number; menu_item_id: number; quantity: number; notes: string | null; worker_id: number | null; line_kind?: string | null }[],
  keys: Map<number, string>
): KitchenLineSnapshot[] {
  return items
    .filter((item) => item.line_kind !== 'combo')
    .map((item) => ({
      id: item.id,
      menu_item_id: item.menu_item_id,
      quantity: item.quantity,
      notes: item.notes,
      worker_id: item.worker_id,
      modifier_key: keys.get(item.id) ?? ''
    }))
}

/** Stations that must print for an order (combo parents never do; their children do). */
export function kitchenStations(db: Database.Database, orderId: number): { worker_id: number | null }[] {
  return db.prepare("SELECT worker_id FROM order_items WHERE order_id = ? AND line_kind <> 'combo'").all(orderId) as
    { worker_id: number | null }[]
}

/** Read side: every line gets `modifiers`; combo children get `combo_name` (parent's display name). */
export function attachCatalogDetails<T extends { id: number; parent_order_item_id?: number | null; menu_item_name?: string }>(
  db: Database.Database,
  items: T[]
): (T & { modifiers: any[]; combo_name?: string | null })[] {
  if (items.length === 0) return []
  const ids = items.map((item) => item.id)
  const rows = db.prepare(
    `SELECT id, order_item_id, option_id, group_id, group_name, name, name_ar, name_fr, kind, price_delta, quantity, sort_order
     FROM order_item_modifiers WHERE order_item_id IN (${ids.map(() => '?').join(',')}) ORDER BY sort_order, id`
  ).all(...ids) as { order_item_id: number }[]
  const names = new Map(items.map((item) => [item.id, item.menu_item_name ?? null]))
  return items.map((item) => ({
    ...item,
    modifiers: rows.filter((row) => row.order_item_id === item.id),
    ...(item.parent_order_item_id != null ? { combo_name: names.get(item.parent_order_item_id) ?? null } : {})
  }))
}
