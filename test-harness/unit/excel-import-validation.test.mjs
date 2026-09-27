import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire, register } from 'node:module'
import { pathToFileURL } from 'node:url'
import * as XLSX from 'xlsx'
import {
  normalizeRecipeUnit,
  normalizeStockUnit,
  parseSetupImportNumber,
  validateSetupImportPayload
} from '../../src/shared/excel-import.ts'

// The renderer workbook parser uses this codebase's extensionless relative TS imports, which
// Node's type stripping cannot resolve; a tiny esbuild loader handles just that.
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
      for (const candidate of [base + '.ts', path.join(base, 'index.ts')]) {
        if (existsSync(candidate) && statSync(candidate).isFile()) return nextResolve(pathToFileURL(candidate).href, context)
      }
      throw err
    }
  }
  return nextResolve(specifier, context)
}
export async function load(url, context, nextLoad) {
  if (url.endsWith('.ts') && url.includes('/src/renderer/')) {
    const source = readFileSync(fileURLToPath(url), 'utf8')
    const result = esbuild.transformSync(source, { loader: 'ts', format: 'esm', target: 'node20' })
    return { format: 'module', source: result.code, shortCircuit: true }
  }
  return nextLoad(url, context)
}
`
register('data:text/javascript,' + encodeURIComponent(loaderSrc), import.meta.url, { data: { esbuildEntry } })
const { parseSetupWorkbook } = await import('../../src/renderer/src/lib/excelSetupImport.ts')

function validPayload() {
  return {
    categories: [{ name: ' Burgers ', name_ar: '', name_fr: 'Burgers', icon: '🍔' }],
    menuItems: [
      {
        name: 'Classic',
        price: 500,
        category_name: 'burgers',
        emoji: '🍔'
      }
    ],
    stockItems: [
      {
        name: 'Beef',
        unit_type: 'kg',
        quantity: 10,
        price_per_unit: 1_200,
        alert_threshold: 2
      }
    ],
    workers: [
      {
        name: 'Cook One',
        role: 'cook',
        pay_full_day: 2_000,
        pay_half_day: 1_000,
        category_names: ['Burgers']
      }
    ],
    ingredients: [
      {
        menu_item_name: 'Classic',
        stock_item_name: 'Beef',
        quantity: 150,
        unit: 'g'
      }
    ]
  }
}

test('accepts a complete workbook payload and normalizes names', () => {
  const result = validateSetupImportPayload(validPayload())
  assert.equal(result.categories[0].name, 'Burgers')
  assert.equal(result.menuItems[0].category_name, 'burgers')
  assert.deepEqual(result.workers[0].category_names, ['Burgers'])
  assert.equal(result.ingredients[0].unit, 'g')
})

test('rejects a menu row whose category is absent', () => {
  const payload = validPayload()
  payload.menuItems[0].category_name = 'Pizza'
  assert.throws(
    () => validateSetupImportPayload(payload),
    /category "Pizza" does not exist in Categories/
  )
})

test('rejects duplicate names before ambiguous relationships can be imported', () => {
  const payload = validPayload()
  payload.stockItems.push({ ...payload.stockItems[0], name: ' beef ' })
  assert.throws(() => validateSetupImportPayload(payload), /duplicate name "beef"/)
})

test('rejects recipe units incompatible with the stock base unit', () => {
  const payload = validPayload()
  payload.ingredients[0].unit = 'ml'
  assert.throws(() => validateSetupImportPayload(payload), /ml is incompatible with stock unit kg/)
})

test('rejects zero recipe quantities and non-finite money', () => {
  const zeroQuantity = validPayload()
  zeroQuantity.ingredients[0].quantity = 0
  assert.throws(() => validateSetupImportPayload(zeroQuantity), /Quantity must be between/)

  const invalidPrice = validPayload()
  invalidPrice.menuItems[0].price = Number.NaN
  assert.throws(() => validateSetupImportPayload(invalidPrice), /Price must be a finite number/)
})

test('rejects a duplicate stock item within one recipe', () => {
  const payload = validPayload()
  payload.ingredients.push({ ...payload.ingredients[0] })
  assert.throws(() => validateSetupImportPayload(payload), /appears twice in recipe/)
})

test('stock Unit_Type accepts common aliases case-insensitively', () => {
  for (const alias of ['kg', 'KG', 'Kilo', 'kilogramme', 'Kilograms', 'كغ']) assert.equal(normalizeStockUnit(alias), 'kg', alias)
  for (const alias of ['L', 'l', 'Lt', 'litre', 'Litres', 'liter', 'لتر']) assert.equal(normalizeStockUnit(alias), 'liter', alias)
  for (const alias of ['unit', 'U', 'pc', 'PCS', 'pièce', 'Pieces', 'unité', 'وحدة']) assert.equal(normalizeStockUnit(alias), 'unit', alias)
  assert.equal(normalizeStockUnit('g'), undefined, 'grams are a recipe unit, not a stock unit')
  assert.equal(normalizeStockUnit('box'), undefined)

  const payload = validPayload()
  payload.stockItems[0].unit_type = 'Kilo'
  assert.equal(validateSetupImportPayload(payload).stockItems[0].unit_type, 'kg')
  payload.stockItems[0].unit_type = 'box'
  assert.throws(() => validateSetupImportPayload(payload), /Unit_Type "box" is not recognised/)
})

test('recipe units accept aliases and are stored canonically', () => {
  assert.equal(normalizeRecipeUnit('G'), 'g')
  assert.equal(normalizeRecipeUnit('gr'), 'g')
  assert.equal(normalizeRecipeUnit('Litre'), 'liter')
  assert.equal(normalizeRecipeUnit('ML'), 'ml')

  const payload = validPayload()
  payload.ingredients[0].unit = 'GR'
  assert.equal(validateSetupImportPayload(payload).ingredients[0].unit, 'g')

  payload.stockItems.push({ name: 'Bun', unit_type: 'pcs', quantity: 50, price_per_unit: 20, alert_threshold: 10 })
  payload.ingredients.push({ menu_item_name: 'Classic', stock_item_name: 'Bun', quantity: 1, unit: 'Pièce' })
  const result = validateSetupImportPayload(payload)
  assert.equal(result.stockItems[1].unit_type, 'unit')
  assert.equal(result.ingredients[1].unit, 'unit')
})

test('a blank recipe unit is refused for kg/liter stock and never guessed', () => {
  const payload = validPayload()
  payload.ingredients[0].unit = ''
  assert.throws(
    () => validateSetupImportPayload(payload),
    /Ingredients row 2: Unit is required for "Beef" \(stock counted in kg\)\. Write g or kg/
  )

  // Items counted in pieces are unambiguous: a blank unit means "unit".
  const pieces = validPayload()
  pieces.stockItems[0].unit_type = 'unit'
  pieces.ingredients[0] = { ...pieces.ingredients[0], quantity: 1, unit: '' }
  assert.equal(validateSetupImportPayload(pieces).ingredients[0].unit, 'unit')
})

test('numbers accept an unambiguous decimal comma and refuse ambiguous ones', () => {
  assert.equal(parseSetupImportNumber(12.5), 12.5)
  assert.equal(parseSetupImportNumber(' 3 '), 3)
  assert.equal(parseSetupImportNumber('0,5'), 0.5)
  assert.equal(parseSetupImportNumber('12,75'), 12.75)
  assert.equal(parseSetupImportNumber('0,500'), 0.5)
  assert.equal(parseSetupImportNumber('1500,25'), 1500.25)
  assert.equal(parseSetupImportNumber('1.5'), 1.5)
  assert.equal(parseSetupImportNumber('1,200'), 'ambiguous')
  assert.equal(parseSetupImportNumber('1.200,50'), undefined)
  assert.equal(parseSetupImportNumber('1,2,3'), undefined)
  assert.equal(parseSetupImportNumber('12 kg'), undefined)
  assert.equal(parseSetupImportNumber(''), undefined)
  assert.equal(parseSetupImportNumber(Number.NaN), undefined)
})

function workbook({ unit = 'g', stockUnit = 'kg', quantity = '0,5', blankRow = false } = {}) {
  const book = XLSX.utils.book_new()
  const sheet = (rows, name) => XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), name)
  sheet([['Name'], ['Burgers']], 'Categories')
  sheet([['Name', 'Price', 'Category_Name'], ['Classic', 500, 'Burgers']], 'Menu Items')
  sheet(
    [['Name', 'Unit_Type', 'Initial_Quantity', 'Price_Per_Unit', 'Alert_Threshold'], ['Minced meat', stockUnit, quantity, 1200, 2]],
    'Stock Items'
  )
  sheet([['Name', 'Role', 'Pay_Full_Day', 'Pay_Half_Day']], 'Workers')
  const ingredientRows = [['Menu_Item_Name', 'Stock_Item_Name', 'Quantity', 'Unit']]
  if (blankRow) ingredientRows.push([null, null, null, null])
  ingredientRows.push(['Classic', 'Minced meat', 150, unit])
  sheet(ingredientRows, 'Ingredients')
  return new Uint8Array(XLSX.write(book, { type: 'array', bookType: 'xlsx' }))
}

test('workbook: aliases and a decimal comma import cleanly', () => {
  const payload = parseSetupWorkbook(workbook({ stockUnit: 'Kilo', quantity: '0,5', unit: 'G' }))
  assert.equal(payload.stockItems[0].unit_type, 'kg')
  assert.equal(payload.stockItems[0].quantity, 0.5)
  assert.equal(payload.ingredients[0].unit, 'g')
})

test('workbook: a blank Unit on a kg item names the Excel row and the stock item', () => {
  assert.throws(
    () => parseSetupWorkbook(workbook({ unit: null, blankRow: true })),
    /Ingredients row 3: Unit is required for "Minced meat" \(stock counted in kg\)/
  )
})

test('workbook: an ambiguous thousands-style comma is refused, not guessed', () => {
  assert.throws(() => parseSetupWorkbook(workbook({ quantity: '1,200' })), /Initial_Quantity "1,200" is ambiguous/)
})
