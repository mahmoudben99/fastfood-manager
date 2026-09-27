/**
 * X / Z report rendering: printable receipt-width HTML (app language, RTL for Arabic) and the
 * compact Telegram summary for the owner. Pure — no Electron, no DB.
 */
import { DZD_DENOMINATIONS, type CashLang } from '../../shared/cash'
import type { ShiftReport } from '../../shared/shift-report'
import { currencySymbol, esc, fontSizes, printableWidth, receiptLang } from './print-format'

interface ReportLabels {
  x: string; z: string; shift: string; register: string; cashier: string; opened: string; closed: string
  closedBy: string; orders: string; gross: string; discounts: string; deliveryFees: string; net: string
  average: string; local: string; takeout: string; delivery: string; payments: string; refunds: string
  drawer: string; float: string; cashSales: string; cashRefunds: string; rounding: string; payIns: string
  payOuts: string; drivers: string; expected: string; counted: string; overShort: string; hidden: string
  unpaid: string; categories: string; topItems: string; cancellations: string; voids: string
  movements: string; byCashier: string; denominations: string; printed: string; note: string; coin: string
}

const LABELS: Record<CashLang, ReportLabels> = {
  en: {
    x: 'X REPORT', z: 'Z REPORT', shift: 'Shift', register: 'Register', cashier: 'Cashier', opened: 'Opened',
    closed: 'Closed', closedBy: 'Closed by', orders: 'Orders', gross: 'Gross sales', discounts: 'Discounts',
    deliveryFees: 'Delivery fees', net: 'Net sales', average: 'Average ticket', local: 'Dine in', takeout: 'Takeaway',
    delivery: 'Delivery', payments: 'Payments by method', refunds: 'refunds', drawer: 'Cash drawer',
    float: 'Opening float', cashSales: 'Cash sales', cashRefunds: 'Cash refunds', rounding: 'Rounding',
    payIns: 'Pay-ins', payOuts: 'Pay-outs', drivers: 'Driver settlements', expected: 'Expected cash',
    counted: 'Counted cash', overShort: 'Over / short', hidden: 'hidden (blind count)', unpaid: 'Unpaid orders',
    categories: 'Sales by category', topItems: 'Top items', cancellations: 'Cancellations', voids: 'Voids',
    movements: 'Cash movements', byCashier: 'Discounts by cashier', denominations: 'Count by denomination',
    printed: 'Printed', note: 'note', coin: 'coin'
  },
  fr: {
    x: 'RAPPORT X', z: 'RAPPORT Z', shift: 'Service', register: 'Caisse', cashier: 'Caissier', opened: 'Ouverture',
    closed: 'Clôture', closedBy: 'Clôturé par', orders: 'Commandes', gross: 'Ventes brutes', discounts: 'Remises',
    deliveryFees: 'Frais de livraison', net: 'Ventes nettes', average: 'Panier moyen', local: 'Sur place',
    takeout: 'À emporter', delivery: 'Livraison', payments: 'Paiements par mode', refunds: 'remboursements',
    drawer: 'Tiroir-caisse', float: 'Fond de caisse', cashSales: 'Ventes espèces', cashRefunds: 'Remboursements espèces',
    rounding: 'Arrondi', payIns: 'Entrées', payOuts: 'Sorties', drivers: 'Règlements livreurs',
    expected: 'Espèces attendues', counted: 'Espèces comptées', overShort: 'Écart', hidden: "masqué (comptage à l'aveugle)",
    unpaid: 'Commandes impayées', categories: 'Ventes par catégorie', topItems: 'Meilleures ventes',
    cancellations: 'Annulations', voids: 'Articles retirés', movements: 'Mouvements de caisse',
    byCashier: 'Remises par caissier', denominations: 'Comptage par coupure', printed: 'Imprimé', note: 'billet', coin: 'pièce'
  },
  ar: {
    x: 'تقرير X', z: 'تقرير Z', shift: 'المناوبة', register: 'الصندوق', cashier: 'أمين الصندوق', opened: 'الفتح',
    closed: 'الإغلاق', closedBy: 'أُغلقت من طرف', orders: 'الطلبات', gross: 'المبيعات الإجمالية', discounts: 'الخصومات',
    deliveryFees: 'رسوم التوصيل', net: 'صافي المبيعات', average: 'متوسط الطلب', local: 'في المطعم', takeout: 'سفري',
    delivery: 'توصيل', payments: 'المدفوعات حسب الطريقة', refunds: 'استرداد', drawer: 'درج النقود',
    float: 'رصيد الافتتاح', cashSales: 'المبيعات النقدية', cashRefunds: 'المبالغ المستردة نقدًا', rounding: 'التقريب',
    payIns: 'إيداعات', payOuts: 'سحوبات', drivers: 'تسويات السائقين', expected: 'النقد المتوقع', counted: 'النقد المعدود',
    overShort: 'الفرق', hidden: 'مخفي (عدّ دون عرض المتوقع)', unpaid: 'طلبات غير مدفوعة', categories: 'المبيعات حسب الفئة',
    topItems: 'الأكثر مبيعًا', cancellations: 'الإلغاءات', voids: 'المنتجات المحذوفة', movements: 'حركات الصندوق',
    byCashier: 'الخصومات حسب أمين الصندوق', denominations: 'العد حسب الفئة النقدية', printed: 'طُبع في', note: 'ورقة', coin: 'قطعة'
  }
}

export function reportLabels(settings: Record<string, string>): ReportLabels {
  return LABELS[receiptLang(settings)]
}

/** Whole dinars with a thin grouping space: 45 300 DA. */
export function formatDA(value: number | null | undefined, currency: string): string {
  const rounded = Math.round(Number(value) || 0)
  const sign = rounded < 0 ? '-' : ''
  return `${sign}${String(Math.abs(rounded)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} ${currency}`
}

/** Algiers wall-clock (UTC+1, no DST) "YYYY-MM-DD HH:MM" for an ISO timestamp. */
export function algiersTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return String(iso)
  return new Date(date.getTime() + 60 * 60_000).toISOString().slice(0, 16).replace('T', ' ')
}

export function buildShiftReportHTML(
  report: ShiftReport,
  settings: Record<string, string>,
  ctx: { paperWidth: string | null; fontSize: string | null }
): string {
  const lang = receiptLang(settings)
  const isRTL = lang === 'ar'
  const L = reportLabels(settings)
  const width = printableWidth(ctx.paperWidth || settings.printer_width)
  const sizes = fontSizes(ctx.fontSize || settings.receipt_font_size, 'medium')
  const currency = currencySymbol(settings)
  const da = (value: number | null | undefined) => esc(formatDA(value, currency))
  const row = (left: string, right: string, bold = false) =>
    `<div class="row${bold ? ' bold' : ''}"><span>${left}</span><span>${right}</span></div>`
  const section = (title: string) => `<div class="line"></div><div class="bold">${esc(title)}</div>`
  const { shift, orders, cash } = report

  let body = `<div class="center bold big">${esc(report.kind === 'Z' ? L.z : L.x)}</div>`
  body += `<div class="center">${esc(settings.restaurant_name || '')}</div>`
  body += row(esc(`${L.shift} #${shift.id}`), esc(`${L.register}: ${shift.register_id}`))
  body += row(esc(L.cashier), esc(shift.cashier_name))
  body += row(esc(L.opened), esc(algiersTime(shift.opened_at)))
  if (shift.closed_at) body += row(esc(L.closed), esc(algiersTime(shift.closed_at)))
  if (shift.closed_by) body += row(esc(L.closedBy), esc(shift.closed_by))

  body += section(L.orders)
  body += row(esc(L.orders), esc(orders.count))
  body += row(esc(L.gross), da(orders.gross_sales))
  body += row(esc(L.discounts), da(-orders.discounts))
  if (orders.delivery_fees) body += row(esc(L.deliveryFees), da(orders.delivery_fees))
  body += row(esc(L.net), da(orders.net_sales), true)
  body += row(esc(L.average), da(orders.average_ticket))
  for (const type of ['local', 'takeout', 'delivery'] as const) {
    const bucket = orders.by_type[type]
    if (bucket.count) body += row(esc(`  ${L[type]} (${bucket.count})`), da(bucket.total))
  }

  body += section(L.payments)
  for (const payment of report.payments) {
    body += row(esc(`${payment.label} (${payment.count})`), da(payment.net))
    if (payment.refunds) body += row(esc(`  ${L.refunds}`), da(payment.refunds))
  }

  body += section(L.drawer)
  body += row(esc(L.float), da(cash.opening_float))
  body += row(esc(L.cashSales), da(cash.cash_sales))
  if (cash.cash_refunds) body += row(esc(L.cashRefunds), da(cash.cash_refunds))
  if (cash.rounding) body += row(esc(L.rounding), da(cash.rounding))
  if (cash.pay_ins) body += row(esc(L.payIns), da(cash.pay_ins))
  if (cash.pay_outs) body += row(esc(L.payOuts), da(-cash.pay_outs))
  if (cash.driver_differences) body += row(esc(L.drivers), da(cash.driver_differences))
  body += row(esc(L.expected), cash.expected === null ? esc(L.hidden) : da(cash.expected), true)
  if (cash.counted !== null) body += row(esc(L.counted), da(cash.counted), true)
  if (cash.over_short !== null) body += row(esc(L.overShort), da(cash.over_short), true)
  if (cash.denominations) {
    body += `<div class="small">${esc(L.denominations)}</div>`
    for (const denomination of DZD_DENOMINATIONS) {
      const count = Number(cash.denominations[denomination.key] || 0)
      if (count > 0) {
        body += row(esc(`  ${denomination.value} (${denomination.kind === 'note' ? L.note : L.coin}) x ${count}`), da(count * denomination.value))
      }
    }
  }
  if (report.movements.length) {
    body += section(L.movements)
    for (const movement of report.movements) {
      body += row(esc(`${movement.kind === 'pay_in' ? '+' : '-'} ${movement.reason}`), da(movement.kind === 'pay_in' ? movement.amount : -movement.amount))
    }
  }
  if (report.driver_settlements.length) {
    body += section(L.drivers)
    for (const settlement of report.driver_settlements) {
      body += row(esc(settlement.driver_name), esc(`${formatDA(settlement.collected, currency)} / ${formatDA(settlement.expected, currency)}`))
    }
  }
  if (report.unpaid.count) body += section(L.unpaid) + row(esc(String(report.unpaid.count)), da(report.unpaid.amount))

  if (report.categories.length) {
    body += section(L.categories)
    for (const line of report.categories) body += row(esc(`${line.name} (${line.quantity})`), da(line.revenue))
  }
  if (report.top_items.length) {
    body += section(L.topItems)
    for (const line of report.top_items) body += row(esc(`${line.quantity}x ${line.name}`), da(line.revenue))
  }
  if (report.discounts.by_cashier.length) {
    body += section(L.byCashier)
    for (const entry of report.discounts.by_cashier) body += row(esc(`${entry.cashier} (${entry.count})`), da(-entry.amount))
  }
  body += section(`${L.cancellations}: ${report.cancellations.count}`)
  for (const entry of report.cancellations.list) {
    body += row(esc(`#${entry.daily_number} ${algiersTime(entry.at).slice(11)} ${entry.by}`), da(entry.total))
    if (entry.reason) body += `<div class="small">${esc(entry.reason)}</div>`
  }
  body += section(`${L.voids}: ${report.voids.count}`)
  for (const entry of report.voids.by_operator) body += row(esc(`${entry.operator} (${entry.count})`), da(-entry.amount))
  body += `<div class="line"></div><div class="center small">${esc(L.printed)}: ${esc(algiersTime(report.generated_at))}</div>`

  return `<!DOCTYPE html><html dir="${isRTL ? 'rtl' : 'ltr'}" lang="${lang}"><head><meta charset="utf-8"><style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: 'Courier New', monospace; font-size: ${sizes.body}px; width: ${width.css}; padding: 4mm 2mm; }
.center { text-align: center; } .bold { font-weight: bold; } .big { font-size: ${sizes.big}px; }
.small { font-size: ${Math.max(8, sizes.body - 2)}px; }
.line { border-top: 1px dashed #000; margin: 5px 0; }
.row { display: flex; justify-content: space-between; gap: 6px; }
</style></head><body>${body}<br><br></body></html>`
}

/** Compact owner summary (Telegram HTML parse mode). */
export function buildShiftTelegramSummary(report: ShiftReport, settings: Record<string, string>): string {
  const L = reportLabels(settings)
  const currency = currencySymbol(settings)
  const da = (value: number | null | undefined) => esc(formatDA(value, currency))
  const { shift, orders, cash } = report
  const lines = [
    `📊 <b>${esc(report.kind === 'Z' ? L.z : L.x)} — ${esc(settings.restaurant_name || '')}</b>`,
    `${esc(L.shift)} #${shift.id} · ${esc(shift.cashier_name)} · ${esc(algiersTime(shift.opened_at))} → ${esc(algiersTime(shift.closed_at).slice(11) || '…')}`,
    `🧾 ${esc(L.orders)}: ${orders.count} · ${esc(L.net)}: <b>${da(orders.net_sales)}</b>`
  ]
  if (report.payments.length) lines.push(`💳 ${report.payments.map((payment) => `${esc(payment.label)} ${da(payment.net)}`).join(' · ')}`)
  const drawer = [`${esc(L.expected)} ${cash.expected === null ? esc(L.hidden) : da(cash.expected)}`]
  if (cash.counted !== null) drawer.push(`${esc(L.counted)} ${da(cash.counted)}`)
  if (cash.over_short !== null) drawer.push(`${esc(L.overShort)} <b>${da(cash.over_short)}</b>`)
  lines.push(`💵 ${drawer.join(' · ')}`)
  if (cash.pay_outs || cash.pay_ins) lines.push(`↕️ ${esc(L.payIns)} ${da(cash.pay_ins)} · ${esc(L.payOuts)} ${da(cash.pay_outs)}`)
  lines.push(`❌ ${esc(L.cancellations)}: ${report.cancellations.count} (${da(report.cancellations.amount)}) · ${esc(L.voids)}: ${report.voids.count} (${da(report.voids.amount)})`)
  if (orders.discounts || orders.delivery_fees) {
    lines.push(`🏷️ ${esc(L.discounts)}: ${da(orders.discounts)} · 🛵 ${esc(L.deliveryFees)}: ${da(orders.delivery_fees)}`)
  }
  if (report.unpaid.count) lines.push(`⏳ ${esc(L.unpaid)}: ${report.unpaid.count} (${da(report.unpaid.amount)})`)
  return lines.join('\n')
}
