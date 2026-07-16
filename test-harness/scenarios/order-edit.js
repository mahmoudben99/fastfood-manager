// Verifies the edit-path fix: editing an order must NOT wipe its discount.
// Creates an order with a discount, then calls updateItems WITHOUT a new discount (as an
// admin edit does) and confirms the stored discount/total are preserved (not reset to full).
const path = require('path')
const { bootSeededPos } = require('../lib/boot')
const { artifactsDir, saveText, log } = require('../lib/util')

exports.run = async () => {
  const out = artifactsDir('order-edit')
  const { app, win } = await bootSeededPos()
  try {
    const menu = await win.evaluate(() => window.api.menu.getAll())
    const item = (menu || []).find((m) => /cheese/i.test(m.name)) || (menu || [])[0]

    // Create a 300 DA order with a 30 DA discount (total 270).
    const created = await win.evaluate(
      (mid) =>
        window.api.orders.create({
          order_type: 'takeout',
          discount_amount: 30,
          discount_details: 'Test 10% Off: -30',
          items: [{ menu_item_id: mid, quantity: 1 }]
        }),
      item.id
    )
    saveText(out, '1-created.json', JSON.stringify(created, null, 2))
    log(`created: subtotal=${created.subtotal} discount=${created.discount_amount} total=${created.total}`)

    // Edit WITHOUT passing a discount (the case that used to silently wipe it to 0).
    const edited = await win.evaluate(
      (a) => window.api.orders.updateItems(a.id, [{
        order_item_id: a.lineId,
        menu_item_id: a.mid,
        quantity: 1,
        unit_price: 300
      }]),
      { id: created.id, lineId: created.items[0].id, mid: item.id }
    )
    saveText(out, '2-edited.json', JSON.stringify(edited, null, 2))
    const subtotal = Number(edited.subtotal)
    const discount = Number(edited.discount_amount)
    const total = Number(edited.total)
    log(`after edit: subtotal=${subtotal} discount=${discount} total=${total}`)

    if (!(Math.abs(subtotal - 300) < 0.5 && discount >= 29 && discount <= 31 && Math.abs(total - 270) < 0.5)) {
      throw new Error(`edit WIPED the discount — expected 300/30/270, got ${subtotal}/${discount}/${total}`)
    }
    log('✔ edit preserved the discount (subtotal 300, discount 30, total 270)')
    return { artifacts: out }
  } finally {
    await app.close().catch(() => {})
  }
}
