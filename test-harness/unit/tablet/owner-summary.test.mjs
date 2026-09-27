// v4: owner dashboard summary + Telegram message show options / combo picks / delivery fee, and
// remote (cloud) requests that cannot be accepted as sent get an actionable reason up front.
//
// Run with: ELECTRON_RUN_AS_NODE=1 node_modules/electron/dist/electron.exe --no-warnings
//   --test test-harness/unit/tablet/*.test.mjs

import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { cleanup, freshDb, load, ordersRepo, requestId, seedCatalog } from '../order-effects/catalog-harness.mjs'

const { formatItemsSummary, summaryLines, topLevelLineCount, modifierLabel } = await load('src/main/sync/order-summary.ts')
const { formatOrderNotification } = await load('src/main/telegram/order-message.ts')
const { precheckRemoteItems } = await load('src/main/sync/remote-order-precheck.ts')
const { createCombosService, createSoldOutService } = await load('src/main/services/combos.ts')
const { createModifiersService } = await load('src/main/services/modifiers.ts')

after(() => cleanup())

/** The owner dashboard's popular-items parser (admin/lib/owner-auth.ts), verbatim. */
function popularItems(summary) {
  const counts = new Map()
  for (const part of summary.split(', ')) {
    const match = part.match(/^(\d+)x\s+(.+)$/)
    if (match) counts.set(match[2], (counts.get(match[2]) || 0) + parseInt(match[1], 10))
  }
  return Object.fromEntries(counts)
}

function seededOrder() {
  const db = freshDb()
  const ids = seedCatalog(db)
  const combo = createCombosService(db).save(10, { slots: [
    { name: 'Burger', choices: [{ menu_item_id: 1, is_default: true }] },
    { name: 'Side', choices: [{ menu_item_id: 3, is_default: true }] },
    { name: 'Drink', choices: [{ menu_item_id: 2, is_default: true }] }
  ] })
  const [burger, side, drink] = combo.slots.map((slot) => slot.id)
  const created = ordersRepo.create({
    source: 'tablet', source_request_id: requestId(), order_type: 'local', table_number: '7',
    items: [
      { menu_item_id: 1, quantity: 2, modifiers: [{ option_id: ids.ketchup.id }, { option_id: ids.cheese.id, quantity: 2 }, { option_id: ids.onions.id }] },
      { menu_item_id: 10, quantity: 1, children: [
        { slot_id: burger, menu_item_id: 1, modifiers: [{ option_id: ids.algerian.id }, { option_id: ids.onions.id }] },
        { slot_id: side, menu_item_id: 3 }, { slot_id: drink, menu_item_id: 2 }
      ] },
      { menu_item_id: 2, quantity: 1 }
    ]
  })
  return { db, ids, order: ordersRepo.getById(created.id) }
}

test('owner items_summary names options, combo picks and the delivery fee without breaking the dashboard parser', () => {
  const { order } = seededOrder()
  const summary = formatItemsSummary(order.items, { lang: 'en', deliveryFee: 200 })
  assert.equal(summary,
    '2x Burger (Ketchup; +Cheese x2; NO Onions), 1x Menu Maxi [Burger (Algerian; NO Onions); Fries; Cola], 1x Cola, Delivery fee 200')
  assert.deepEqual(popularItems(summary), {
    'Burger (Ketchup; +Cheese x2; NO Onions)': 2,
    'Menu Maxi [Burger (Algerian; NO Onions); Fries; Cola]': 1,
    Cola: 1
  }, 'every part still parses; the fee is not counted as an item')
  assert.equal(topLevelLineCount(order.items), 3, 'combo picks are not extra items')
  assert.equal(formatItemsSummary(order.items, { lang: 'fr' }).startsWith('2x Burger (Ketchup; +Cheese x2; SANS Onions)'), true)
  assert.equal(formatItemsSummary([{ quantity: 1, menu_item_name: 'Plain' }], { deliveryFee: 0 }), '1x Plain', 'legacy rows unchanged')
  assert.equal(modifierLabel({ name: 'Mayo, extra', kind: 'light' }, 'ar'), 'قليل Mayo extra', 'never emits ", " inside a part')
})

test('Telegram message is HTML-escaped and lists options, picks, discount and delivery fee', () => {
  const { order } = seededOrder()
  const lines = summaryLines(order.items, 'en')
  assert.deepEqual(lines[1].picks.map((pick) => [pick.name, pick.options]), [['Burger', ['Algerian', 'NO Onions']], ['Fries', []], ['Cola', []]])
  const message = formatOrderNotification(
    { ...order, source: 'tablet', notes: 'Kids <3 & *no* spice', discount_amount: 50, delivery_fee: 150 },
    { currency: 'DA', lang: 'en', eventId: 9 }
  )
  assert.match(message, /<b>New Order #\d+<\/b> · tablet/)
  assert.match(message, /2x Burger\n {6}<i>Ketchup · \+Cheese x2 · NO Onions<\/i>/)
  assert.match(message, /↳ Burger <i>\(Algerian · NO Onions\)<\/i>/)
  assert.match(message, /🏷️ Discount: -50\.00 DA/)
  assert.match(message, /🛵 Delivery fee: 150\.00 DA/)
  assert.match(message, /📝 Kids &lt;3 &amp; \*no\* spice/)
  assert.doesNotMatch(message, /<3/)
})

test('remote precheck: a required group without a default blocks with an actionable reason; defaults pass', () => {
  const { db, ids } = seededOrder()
  // Burger's Sauce group has Ketchup as default → a plain remote Burger is fine.
  assert.deepEqual(precheckRemoteItems(db, [{ menuItemId: 1, quantity: 1 }], { lang: 'en' }), { local_issues: [], blocked_reason: null })

  const mods = createModifiersService(db)
  mods.updateOption(ids.ketchup.id, { is_default: false })
  const blocked = precheckRemoteItems(db, [{ menuItemId: 2, quantity: 1 }, { menuItemId: 1, quantity: 2, name: 'Burger' }],
    { lang: 'en', phone: '0550 12 34 56' })
  assert.equal(blocked.local_issues.length, 1)
  assert.deepEqual({ ...blocked.local_issues[0], message: undefined },
    { line: 1, menu_item_id: 1, item: 'Burger', code: 'choice_required', group: 'Sauce', message: undefined })
  assert.equal(blocked.blocked_reason,
    '"Burger" needs a choice in "Sauce" (required, no default option), which the online order cannot send. Call the customer (0550 12 34 56) and ring the order up at the POS, or give "Sauce" a default option in Menu › Options.')

  // The same rule reaches combo picks, and sold-out / deleted items are reported too.
  const combo = precheckRemoteItems(db, [{ menuItemId: 10, quantity: 1 }], { lang: 'fr' })
  assert.equal(combo.local_issues[0].code, 'choice_required')
  assert.match(combo.blocked_reason, /« Menu Maxi › Burger » exige un choix dans « Sauce »/)
  createSoldOutService(db).set(2, true)
  const soldOut = precheckRemoteItems(db, [{ menuItemId: 2, quantity: 1 }, { menuItemId: 99, quantity: 1, name: 'Ghost' }], { lang: 'en' })
  assert.deepEqual(soldOut.local_issues.map((issue) => issue.code), ['item_sold_out', 'item_unavailable'])
  assert.match(soldOut.blocked_reason, /^"Cola" is sold out\. Call the customer to offer something else, or reject the request\. \(\+1 more\)$/)
})
