// Seed a freshly-launched POS test instance into a working, activated state by driving the
// app's OWN IPC through Playwright (real code paths, no separate DB driver). Idempotent.
const crypto = require('crypto')

// Same key the app uses; valid only for the isolated TEST machine id, so this never helps piracy.
const SECRET_KEY = 'FFM-2024-SERIAL-KEY-DO-NOT-SHARE'

function serialFor(machineId) {
  const hmac = crypto.createHmac('sha256', SECRET_KEY).update(machineId.toUpperCase()).digest('hex')
  const c = hmac.substring(0, 20).toUpperCase()
  return `${c.slice(0, 5)}-${c.slice(5, 10)}-${c.slice(10, 15)}-${c.slice(15, 20)}`
}

/**
 * Activate + complete setup + seed a small menu and a promo, all via window.api.* in the
 * renderer. `win` is the Playwright Page for the main window. Returns a summary.
 */
async function seedViaIpc(win, { machineId = 'TESTLAB000000001' } = {}) {
  const serial = serialFor(machineId)

  const activation = await win.evaluate((s) => window.api.activation.activate(s), serial)

  await win.evaluate(() =>
    window.api.settings.setMultiple({
      setup_complete: 'true',
      restaurant_name: 'Test Lab Diner',
      currency: 'DZD',
      currency_symbol: 'DA',
      language: 'en',
      food_language: 'en',
      input_mode: 'keyboard'
    })
  )

  const menu = await win.evaluate(() => window.api.menu.getAll())
  if (!menu || menu.length === 0) {
    const cat = await win.evaluate(() => window.api.categories.create({ name: 'Burgers', icon: '🍔' }))
    const catId = cat.id
    await win.evaluate((cid) => window.api.menu.create({ name: 'Cheeseburger', price: 300, category_id: cid, emoji: '🍔' }), catId)
    await win.evaluate((cid) => window.api.menu.create({ name: 'Double Burger', price: 500, category_id: cid, emoji: '🍔' }), catId)
    await win.evaluate((cid) => window.api.menu.create({ name: 'Fries', price: 150, category_id: cid, emoji: '🍟' }), catId)
  }

  const promos = await win.evaluate(() => window.api.promotions.getAll())
  if (!promos || promos.length === 0) {
    await win.evaluate(() =>
      window.api.promotions.create({
        name: 'Test 10% Off',
        type: 'percentage',
        discount_value: 10,
        applies_to: 'all',
        is_active: 1
      })
    )
  }

  return { serial, activated: activation && activation.success }
}

module.exports = { serialFor, seedViaIpc }
