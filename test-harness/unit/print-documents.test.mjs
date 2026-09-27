import assert from 'node:assert/strict'
import test from 'node:test'
import { register, createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

// Same esbuild loader as the order-effects suites: the print builders use extensionless imports.
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

const { buildFromTemplate } = await import('../../src/main/services/receipt-template.ts')
const { buildDefaultReceiptHTML, buildKitchenHTML, buildSampleOrder, markAsTestPrint } = await import('../../src/main/services/print-documents.ts')

const order = buildSampleOrder([])
const noLogo = { logoDataUrl: null, paperWidth: '80', receiptFontSize: 'medium' }

test('template: no logo prints nothing for the logo block, labels follow the language, DA fallback', async () => {
  const template = {
    blocks: [
      { type: 'logo', enabled: true, config: {} },
      { type: 'restaurant_name', enabled: true, config: {} },
      { type: 'order_details', enabled: true, config: { alignment: 'left', bold: true, fontSize: 'large' } },
      { type: 'total', enabled: true, config: { alignment: 'right' } }
    ]
  }
  const settings = { restaurant_name: 'Chez Nous', language: 'fr', currency: 'DZD', currency_symbol: '' }
  const html = await buildFromTemplate(template, order, settings, noLogo)
  assert.equal(html.split('Chez Nous').length - 1, 1, 'restaurant name printed once (logo block adds nothing)')
  assert.match(html, /Commande #42/)
  assert.match(html, /Table: 5/)
  assert.match(html, /Remise|Promo -10%/)
  assert.match(html, /\d DA</)
  assert.doesNotMatch(html, /DZD/)
  assert.match(html, /text-align:left;font-size:17px;font-weight:bold;/, 'order details honour size/align/bold')
  assert.match(html, /justify-content:flex-end;gap:8px/, 'total honours right alignment')

  const ar = await buildFromTemplate({ blocks: JSON.stringify(template.blocks) }, order, { ...settings, language: 'ar' }, noLogo)
  assert.match(ar, /dir="rtl"/)
  assert.match(ar, /طلب #42/)
  assert.match(ar, /المجموع/)
})

test('template: per-printer receipt font is the base size; divider styles and a logo render', async () => {
  const blocks = [
    { type: 'logo', enabled: true, config: {} },
    { type: 'divider', enabled: true, config: { style: 'double' } },
    { type: 'divider', enabled: true, config: { decorationType: 'stars' } },
    { type: 'custom_text', enabled: true, config: { text: 'Merci', fontSize: 'large' } }
  ]
  const html = await buildFromTemplate({ blocks }, order, { language: 'en' }, {
    logoDataUrl: 'data:image/png;base64,AAAA', paperWidth: '58', receiptFontSize: 'large'
  })
  assert.match(html, /<img src="data:image\/png;base64,AAAA"/)
  assert.match(html, /border-top:3px double #000/)
  assert.match(html, /★ ☆/)
  assert.match(html, /font-size:20px;margin:6px 0;">Merci/, 'large block on a large base = 14 + 6')
  assert.match(html, /width:48mm/)
})

test('default receipt: REPRINT banner, DA fallback, restaurant name when there is no logo', () => {
  const html = buildDefaultReceiptHTML(order, { restaurant_name: 'Chez Nous', currency: 'DZD' }, { ...noLogo, reprint: true })
  assert.match(html, /\*\*\* REPRINT \*\*\*/)
  assert.match(html, /Chez Nous/)
  assert.match(html, /TOTAL/)
  assert.match(html, / DA</)
  assert.doesNotMatch(html, /DZD/)
})

test('kitchen ticket: table, customer, change markers, removed lines and REPRINT', () => {
  const html = buildKitchenHTML(order, order.items.slice(0, 2), { language: 'en' }, {
    paperWidth: '80',
    kitchenFontSize: 'large',
    eventType: 'updated',
    workerName: 'Grill',
    changes: [
      { kind: 'added', orderItemId: 1, menuItemId: 1, workerId: null, quantity: 2 },
      { kind: 'changed', orderItemId: 2, menuItemId: 2, workerId: null, quantity: 3, previousQuantity: 1 },
      { kind: 'removed', orderItemId: 9, menuItemId: 77, workerId: null, quantity: 1 }
    ],
    removedNames: { 77: 'Tacos <XL>' },
    reprint: true
  })
  assert.match(html, /TABLE 5/)
  assert.match(html, /AHMED/)
  assert.match(html, /UPDATED/)
  assert.match(html, /\+ ADDED/)
  assert.match(html, /QTY 1 -&gt; 3/)
  assert.match(html, /REMOVED/)
  assert.match(html, /Tacos &lt;XL&gt;/)
  assert.match(html, /FOR: GRILL/)
  assert.match(html, /\*\*\* REPRINT \*\*\*/)
})

test('test print: the full real receipt with one TEST PRINT line added at the top of the body', () => {
  const receipt = buildDefaultReceiptHTML(order, { restaurant_name: 'Loft', currency_symbol: 'DA' }, noLogo)
  const html = markAsTestPrint(receipt, 'EPSON <TM-T20>')
  assert.match(html, /<body[^>]*>\s*<div[^>]*>— TEST PRINT · EPSON &lt;TM-T20&gt; —<\/div>/)
  assert.equal(html.replace(/<div[^>]*>— TEST PRINT[^<]*<\/div>/, ''), receipt, 'nothing else changes')
  assert.match(html, /Loft/)
  assert.match(html, /TOTAL/i)
})

test('kitchen tickets follow the app language (fr / ar), English unchanged', () => {
  const ctx = { paperWidth: '80', kitchenFontSize: 'large', eventType: 'updated', workerName: 'Grill', changes: [], removedNames: {} }
  const fr = buildKitchenHTML(order, order.items, { language: 'fr' }, ctx)
  assert.match(fr, /CUISINE/)
  assert.match(fr, /SUR PLACE/)
  assert.match(fr, /MODIFIÉE/)
  assert.match(fr, /POUR : GRILL/)
  const ar = buildKitchenHTML(order, order.items, { language: 'ar' }, ctx)
  assert.match(ar, /dir="rtl"/)
  assert.match(ar, /المطبخ/)
  const en = buildKitchenHTML(order, order.items, {}, ctx)
  assert.match(en, /KITCHEN/)
  assert.match(en, /UPDATED/)
  assert.match(en, /FOR: GRILL/)
})
