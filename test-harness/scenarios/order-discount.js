// End-to-end verification of the discount-persistence fix:
// add an item, the active 10% promo should apply, place the order, then confirm the STORED
// order has the discount (the exact bug that used to silently drop discounts at the DB level).
const path = require('path')
const { bootSeededPos } = require('../lib/boot')
const { artifactsDir, saveText, log, sleep } = require('../lib/util')

exports.run = async () => {
  const out = artifactsDir('order-discount')
  const { app, win } = await bootSeededPos()
  try {
    // Take Out avoids the table-number / phone validation.
    await win.getByText('Take Out').click()
    await sleep(400)

    // Add one Cheeseburger (300 DA) to the cart.
    await win.getByText('Cheeseburger').first().click()
    await sleep(1200)
    await win.screenshot({ path: path.join(out, '1-cart-with-discount.png') })

    // What the cart shows.
    const cartText = await win.evaluate(() => document.body.innerText)
    saveText(out, 'cart.txt', cartText)

    // Place the order.
    await win.getByText(/Place Order/).click()
    await sleep(2500)
    await win.screenshot({ path: path.join(out, '2-after-place.png') })

    // Verify the STORED order via the app's own IPC.
    const orders = await win.evaluate(() => window.api.orders.getToday())
    const order = (orders || [])[0]
    saveText(out, 'stored-order.json', JSON.stringify(order, null, 2))

    if (!order) throw new Error('no order was stored')
    const subtotal = Number(order.subtotal)
    const discount = Number(order.discount_amount)
    const total = Number(order.total)
    log(`stored order: subtotal=${subtotal} discount=${discount} total=${total}`)

    // 10% of a 300 DA cheeseburger = 30 discount, total 270.
    const ok = Math.abs(subtotal - 300) < 0.5 && discount >= 29 && discount <= 31 && Math.abs(total - 270) < 0.5
    if (!ok) {
      throw new Error(`discount NOT persisted correctly — expected subtotal 300 / discount 30 / total 270, got ${subtotal}/${discount}/${total}`)
    }
    log('✔ discount persisted correctly (subtotal 300, discount 30, total 270)')
    return { artifacts: out }
  } finally {
    await app.close().catch(() => {})
  }
}
