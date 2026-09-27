import { esc } from './print-format'

/**
 * Printed form of v4 catalog data: options under their line ("✕ NO ONIONS", "EXTRA CHEESE x2")
 * and combo children under their combo. Shared by the default receipt, the Receipt Editor
 * template and the kitchen ticket. Works on ordersRepo.getOrderItems() rows (items carry
 * `modifiers`; children carry `parent_order_item_id` and `combo_name`).
 */

type Lang = 'en' | 'fr' | 'ar'
type Prefixed = 'no' | 'extra' | 'light'

export interface PrintModifier {
  name: string
  kind?: string | null
  price_delta?: number | null
  quantity?: number | null
}

const PREFIX: Record<Lang, Record<Prefixed, string>> = {
  en: { no: 'NO', extra: 'EXTRA', light: 'LIGHT' },
  fr: { no: 'SANS', extra: 'EXTRA', light: 'LÉGER' },
  ar: { no: 'بدون', extra: 'إضافي', light: 'خفيف' }
}

const langOf = (value: unknown): Lang => (value === 'fr' || value === 'ar' ? value : 'en')

/** Prefix by kind in `lang`, never doubled when the option name already starts with one. */
export function modifierLabel(modifier: PrintModifier, lang: unknown, upper = false): string {
  const name = String(modifier.name ?? '').trim()
  const kind = modifier.kind as Prefixed
  let text = name
  if (kind === 'no' || kind === 'extra' || kind === 'light') {
    const lower = name.toLocaleLowerCase()
    const already = Object.values(PREFIX).some((words) => {
      const word = words[kind].toLocaleLowerCase()
      return lower === word || lower.startsWith(`${word} `)
    })
    text = already ? name : `${PREFIX[langOf(lang)][kind]} ${name}`
  }
  if (upper) text = text.toLocaleUpperCase()
  const quantity = Number(modifier.quantity) || 1
  return quantity > 1 ? `${text} x${quantity}` : text
}

export const isComboChild = (item: any): boolean => item?.parent_order_item_id != null

/** Lines printed as rows on a receipt: everything except combo children (shown under the combo). */
export function receiptRows<T>(items: T[]): T[] {
  return items.filter((item) => !isComboChild(item))
}

export interface ReceiptSubLine {
  text: string
  /** Line-total effect (option delta × units × line qty, or the child's upcharge); null = no price. */
  amount: number | null
  level: 1 | 2
}

function optionLines(modifiers: PrintModifier[] | undefined, lineQuantity: number, lang: unknown, level: 1 | 2): ReceiptSubLine[] {
  return (modifiers || []).map((modifier) => {
    const amount = (Number(modifier.price_delta) || 0) * (Number(modifier.quantity) || 1) * lineQuantity
    return { text: modifierLabel(modifier, lang), amount: amount === 0 ? null : amount, level }
  })
}

/** The options of `item` and, for a combo, each chosen item (with its upcharge and options). */
export function receiptSubLines(item: any, items: any[], lang: unknown): ReceiptSubLine[] {
  const quantity = Number(item.quantity) || 1
  const lines = optionLines(item.modifiers, quantity, lang, 1)
  for (const child of items.filter((candidate) => candidate.parent_order_item_id === item.id)) {
    const childQuantity = Number(child.quantity) || quantity
    const upcharge = (Number(child.combo_upcharge) || 0) * childQuantity
    lines.push({ text: String(child.menu_item_name || 'Item'), amount: upcharge > 0 ? upcharge : null, level: 1 })
    lines.push(...optionLines(child.modifiers, childQuantity, lang, 2))
  }
  return lines
}

/** Sub-lines as indented flex rows; `money` formats an absolute amount. */
export function receiptSubLinesHTML(
  item: any,
  items: any[],
  lang: unknown,
  style: { fontSize: number; money: (value: number) => string; color?: string }
): string {
  return receiptSubLines(item, items, lang).map((line) => {
    const sign = line.amount == null ? '' : line.amount < 0 ? '-' : '+'
    const price = line.amount == null ? '' : `${sign}${style.money(Math.abs(line.amount))}`
    const bullet = line.level === 1 && !line.text.startsWith('✕') ? '· ' : '- '
    return `<div style="display:flex;justify-content:space-between;gap:6px;font-size:${style.fontSize}px;` +
      `padding-inline-start:${line.level * 10}px;${style.color ? `color:${style.color};` : ''}">` +
      `<span>${esc(bullet + line.text)}</span><span>${esc(price)}</span></div>`
  }).join('')
}

/** Extra CSS for the kitchen ticket. */
export function kitchenCatalogCSS(sizes: { itemName: number; itemNotes: number }): string {
  return `.mod { font-size: ${sizes.itemNotes + 2}px; padding-inline-start: 14px; }
  .mod-no { font-weight: bold; font-size: ${sizes.itemName}px; }
  .combo-ctx { font-weight: bold; font-size: ${sizes.itemNotes}px; border-bottom: 1px solid #000; margin-top: 6px; }
  .combo-child { padding-inline-start: 8px; }`
}

/** Option lines under a kitchen line: "✕ NO ONIONS" (bold), "EXTRA CHEESE x2", "+ Ketchup". */
export function kitchenModifiersHTML(modifiers: PrintModifier[] | undefined, lang: unknown): string {
  return (modifiers || []).map((modifier) => {
    if (modifier.kind === 'no') return `<div class="mod mod-no">✕ ${esc(modifierLabel(modifier, lang, true))}</div>`
    const prefixed = modifier.kind === 'extra' || modifier.kind === 'light'
    return `<div class="mod">${prefixed ? '' : '+ '}${esc(modifierLabel(modifier, lang, prefixed))}</div>`
  }).join('')
}

/** "COMBO: <name>" once above each run of children of the same combo on a kitchen ticket. */
export function kitchenComboHeaderHTML(item: any, previous: any): string {
  if (!isComboChild(item)) return ''
  if (previous && previous.parent_order_item_id === item.parent_order_item_id) return ''
  return `<div class="combo-ctx">COMBO: ${esc(String(item.combo_name || '').toLocaleUpperCase())}</div>`
}
