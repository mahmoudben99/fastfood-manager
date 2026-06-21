// Verifies the loyalty fix: placing an order with a phone must create/link a customer and
// store customer_id on the order, so customers.getOrders() (the WHERE customer_id query that
// used to always return empty) actually returns it.
const path = require('path')
const { bootSeededPos } = require('../lib/boot')
const { artifactsDir, saveText, log } = require('../lib/util')

exports.run = async () => {
  const out = artifactsDir('loyalty')
  const { app, win } = await bootSeededPos()
  try {
    const phone = '0555000111'
    const menu = await win.evaluate(() => window.api.menu.getAll())
    const item = (menu || []).find((m) => /cheese/i.test(m.name)) || (menu || [])[0]

    // Place a delivery order with a phone — same handler the cart UI calls.
    const order = await win.evaluate(
      (a) =>
        window.api.orders.create({
          order_type: 'delivery',
          customer_phone: a.phone,
          customer_name: 'Loyalty Test',
          items: [{ menu_item_id: a.mid, quantity: 1 }]
        }),
      { mid: item.id, phone }
    )
    saveText(out, 'order.json', JSON.stringify(order, null, 2))

    const today = await win.evaluate(() => window.api.orders.getToday())
    const stored = (today || []).find((o) => o.id === order.id)
    const customers = await win.evaluate(() => window.api.customers.getAll())
    const cust = (customers || []).find((c) => c.phone === phone)
    saveText(out, 'customers.json', JSON.stringify(customers, null, 2))

    if (!cust) throw new Error('customer was NOT created from the order')
    if (!stored || !stored.customer_id) throw new Error(`order.customer_id not linked (got ${stored && stored.customer_id})`)
    if (stored.customer_id !== cust.id) throw new Error(`order.customer_id ${stored.customer_id} != customer ${cust.id}`)

    const custOrders = await win.evaluate((cid) => window.api.customers.getOrders(cid), cust.id)
    if (!custOrders || custOrders.length === 0) {
      throw new Error('customers.getOrders() returned empty — the broken WHERE customer_id query')
    }

    log(`✔ loyalty linked: customer #${cust.id} (${cust.phone}), order_count=${cust.order_count}, history=${custOrders.length} order(s)`)
    return { artifacts: out }
  } finally {
    await app.close().catch(() => {})
  }
}
