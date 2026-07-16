import assert from 'node:assert/strict'
import test from 'node:test'
import { validateSetupImportPayload } from '../../src/shared/excel-import.ts'

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
