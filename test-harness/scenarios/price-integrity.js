// Verifies the price-tampering fix: untrusted orders (tablet/remote) use forceMenuPrice so a
// client-supplied unit_price (e.g. 0) is IGNORED and the menu price is used — while the trusted
// POS path still honors a deliberate cashier price override.
const path = require('path')
const { bootSeededPos } = require('../lib/boot')
const { artifactsDir, saveText, log } = require('../lib/util')

exports.run = async () => {
  const out = artifactsDir('price-integrity')
  const { app, win } = await bootSeededPos()
  try {
    const menu = await win.evaluate(() => window.api.menu.getAll())
    const item = (menu || []).find((m) => /cheese/i.test(m.name)) || (menu || [])[0] // 300 DA

    // Untrusted path: forceMenuPrice must IGNORE a client price of 0 and use the menu price.
    const forced = await win.evaluate(
      (mid) =>
        window.api.orders.create({
          order_type: 'takeout',
          forceMenuPrice: true,
          items: [{ menu_item_id: mid, quantity: 1, unit_price: 0 }]
        }),
      item.id
    )
    saveText(out, 'forced.json', JSON.stringify(forced, null, 2))
    log(`forceMenuPrice order total=${forced.total} (expect 300 — client price 0 ignored)`)
    if (Math.abs(Number(forced.total) - 300) > 0.5) {
      throw new Error(`PRICE TAMPERING NOT BLOCKED: forced order total=${forced.total}, expected 300`)
    }

    // Trusted POS path: a deliberate override IS honored.
    const custom = await win.evaluate(
      (mid) =>
        window.api.orders.create({
          order_type: 'takeout',
          items: [{ menu_item_id: mid, quantity: 1, unit_price: 250 }]
        }),
      item.id
    )
    log(`POS custom-price order total=${custom.total} (expect 250)`)
    if (Math.abs(Number(custom.total) - 250) > 0.5) {
      throw new Error(`POS custom price not honored: total=${custom.total}, expected 250`)
    }

    log('✔ price integrity: untrusted order forced to menu price; trusted POS override honored')
    return { artifacts: out }
  } finally {
    await app.close().catch(() => {})
  }
}
