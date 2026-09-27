import type Database from 'better-sqlite3'
import { normalizeAlgerianPhone } from '../domain/customer-phone'
import {
  CUSTOMER_CONSENT_VERSION, type ConsentInput, type CustomerRecord, type LastOrderResult, type RepeatChild,
  type RepeatModifier, type RepeatOrderLine, type RepeatSkipReason
} from '../../shared/customer-lookup'
import { isSoldOut } from './catalog-common'
import { resolveModifierGroups } from './modifiers'
import { prepareCatalogLine, type CatalogContext } from './order-catalog'

/**
 * v4 checkout: a customer's last order as lines that can be re-added to the cart right now
 * ("Repeat last order"), and the personal-data consent (law 18-07) that allows keeping a phone +
 * delivery addresses. Explicit-db functions (testable without Electron); customers.repo delegates.
 */

interface LineRow {
  id: number
  menu_item_id: number
  quantity: number
  notes: string | null
  line_kind: string | null
  combo_slot_id: number | null
  parent_order_item_id: number | null
  item_name: string | null
  item_name_ar: string | null
  item_name_fr: string | null
  menu_name: string | null
  menu_name_ar: string | null
  menu_name_fr: string | null
}

interface ModifierRow {
  order_item_id: number
  option_id: number | null
  name: string
  quantity: number
}

class RepeatCheckError extends Error {
  constructor(public code: string, message: string) {
    super(message)
  }
}

const dryRun: CatalogContext = {
  lang: 'en',
  fail: (code, message) => new RepeatCheckError(code, message)
}

function customerRow(db: Database.Database, id: number): CustomerRecord | null {
  return (db.prepare('SELECT * FROM customers WHERE id = ?').get(id) as CustomerRecord | undefined) ?? null
}

/** Keeps the options that still exist on the item; reports whether any was dropped. */
function liveModifiers(db: Database.Database, menuItemId: number, rows: ModifierRow[]): { kept: RepeatModifier[]; dropped: boolean } {
  const live = new Set(resolveModifierGroups(db, menuItemId).flatMap((group) => group.options.map((option) => option.id)))
  const kept: RepeatModifier[] = []
  let dropped = false
  for (const row of rows) {
    if (row.option_id !== null && live.has(row.option_id)) {
      kept.push({ option_id: row.option_id, quantity: Math.max(1, row.quantity), name: row.name })
    } else {
      dropped = true
    }
  }
  return { kept, dropped }
}

/**
 * The customer's most recent non-cancelled order, split into lines that can be ordered again
 * now (validated exactly like a new order line: item active, not sold out, options and combo picks
 * still allowed) and lines that are skipped with a reason.
 */
export function getLastOrder(db: Database.Database, customerId: number): LastOrderResult {
  const empty: LastOrderResult = { order: null, lines: [], skipped: [], trimmed: [] }
  if (!Number.isInteger(customerId) || customerId <= 0) return empty
  const order = db.prepare(
    `SELECT id, daily_number, order_date, created_at, order_type, total FROM orders
     WHERE customer_id = ? AND status != 'cancelled' ORDER BY created_at DESC, id DESC LIMIT 1`
  ).get(customerId) as Omit<NonNullable<LastOrderResult['order']>, 'item_count'> | undefined
  if (!order) return empty

  const rows = db.prepare(
    `SELECT oi.id, oi.menu_item_id, oi.quantity, oi.notes, oi.line_kind, oi.combo_slot_id, oi.parent_order_item_id,
            oi.item_name, oi.item_name_ar, oi.item_name_fr,
            mi.name AS menu_name, mi.name_ar AS menu_name_ar, mi.name_fr AS menu_name_fr
     FROM order_items oi LEFT JOIN menu_items mi ON mi.id = oi.menu_item_id
     WHERE oi.order_id = ? AND oi.quantity > 0 ORDER BY oi.id`
  ).all(order.id) as LineRow[]
  const modifiers = db.prepare(
    `SELECT m.order_item_id, m.option_id, m.name, m.quantity FROM order_item_modifiers m
     JOIN order_items oi ON oi.id = m.order_item_id WHERE oi.order_id = ? ORDER BY m.order_item_id, m.sort_order, m.id`
  ).all(order.id) as ModifierRow[]
  const modsOf = (lineId: number): ModifierRow[] => modifiers.filter((row) => row.order_item_id === lineId)

  const result: LastOrderResult = {
    order: { ...order, item_count: 0 },
    lines: [],
    skipped: [],
    trimmed: []
  }
  const topLevel = rows.filter((row) => row.parent_order_item_id === null && row.line_kind !== 'combo_child')
  for (const row of topLevel) {
    const name = row.item_name || row.menu_name || `#${row.menu_item_id}`
    result.order!.item_count += row.quantity
    const skip = (reason: RepeatSkipReason): void => {
      result.skipped.push({ name, quantity: row.quantity, reason })
    }
    const menu = db.prepare(
      `SELECT mi.* FROM menu_items mi JOIN categories c ON c.id = mi.category_id
       WHERE mi.id = ? AND mi.is_active = 1 AND COALESCE(c.is_active, 1) = 1`
    ).get(row.menu_item_id) as any
    if (!menu) { skip('unavailable'); continue }
    if (isSoldOut(db, menu.id)) { skip('sold_out'); continue }

    const own = liveModifiers(db, menu.id, modsOf(row.id))
    let dropped = own.dropped
    const children: RepeatChild[] = []
    if (menu.is_combo === 1) {
      for (const child of rows.filter((candidate) => candidate.parent_order_item_id === row.id)) {
        const childMods = liveModifiers(db, child.menu_item_id, modsOf(child.id))
        dropped ||= childMods.dropped
        children.push({
          slot_id: Number(child.combo_slot_id),
          menu_item_id: child.menu_item_id,
          name: child.item_name || child.menu_name || `#${child.menu_item_id}`,
          note: child.notes,
          modifiers: childMods.kept
        })
      }
    }

    const comboPicks = menu.is_combo === 1
      ? children.map((child) => ({
          slot_id: child.slot_id,
          menu_item_id: child.menu_item_id,
          modifiers: child.modifiers.map(({ option_id, quantity }) => ({ option_id, quantity }))
        }))
      : undefined
    const check = (mods: { option_id: number; quantity: number }[] | undefined): string | null => {
      try {
        prepareCatalogLine(db, menu, { modifiers: mods, children: comboPicks }, dryRun)
        return null
      } catch (error) {
        return error instanceof RepeatCheckError ? error.code : 'invalid_input'
      }
    }
    let lineModifiers: RepeatModifier[] | null = own.kept
    let failure = check(own.kept.map(({ option_id, quantity }) => ({ option_id, quantity })))
    // A line saved without any option (e.g. before v4 options existed) falls back to the item's
    // current default options when "no options" is no longer a valid choice.
    if (failure && modsOf(row.id).length === 0 && check(undefined) === null) {
      failure = null
      lineModifiers = null
    }
    if (failure) {
      skip(failure === 'inactive_item' ? 'sold_out' : 'changed')
      continue
    }

    if (dropped) result.trimmed.push(name)
    result.lines.push({
      menu_item_id: menu.id,
      name,
      name_ar: row.item_name_ar ?? row.menu_name_ar ?? null,
      name_fr: row.item_name_fr ?? row.menu_name_fr ?? null,
      quantity: row.quantity,
      notes: row.notes,
      modifiers: lineModifiers,
      children
    })
  }
  return result
}

function customerIdForConsent(db: Database.Database, input: ConsentInput): number {
  if (input.customer_id !== undefined && input.customer_id !== null) {
    const id = Number(input.customer_id)
    if (!Number.isInteger(id) || !customerRow(db, id)) throw new Error('Customer not found')
    return id
  }
  const phone = String(input.phone ?? '')
  const normalized = normalizeAlgerianPhone(phone)
  if (!normalized) throw new Error('A valid customer phone is required')
  const display = phone.normalize('NFKC').replace(/[\u0000-\u001f\u007f‎‏‪-‮⁦-⁩]/g, '')
    .replace(/\s+/g, ' ').trim().slice(0, 50) || normalized
  return (db.prepare(
    `INSERT INTO customers (phone, phone_normalized, total_spent, order_count) VALUES (?, ?, 0, 0)
     ON CONFLICT(phone_normalized) DO UPDATE SET updated_at = customers.updated_at RETURNING id`
  ).get(display, normalized) as { id: number }).id
}

/** Records that the customer agreed (at the till) to keep their phone + delivery addresses. */
export function recordConsent(db: Database.Database, input: ConsentInput, now: Date = new Date()): CustomerRecord {
  const version = String(input?.version ?? CUSTOMER_CONSENT_VERSION).trim().slice(0, 40) || CUSTOMER_CONSENT_VERSION
  const name = typeof input?.name === 'string' ? input.name.replace(/\s+/g, ' ').trim().slice(0, 80) : ''
  return db.transaction(() => {
    const id = customerIdForConsent(db, input ?? {})
    db.prepare(
      `UPDATE customers SET consent_at = ?, consent_version = ?, name = COALESCE(NULLIF(?, ''), name),
       updated_at = datetime('now') WHERE id = ?`
    ).run(now.toISOString(), version, name, id)
    return customerRow(db, id)!
  })()
}

/** Consent withdrawn: forget the saved delivery addresses and clear the consent stamp. */
export function withdrawConsent(db: Database.Database, customerId: number): CustomerRecord {
  return db.transaction(() => {
    if (!customerRow(db, customerId)) throw new Error('Customer not found')
    db.prepare('DELETE FROM customer_addresses WHERE customer_id = ?').run(customerId)
    db.prepare(
      `UPDATE customers SET consent_at = NULL, consent_version = NULL, updated_at = datetime('now') WHERE id = ?`
    ).run(customerId)
    return customerRow(db, customerId)!
  })()
}
