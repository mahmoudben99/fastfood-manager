import assert from 'node:assert/strict'
import test from 'node:test'
import { register, createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

// v4 cash printing: receipts show payments + delivery, kitchen tickets show the delivery block,
// X/Z report HTML (RTL in Arabic), Telegram summary, invoice. Pure builders — plain node.
const require = createRequire(import.meta.url)
const esbuildEntry = pathToFileURL(require.resolve('esbuild')).href
const loaderSrc = `
import { existsSync, statSync, readFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'
let esbuild
export async function initialize(data) { esbuild = await import(data.esbuildEntry) }
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('.') && context.parentURL) {
    try { return await nextResolve(specifier, context) }
    catch (err) {
      const base = path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier)
      for (const cand of [base + '.ts', path.join(base, 'index.ts')]) {
        if (existsSync(cand) && statSync(cand).isFile()) return nextResolve(pathToFileURL(cand).href, context)
      }
      throw err
    }
  }
  return nextResolve(specifier, context)
}
export async function load(url, context, nextLoad) {
  if (url.endsWith('.ts')) {
    const source = readFileSync(fileURLToPath(url), 'utf8')
    const result = esbuild.transformSync(source, { loader: 'ts', format: 'esm', target: 'node20' })
    return { format: 'module', source: result.code, shortCircuit: true }
  }
  return nextLoad(url, context)
}
`
register('data:text/javascript,' + encodeURIComponent(loaderSrc), import.meta.url, { data: { esbuildEntry } })

const { buildDefaultReceiptHTML, buildKitchenHTML, buildSampleOrder } = await import('../../src/main/services/print-documents.ts')
const { buildFromTemplate } = await import('../../src/main/services/receipt-template.ts')
const { buildShiftReportHTML, buildShiftTelegramSummary, formatDA } = await import('../../src/main/services/shift-report-format.ts')
const { buildInvoiceHTML } = await import('../../src/main/services/invoice.ts')
const { cashBreakdown, denominationsTotal, roundCash, parseApprovalError } = await import('../../src/shared/cash.ts')
const { canMoveDelivery } = await import('../../src/shared/delivery.ts')

const ctx = { logoDataUrl: null, paperWidth: '80', receiptFontSize: 'medium' }

function deliveryOrder() {
  const order = buildSampleOrder([])
  return {
    ...order,
    order_type: 'delivery',
    table_number: null,
    delivery_fee: 200,
    total: order.total + 200,
    payment_status: 'paid',
    delivery: { address: 'Cité 5 Juillet, Bt 12', zone_name: 'Centre', estimated_minutes: 30, notes: 'Porte bleue' },
    payments: [
      { kind: 'payment', method: 'cash', amount: 1000, rounding: 0, tendered: 2000, change_given: 1000, reference: null },
      { kind: 'payment', method: 'cib', amount: order.total + 200 - 1000, rounding: 0, tendered: null, change_given: 0, reference: 'TPE-42' }
    ]
  }
}

test('default receipt: delivery address/zone, fee row, payments with cash given + change (French)', () => {
  const html = buildDefaultReceiptHTML(deliveryOrder(), { language: 'fr', currency_symbol: '' }, ctx)
  assert.match(html, /Adresse: Cité 5 Juillet, Bt 12/)
  assert.match(html, /Zone: Centre \(~30 min\)/)
  assert.match(html, /Frais de livraison<\/span><span>\+200\.00 DA/)
  assert.match(html, /Payé \(Espèces\)<\/span><span>1000\.00 DA/)
  assert.match(html, /Espèces reçues<\/span><span>2000\.00 DA/)
  assert.match(html, /Monnaie rendue<\/span><span>1000\.00 DA/)
  assert.match(html, /Payé \(Carte CIB\)/)
  assert.match(html, /Ref: TPE-42/)
  assert.doesNotMatch(html, /Reste à payer/)
})

test('unpaid COD receipt shows the balance due; a pre-v4 order prints no payment block', () => {
  const unpaid = { ...deliveryOrder(), payments: [], payment_status: 'unpaid' }
  const html = buildDefaultReceiptHTML(unpaid, { language: 'ar' }, ctx)
  assert.match(html, /dir="rtl"/)
  assert.match(html, /المبلغ المتبقي/)
  assert.match(html, /غير مدفوع/)
  const legacy = buildDefaultReceiptHTML(buildSampleOrder([]), { language: 'en' }, ctx)
  assert.doesNotMatch(legacy, /Paid \(|Balance due|Delivery fee/)
})

test('template receipt and kitchen ticket carry the delivery block', async () => {
  const template = { blocks: [
    { type: 'order_details', enabled: true, config: {} },
    { type: 'total', enabled: true, config: {} }
  ] }
  const html = await buildFromTemplate(template, deliveryOrder(), { language: 'en' }, ctx)
  assert.match(html, /Address: Cité 5 Juillet/)
  assert.match(html, /Delivery fee/)
  assert.match(html, /Paid \(Cash\)/)
  const order = { ...deliveryOrder(), payment_status: 'unpaid', payments: [] }
  const kitchen = buildKitchenHTML(order, order.items, {}, { paperWidth: '80', kitchenFontSize: 'large', eventType: 'new', workerName: null, changes: [], removedNames: {} })
  assert.match(kitchen, /ZONE: CENTRE/)
  assert.match(kitchen, /TEL: 0551 23 45 67/)
  assert.match(kitchen, /COD - NOT PAID/)
})

const report = {
  kind: 'Z', generated_at: '2026-09-27T20:00:00.000Z', blind: false,
  shift: { id: 3, register_id: 'main', status: 'closed', cashier_name: 'Karim', cashier_worker_id: null, opening_float: 5000,
    opened_at: '2026-09-27T07:00:00.000Z', business_date: '2026-09-27', open_note: null, closed_at: '2026-09-27T19:30:00.000Z',
    closed_by: 'Karim', counted_cash: 6950, denominations: null, expected_cash: 7000, over_short: -50, close_note: null },
  orders: { count: 4, gross_sales: 2800, discounts: 100, delivery_fees: 0, net_sales: 2700, average_ticket: 675,
    by_type: { local: { count: 0, total: 0 }, takeout: { count: 4, total: 2700 }, delivery: { count: 0, total: 0 } } },
  payments: [{ method: 'cash', label: 'نقدا', count: 4, amount: 2500, refunds: -600, net: 1900 }],
  cash: { opening_float: 5000, cash_sales: 2500, cash_refunds: -600, rounding: 0, pay_ins: 300, pay_outs: 200, driver_differences: 0,
    change_given: 1000, expected: 7000, counted: 6950, over_short: -50, denominations: { n2000: 3, n500: 1, c200: 2, c50: 1 } },
  unpaid: { count: 0, amount: 0 },
  categories: [{ name: 'أطباق', quantity: 6, revenue: 2800 }],
  top_items: [{ name: 'برغر', quantity: 4, revenue: 2000 }],
  discounts: { count: 1, amount: 100, by_cashier: [{ cashier: 'Nadia', count: 1, amount: 100 }] },
  cancellations: { count: 1, amount: 300, list: [{ order_id: 3, daily_number: 3, total: 300, at: '2026-09-27T09:00:00.000Z', by: 'Karim', reason: 'wrong order' }] },
  voids: { count: 1, amount: 300, list: [], by_operator: [{ operator: 'Karim', count: 1, amount: 300 }] },
  movements: [{ id: 1, shift_id: 3, kind: 'pay_out', amount: 200, reason: 'خبز', operator: 'Karim', created_at: '2026-09-27T10:00:00.000Z' }],
  driver_settlements: []
}

test('Z report HTML: Arabic RTL labels, drawer reconciliation, denominations, cancellations with who', () => {
  const html = buildShiftReportHTML(report, { language: 'ar', restaurant_name: 'La Zone' }, { paperWidth: '58', fontSize: null })
  assert.match(html, /<html dir="rtl" lang="ar">/)
  assert.match(html, /تقرير Z/)
  assert.match(html, /النقد المتوقع<\/span><span>7 000 DA/)
  assert.match(html, /النقد المعدود<\/span><span>6 950 DA/)
  assert.match(html, /الفرق<\/span><span>-50 DA/)
  assert.match(html, /2000 \(ورقة\) x 3/)
  assert.match(html, /#3 10:00 Karim/)
  assert.match(html, /width: 48mm/)
  const x = buildShiftReportHTML({ ...report, kind: 'X', blind: true, cash: { ...report.cash, expected: null, counted: null, over_short: null } }, { language: 'fr' }, { paperWidth: '80', fontSize: null })
  assert.match(x, /RAPPORT X/)
  assert.match(x, /Espèces attendues<\/span><span>masqué/)
})

test('Telegram summary is compact HTML in the app language', () => {
  const text = buildShiftTelegramSummary(report, { language: 'fr', restaurant_name: 'Chez <Nous>' })
  assert.match(text, /RAPPORT Z — Chez &lt;Nous&gt;/)
  assert.match(text, /Ventes nettes: <b>2 700 DA<\/b>/)
  assert.match(text, /Écart <b>-50 DA<\/b>/)
  assert.match(text, /Annulations: 1 \(300 DA\)/)
  assert.ok(text.split('\n').length <= 10)
})

test('invoice: seller legal IDs, customer IDs, number, optional VAT split', () => {
  const order = { ...deliveryOrder(), order_date: '2026-09-27' }
  const invoice = { id: 1, invoice_number: '2026/000007', year: 2026, seq: 7, order_id: 0, total: order.total,
    customer: JSON.stringify({ name: 'SARL Atlas', nif: '000016001234567', rc: '16/00-1234567B19' }), created_at: '2026-09-27T10:00:00.000Z' }
  const settings = { language: 'fr', restaurant_name: 'La Zone', legal_nif: '199916000000000', legal_nis: '1234', restaurant_address: 'Alger' }
  const html = buildInvoiceHTML(order, invoice, settings)
  assert.match(html, /FACTURE/)
  assert.match(html, /N° 2026\/000007/)
  assert.match(html, /NIF: 199916000000000/)
  assert.match(html, /SARL Atlas/)
  assert.match(html, /RC: 16\/00-1234567B19/)
  assert.doesNotMatch(html, /TVA/)
  const vat = buildInvoiceHTML(order, invoice, { ...settings, invoice_tva_rate: '19' }, { format: 'a4' })
  assert.match(vat, /Total HT/)
  assert.match(vat, /TVA 19%/)
  assert.match(vat, /width: 190mm/)
})

test('shared cash rules: rounding, change, denominations, approval tokens, delivery transitions', () => {
  assert.equal(roundCash(1233, 5), 1235)
  assert.equal(roundCash(1233, 10), 1230)
  assert.equal(roundCash(1233, 0), 1233)
  assert.deepEqual(cashBreakdown(1233, 1500, 5), { due: 1235, rounding: 2, change: 265, sufficient: true })
  assert.equal(cashBreakdown(1233, 1200, 0).sufficient, false)
  assert.equal(denominationsTotal({ n2000: 2, n200: 1, c200: 1, c5: 3 }), 4415)
  assert.throws(() => denominationsTotal({ c1: 1 }), /Unknown denomination/)
  assert.deepEqual(parseApprovalError(new Error("Error invoking remote method 'orders:cancel': Error: APPROVAL_REQUIRED:cancel_order")),
    { kind: 'required', action: 'cancel_order' })
  assert.equal(canMoveDelivery('pending', 'delivered'), false)
  assert.equal(canMoveDelivery('out_for_delivery', 'delivered'), true)
  assert.equal(formatDA(-1234567, 'DA'), '-1 234 567 DA')
})
