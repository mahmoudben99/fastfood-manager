/**
 * Human-readable order lines for the owner (cloud dashboard `owner_orders.items_summary` and the
 * Telegram notification), built from ordersRepo.getById() rows: option snapshots
 * (order_item_modifiers) and combo children (parent_order_item_id). Pure — no electron, no DB.
 *
 * items_summary format (the owner dashboard splits it on ", " and counts `^(\d+)x\s+(.+)$` parts
 * for "popular items"), so nothing inside a line may contain ", ":
 *   "2x Burger (+Cheese x2; NO Onions), 1x Menu Maxi [Burger (NO Onions); Fries; Cola], Delivery fee 200"
 * Option / combo details use "; " and the delivery fee is a trailing part that does not start with
 * "<n>x", so it never counts as an item. (No Supabase column is needed.)
 */
export type SummaryLang = 'en' | 'fr' | 'ar'

export interface SummaryModifier {
  name?: string | null
  kind?: string | null
  quantity?: number | null
}

export interface SummaryItem {
  id?: number
  quantity: number
  menu_item_name?: string | null
  parent_order_item_id?: number | null
  modifiers?: SummaryModifier[] | null
}

export interface SummaryLine {
  quantity: number
  name: string
  options: string[]
  picks: { name: string; options: string[] }[]
}

const WORDS: Record<SummaryLang, { no: string; light: string; deliveryFee: string; item: string }> = {
  en: { no: 'NO', light: 'light', deliveryFee: 'Delivery fee', item: 'Item' },
  fr: { no: 'SANS', light: 'peu de', deliveryFee: 'Frais de livraison', item: 'Article' },
  ar: { no: 'بدون', light: 'قليل', deliveryFee: 'رسوم التوصيل', item: 'صنف' }
}

export function summaryLang(value: unknown): SummaryLang {
  return value === 'fr' || value === 'ar' ? value : 'en'
}

/** "+Cheese x2", "NO Onions", "light Mayo", "Ketchup". */
export function modifierLabel(modifier: SummaryModifier, lang: SummaryLang = 'en'): string {
  const name = String(modifier.name ?? '').replace(/, /g, ' ').trim()
  const quantity = Number(modifier.quantity) > 1 ? ` x${Number(modifier.quantity)}` : ''
  switch (modifier.kind) {
    case 'no': return `${WORDS[lang].no} ${name}`
    case 'extra': return `+${name}${quantity}`
    case 'light': return `${WORDS[lang].light} ${name}${quantity}`
    default: return `${name}${quantity}`
  }
}

function itemName(item: SummaryItem, lang: SummaryLang): string {
  return String(item.menu_item_name || WORDS[lang].item).replace(/, /g, ' ').trim()
}

/** Top-level lines with their options, and each combo line's picks (with the picks' options). */
export function summaryLines(items: SummaryItem[] | null | undefined, lang: SummaryLang = 'en'): SummaryLine[] {
  const list = Array.isArray(items) ? items : []
  const options = (item: SummaryItem): string[] =>
    (Array.isArray(item.modifiers) ? item.modifiers : []).map((modifier) => modifierLabel(modifier, lang))
  return list
    .filter((item) => item.parent_order_item_id == null)
    .map((item) => ({
      quantity: Number(item.quantity) || 0,
      name: itemName(item, lang),
      options: options(item),
      picks: list
        .filter((child) => item.id != null && child.parent_order_item_id === item.id)
        .map((child) => ({ name: itemName(child, lang), options: options(child) }))
    }))
}

function withOptions(name: string, options: string[]): string {
  return options.length ? `${name} (${options.join('; ')})` : name
}

/** One line as plain text: "2x Burger (+Cheese x2; NO Onions)" / "1x Menu Maxi [Burger (NO Onions); Fries]". */
export function lineText(line: SummaryLine): string {
  const picks = line.picks.length ? ` [${line.picks.map((pick) => withOptions(pick.name, pick.options)).join('; ')}]` : ''
  return `${line.quantity}x ${withOptions(line.name, line.options)}${picks}`
}

export function deliveryFeeLabel(lang: SummaryLang): string {
  return WORDS[lang].deliveryFee
}

/** owner_orders.items_summary (see the format note at the top of this file). */
export function formatItemsSummary(
  items: SummaryItem[] | null | undefined,
  options: { lang?: SummaryLang; deliveryFee?: number | null } = {}
): string {
  const lang = options.lang ?? 'en'
  const parts = summaryLines(items, lang).map(lineText)
  const fee = Math.round(Number(options.deliveryFee) || 0)
  if (fee > 0) parts.push(`${deliveryFeeLabel(lang)} ${fee}`)
  return parts.join(', ')
}

/** Number of sold lines (combo picks are part of their combo line, not extra items). */
export function topLevelLineCount(items: SummaryItem[] | null | undefined): number {
  return (Array.isArray(items) ? items : []).filter((item) => item.parent_order_item_id == null).length
}
