import type Database from 'better-sqlite3'
import {
  CatalogError, catalogLangOf, catalogMessage, type CatalogLang, type CatalogMessageCode
} from '../../shared/catalog-messages'
import type { IngredientInput } from '../../shared/catalog-types'
import { canonicalUnit, recipeUnitCompatibleWithStock } from './stock-units'

export type { IngredientInput }

/** Shared validation helpers for the modifier / combo / sold-out services. */

export const MAX_MONEY = 1_000_000_000
const NAME_MAX = 200
const RECIPE_UNITS = new Set(['g', 'kg', 'ml', 'liter', 'unit'])

export function catalogLang(db: Database.Database): CatalogLang {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'language'").get() as { value: string } | undefined
  return catalogLangOf(row?.value)
}

export function catalogError(
  lang: CatalogLang,
  code: CatalogMessageCode,
  params: Record<string, string | number> = {}
): CatalogError {
  return new CatalogError(code, catalogMessage(code, lang, params))
}

export function requiredName(value: unknown, lang: CatalogLang): string {
  if (typeof value !== 'string' || !value.trim()) throw catalogError(lang, 'name_required')
  const trimmed = value.trim()
  if (trimmed.length > NAME_MAX) throw catalogError(lang, 'text_too_long', { field: trimmed.slice(0, 20), max: NAME_MAX })
  return trimmed
}

/** undefined = keep (update), null / '' = clear. */
export function optionalName(value: unknown, field: string, lang: CatalogLang): string | null | undefined {
  if (value === undefined) return undefined
  if (value === null) return null
  if (typeof value !== 'string') throw catalogError(lang, 'text_too_long', { field, max: NAME_MAX })
  const trimmed = value.trim()
  if (trimmed.length > NAME_MAX) throw catalogError(lang, 'text_too_long', { field, max: NAME_MAX })
  return trimmed || null
}

export function flag(value: unknown, fallback: number): number {
  if (value === undefined || value === null) return fallback
  return value === true || value === 1 || value === '1' || value === 'true' ? 1 : 0
}

export function sortValue(value: unknown, fallback: number): number {
  if (value === undefined || value === null) return fallback
  const n = Number(value)
  return Number.isInteger(n) && Math.abs(n) <= 1_000_000 ? n : fallback
}

/** Same rules as menu recipes: active stock item, quantity > 0, unit in the stock unit's family. */
export function validateIngredients(db: Database.Database, raw: unknown, lang: CatalogLang): IngredientInput[] {
  if (raw === undefined || raw === null) return []
  if (!Array.isArray(raw) || raw.length > 50) throw catalogError(lang, 'invalid_ingredient')
  const seen = new Set<number>()
  return raw.map((entry) => {
    const stockId = Number(entry?.stock_item_id)
    const quantity = Number(entry?.quantity)
    const unit = canonicalUnit(entry?.unit)
    if (!Number.isInteger(stockId) || stockId <= 0 || !Number.isFinite(quantity) || quantity <= 0 || !RECIPE_UNITS.has(unit)) {
      throw catalogError(lang, 'invalid_ingredient')
    }
    if (seen.has(stockId)) throw catalogError(lang, 'ingredient_repeated')
    seen.add(stockId)
    const stock = db.prepare('SELECT name, unit_type, is_active FROM stock_items WHERE id = ?').get(stockId) as
      | { name: string; unit_type: string; is_active: number }
      | undefined
    if (!stock || stock.is_active !== 1) throw catalogError(lang, 'invalid_ingredient')
    if (!recipeUnitCompatibleWithStock(unit, stock.unit_type)) {
      throw catalogError(lang, 'incompatible_unit', { unit, stock: stock.name, stockUnit: stock.unit_type })
    }
    return { stock_item_id: stockId, quantity, unit }
  })
}

/**
 * SQL expression (1/0): the item is 86'd by hand, or — when setting auto_sold_out = 'true' —
 * one of its recipe ingredients has no stock left. Restocking clears the automatic case.
 */
export function soldOutSql(alias: string): string {
  return `(CASE WHEN ${alias}.is_sold_out = 1 OR (
      COALESCE((SELECT value FROM settings WHERE key = 'auto_sold_out'), 'false') = 'true'
      AND EXISTS (SELECT 1 FROM menu_item_ingredients soi JOIN stock_items sos ON sos.id = soi.stock_item_id
                  WHERE soi.menu_item_id = ${alias}.id AND sos.quantity <= 0)
    ) THEN 1 ELSE 0 END)`
}

export function isSoldOut(db: Database.Database, menuItemId: number): boolean {
  const row = db.prepare(`SELECT ${soldOutSql('mi')} AS sold_out FROM menu_items mi WHERE mi.id = ?`).get(menuItemId) as
    | { sold_out: number }
    | undefined
  return row?.sold_out === 1
}
