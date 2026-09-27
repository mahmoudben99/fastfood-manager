/**
 * Renders insights for people: the Telegram morning prep message, grouped alert messages
 * (Telegram HTML parse_mode) and the printable prep + shopping list for the receipt printer.
 */
import type { InsightAlert, InsightAlertKind, ShoppingList } from '../../../shared/insights'
import { esc, printableWidth } from '../print-format'
import { weekdayOf } from './dates'
import {
  escapeTelegram as h, formatMoney, formatQty, localName, qtyWithUnit, t, weekdayName, type InsightsLang
} from './messages'

export interface ReportContext {
  lang: InsightsLang
  currency: string
}

const MAX_PREP_LINES = 25
const MAX_BUY_LINES = 20
/** Telegram rejects messages over 4096 characters. */
export const TELEGRAM_MAX_CHARS = 4000

/** Cuts an over-long message at a line boundary (every line closes its own tags). */
export function clampTelegram(text: string): string {
  if (text.length <= TELEGRAM_MAX_CHARS) return text
  const cut = text.lastIndexOf('\n', TELEGRAM_MAX_CHARS - 2)
  return `${text.slice(0, cut > 0 ? cut : TELEGRAM_MAX_CHARS - 2)}\n…`
}

function shortDate(date: string): string {
  const [y, m, d] = date.split('-')
  return `${d}/${m}/${y}`
}

function basisLine(list: ShoppingList, lang: InsightsLang): string {
  const f = list.forecast
  if (f.method === 'weekday') return t(lang, 'basisWeekday', { n: f.sampleDays.length, weekday: weekdayName(lang, f.weekday) })
  if (f.method === 'daily_average') return t(lang, 'basisDaily', { n: f.sampleDays.length })
  return t(lang, 'basisNone')
}

/** Telegram (HTML) morning message: expected volume, prep quantities, shopping list. */
export function composeMorningPrepMessage(list: ShoppingList, ctx: ReportContext): string {
  const { lang, currency: cur } = ctx
  const f = list.forecast
  const lines: string[] = [
    `🌅 <b>${h(t(lang, 'prepTitle', { day: weekdayName(lang, weekdayOf(list.date)), date: shortDate(list.date) }))}</b>`
  ]
  if (f.method === 'none') {
    lines.push('', h(t(lang, 'basisNone')))
  } else {
    lines.push(h(t(lang, 'expected', { orders: f.expectedOrders, revenue: formatMoney(f.expectedRevenue), cur })))
    lines.push(`<i>${h(basisLine(list, lang))}</i>`)
    if (f.trendFactor !== 1) lines.push(`<i>${h(t(lang, 'trend', { factor: f.trendFactor }))}</i>`)
    const prep = f.items.filter((item) => item.rounded > 0)
    if (prep.length > 0) {
      lines.push('', `🍔 <b>${h(t(lang, 'prepHeader'))}</b>`)
      for (const item of prep.slice(0, MAX_PREP_LINES)) lines.push(`• ${h(localName(item, lang))} × ${item.rounded}`)
      if (prep.length > MAX_PREP_LINES) lines.push(h(t(lang, 'more', { n: prep.length - MAX_PREP_LINES })))
    }
  }

  const buy = list.items.filter((item) => item.toBuy > 0)
  lines.push('')
  if (buy.length === 0) {
    lines.push(`✅ ${h(t(lang, 'nothingToBuy'))}`)
  } else {
    lines.push(`🛒 <b>${h(t(lang, 'buyHeader', { total: formatMoney(list.totalEstCost), cur }))}</b>`)
    for (const item of buy.slice(0, MAX_BUY_LINES)) {
      const text = t(lang, 'buyLine', {
        name: localName(item, lang),
        qty: qtyWithUnit(lang, item.toBuy, item.unit),
        have: qtyWithUnit(lang, item.have, item.unit),
        need: qtyWithUnit(lang, item.need, item.unit),
        cost: formatMoney(item.estCost),
        cur
      })
      lines.push(`${item.critical ? '🔴' : '•'} ${h(text)}`)
    }
    if (buy.length > MAX_BUY_LINES) lines.push(h(t(lang, 'more', { n: buy.length - MAX_BUY_LINES })))
  }
  const critical = list.items.filter((item) => item.critical)
  if (critical.length > 0) {
    lines.push('', `⚠️ <b>${h(t(lang, 'notEnough', { items: critical.map((item) => localName(item, lang)).join(', ') }))}</b>`)
  }
  return clampTelegram(lines.join('\n'))
}

const ALERT_ICON: Record<InsightAlertKind, string> = {
  cancellations: '🚫',
  discounts: '💸',
  slow_day: '🐢',
  low_stock: '📦',
  margin: '📉'
}

/** One Telegram message per alert kind: title once, then each alert's message. */
export function composeAlertMessages(alerts: InsightAlert[]): { kind: InsightAlertKind; keys: string[]; text: string }[] {
  const byKind = new Map<InsightAlertKind, InsightAlert[]>()
  for (const alert of alerts) byKind.set(alert.kind, [...(byKind.get(alert.kind) ?? []), alert])
  return [...byKind.entries()].map(([kind, group]) => ({
    kind,
    keys: group.map((alert) => alert.key),
    text: clampTelegram([`${ALERT_ICON[kind]} <b>${h(group[0].title)}</b>`, ...group.map((alert) => h(alert.message))].join('\n'))
  }))
}

/**
 * Printable prep + shopping list sized for the receipt printer (58/80 mm), RTL in Arabic.
 * Styled like the built-in receipt (monospace, dashed separators).
 */
export function buildPrepListHtml(
  list: ShoppingList,
  ctx: ReportContext & { paperWidth?: string | null; restaurantName?: string; printedAt?: Date }
): string {
  const { lang, currency } = ctx
  const width = printableWidth(ctx.paperWidth)
  const f = list.forecast
  const prep = f.items.filter((item) => item.rounded > 0)
  const buy = list.items.filter((item) => item.toBuy > 0)
  const cur = esc(currency)
  const title = t(lang, 'prepTitle', { day: weekdayName(lang, weekdayOf(list.date)), date: shortDate(list.date) })

  const prepRows = prep.map((item) =>
    `<div class="row"><span>${esc(localName(item, lang))}</span><span class="bold">${item.rounded}</span></div>`
  ).join('')
  const buyRows = buy.map((item) => `
    <div class="item">
      <div class="row"><span class="bold">${item.critical ? '! ' : ''}${esc(localName(item, lang))}</span><span class="bold">${esc(qtyWithUnit(lang, item.toBuy, item.unit))}</span></div>
      <div class="row small"><span>${esc(t(lang, 'printHave'))} ${esc(formatQty(item.have))} · ${esc(t(lang, 'printNeed'))} ${esc(formatQty(item.need))}</span><span>${esc(formatMoney(item.estCost))} ${cur}</span></div>
    </div>`).join('')

  return `<!DOCTYPE html><html dir="${lang === 'ar' ? 'rtl' : 'ltr'}" lang="${lang}">
<head><meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Courier New', monospace; font-size: 12px; width: ${width.css}; padding: 4mm 2mm; }
  .center { text-align: center; }
  .bold { font-weight: bold; }
  .big { font-size: 16px; }
  .small { font-size: 10px; }
  .line { border-top: 1px dashed #000; margin: 5px 0; }
  .row { display: flex; justify-content: space-between; gap: 6px; }
  .item { margin: 3px 0; }
</style></head>
<body>
  ${ctx.restaurantName ? `<div class="center bold">${esc(ctx.restaurantName)}</div>` : ''}
  <div class="center bold big">${esc(t(lang, 'printPrep'))}</div>
  <div class="center">${esc(title)}</div>
  ${f.method === 'none' ? '' : `<div class="center small">${esc(t(lang, 'expected', { orders: f.expectedOrders, revenue: formatMoney(f.expectedRevenue), cur: currency }))}</div>`}
  <div class="center small">${esc(basisLine(list, lang))}</div>
  <div class="line"></div>
  <div class="row bold"><span>${esc(t(lang, 'printItem'))}</span><span>${esc(t(lang, 'printQty'))}</span></div>
  ${prepRows || `<div class="small">${esc(t(lang, 'basisNone'))}</div>`}
  <div class="line"></div>
  <div class="center bold big">${esc(t(lang, 'printShopping'))}</div>
  <div class="line"></div>
  ${buyRows || `<div>${esc(t(lang, 'nothingToBuy'))}</div>`}
  ${buy.length > 0 ? `<div class="line"></div>
  <div class="row bold"><span>${esc(t(lang, 'printTotal'))}</span><span>${esc(formatMoney(list.totalEstCost))} ${cur}</span></div>` : ''}
  ${list.criticalCount > 0 ? `<div class="small">${esc(t(lang, 'printCritical'))}</div>` : ''}
  <div class="line"></div>
  <div class="center small">${esc(t(lang, 'printPrinted'))}: ${esc((ctx.printedAt ?? new Date()).toLocaleString())}</div>
  <br><br>
</body></html>`
}
