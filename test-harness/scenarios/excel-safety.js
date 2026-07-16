const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { launchPos, mainWindow } = require('../lib/pos')
const { serialFor } = require('../lib/seed')
const { artifactsDir, saveText, sleep } = require('../lib/util')

function validPayload() {
  return {
    categories: [{ name: 'Burgers', name_fr: 'Burgers', icon: '🍔' }],
    menuItems: [
      { name: 'Classic', price: 500, category_name: 'Burgers', emoji: '🍔' }
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

exports.run = async () => {
  const out = artifactsDir('excel-safety')
  const userData = path.join(os.tmpdir(), `ffm-excel-safety-${process.pid}`)
  fs.rmSync(userData, { recursive: true, force: true })

  const app = await launchPos({ userData })
  try {
    const win = await mainWindow(app, { timeoutMs: 45_000 })
    await sleep(1_500)
    const serial = serialFor('TESTLAB000000001')
    const activation = await win.evaluate((code) => window.api.activation.activate(code), serial)
    assert.equal(activation.success, true, 'isolated test instance must activate')
    await win.evaluate(() => window.api.settings.set('setup_complete', 'false'))

    const imported = await win.evaluate((payload) => window.api.data.importSetup(payload), validPayload())
    assert.equal(imported.success, true)
    assert.deepEqual(imported.counts, {
      categories: 1,
      menuItems: 1,
      stockItems: 1,
      workers: 1,
      ingredients: 1
    })

    const stateAfterImport = await win.evaluate(async () => {
      const [categories, menuItems, stockItems, workers] = await Promise.all([
        window.api.categories.getAll(),
        window.api.menu.getAll(),
        window.api.stock.getAll(),
        window.api.workers.getAll()
      ])
      const menuItem = await window.api.menu.getById(menuItems[0].id)
      return {
        categories,
        menuItems,
        stockItems,
        workers,
        ingredients: menuItem.ingredients,
        legacyClearExposed: typeof window.api.data.clearForImport !== 'undefined'
      }
    })
    assert.equal(stateAfterImport.legacyClearExposed, false)
    assert.equal(stateAfterImport.ingredients.length, 1)
    assert.equal(stateAfterImport.ingredients[0].quantity, 150)
    assert.equal(stateAfterImport.ingredients[0].unit, 'g')
    assert.equal(stateAfterImport.workers[0].category_ids.length, 1)

    const malformed = validPayload()
    malformed.menuItems[0].category_name = 'Missing Category'
    const rejected = await win.evaluate(async (payload) => {
      try {
        await window.api.data.importSetup(payload)
        return { rejected: false, message: '' }
      } catch (error) {
        return { rejected: true, message: String(error) }
      }
    }, malformed)
    assert.equal(rejected.rejected, true)
    assert.match(rejected.message, /does not exist in Categories/)

    const unchangedMenu = await win.evaluate(() => window.api.menu.getAll())
    assert.deepEqual(unchangedMenu.map((item) => item.name), ['Classic'])

    await win.evaluate(() => window.api.settings.set('setup_complete', 'true'))
    const productionRejected = await win.evaluate(async (payload) => {
      try {
        await window.api.data.importSetup(payload)
        return { rejected: false, message: '' }
      } catch (error) {
        return { rejected: true, message: String(error) }
      }
    }, validPayload())
    assert.equal(productionRejected.rejected, true)
    assert.match(productionRejected.message, /only during initial setup/)

    saveText(
      out,
      'result.json',
      JSON.stringify({ imported, stateAfterImport, rejected, productionRejected }, null, 2)
    )
    return { artifacts: out }
  } finally {
    await app.close().catch(() => {})
    fs.rmSync(userData, { recursive: true, force: true })
  }
}
