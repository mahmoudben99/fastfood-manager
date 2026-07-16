// Regression: editing an existing order must preserve its sale-time line identity,
// flat discount and ingredient deduction snapshot.
const { bootSeededPos } = require('../lib/boot')
const { artifactsDir, saveText, log } = require('../lib/util')

const closeTo = (actual, expected, tolerance = 0.000001) =>
  Math.abs(Number(actual) - Number(expected)) <= tolerance

exports.run = async () => {
  const out = artifactsDir('order-history-integrity')
  const { app, win } = await bootSeededPos()
  try {
    const seeded = await win.evaluate(async () => {
      const categories = await window.api.categories.getAll()
      const stock = await window.api.stock.create({
        name: 'Edit Snapshot Beef',
        unit_type: 'kg',
        quantity: 10,
        price_per_unit: 500,
        alert_threshold: 0
      })
      const menu = await window.api.menu.create({
        name: 'Edit Snapshot Burger',
        price: 300,
        category_id: categories[0].id,
        ingredients: [{ stock_item_id: stock.id, quantity: 100, unit: 'g' }]
      })
      const order = await window.api.orders.create({
        order_type: 'takeout',
        discount_amount: 30,
        discount_details: 'Sale-time discount: -30',
        items: [{ menu_item_id: menu.id, quantity: 1, unit_price: 300 }]
      })
      return {
        stock,
        menu,
        order,
        stockAfterCreate: await window.api.stock.getById(stock.id)
      }
    })
    saveText(out, '1-seeded.json', JSON.stringify(seeded, null, 2))

    if (!closeTo(seeded.stockAfterCreate.quantity, 9.9)) {
      throw new Error('seed order did not deduct the expected 0.1 kg')
    }

    // Change today's recipe/cost and promotions after the sale. A phone-only correction must
    // not use any of them.
    await win.evaluate(async ({ menuId, stockId }) => {
      await window.api.menu.update(menuId, {
        ingredients: [{ stock_item_id: stockId, quantity: 250, unit: 'g' }]
      })
      await window.api.stock.update(stockId, { price_per_unit: 800 })
      const promos = await window.api.promotions.getAll()
      if (promos[0]) {
        await window.api.promotions.update(promos[0].id, { discount_value: 50 })
      }
    }, { menuId: seeded.menu.id, stockId: seeded.stock.id })

    const headerEdit = await win.evaluate(async (order) => {
      const updated = await window.api.orders.updateItems(
        order.id,
        order.items.map((line) => ({
          order_item_id: line.id,
          menu_item_id: line.menu_item_id,
          quantity: line.quantity,
          unit_price: line.unit_price,
          notes: line.notes,
          worker_id: line.worker_id
        })),
        undefined,
        undefined,
        { customer_phone: '0550 12 34 56' }
      )
      return {
        order: updated,
        stock: await window.api.stock.getById(order.stockId)
      }
    }, { ...seeded.order, stockId: seeded.stock.id })
    saveText(out, '2-header-edit.json', JSON.stringify(headerEdit, null, 2))

    if (!closeTo(headerEdit.stock.quantity, 9.9)) {
      throw new Error('header-only edit changed stock: expected 9.9, got ' + headerEdit.stock.quantity)
    }
    if (headerEdit.order.items[0].id !== seeded.order.items[0].id) {
      throw new Error('header-only edit replaced the historical order line')
    }
    if (!closeTo(headerEdit.order.discount_amount, 30) || !closeTo(headerEdit.order.total, 270)) {
      throw new Error('header-only edit repriced the historical promotion')
    }

    // Increasing quantity must deduct one more copy of the ORIGINAL 0.1 kg snapshot,
    // not today's 0.25 kg recipe.
    const quantityEdit = await win.evaluate(async ({ orderId, lineId, menuId, stockId }) => {
      const updated = await window.api.orders.updateItems(
        orderId,
        [{
          order_item_id: lineId,
          menu_item_id: menuId,
          quantity: 2,
          unit_price: 300
        }]
      )
      return {
        order: updated,
        stock: await window.api.stock.getById(stockId)
      }
    }, {
      orderId: seeded.order.id,
      lineId: seeded.order.items[0].id,
      menuId: seeded.menu.id,
      stockId: seeded.stock.id
    })
    saveText(out, '3-quantity-edit.json', JSON.stringify(quantityEdit, null, 2))

    if (!closeTo(quantityEdit.stock.quantity, 9.8)) {
      throw new Error("quantity edit used today's recipe: expected 9.8 kg, got " + quantityEdit.stock.quantity)
    }
    if (!closeTo(quantityEdit.order.subtotal, 600) ||
        !closeTo(quantityEdit.order.discount_amount, 30) ||
        !closeTo(quantityEdit.order.total, 570)) {
      throw new Error('quantity edit did not preserve the sale-time flat discount')
    }

    const afterCancel = await win.evaluate(async ({ orderId, stockId }) => {
      await window.api.orders.cancel(orderId)
      return window.api.stock.getById(stockId)
    }, { orderId: seeded.order.id, stockId: seeded.stock.id })

    if (!closeTo(afterCancel.quantity, 10)) {
      throw new Error('cancel did not restore the edited snapshot exactly: ' + afterCancel.quantity)
    }

    log('✔ header edit preserved line/stock/discount; quantity delta used original 0.1 kg snapshot')
    return { artifacts: out }
  } finally {
    await app.close().catch(() => {})
  }
}
