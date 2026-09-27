// v4 time-based availability: windows (Ramadan dates, overnight, weekdays), rule validation,
// warn vs block enforcement in order-service, menu-read flags.
// Run: ELECTRON_RUN_AS_NODE=1 node_modules/electron/dist/electron.exe --no-warnings --test test-harness/unit/fiscal/*.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { availability, createOrderService, decorateMenuItems, freshDb, seedMenu, setSetting, sharedAvailability, tryOrder } from './_fiscal.mjs'

const { ruleMatches, rulesAllow, algiersClock, ruleProblem } = sharedAvailability
/** Algiers wall-clock time → Date (Algeria is UTC+1, no DST). */
const at = (local) => new Date(`${local}:00+01:00`)
const rule = (extra) => ({ label: null, weekdays: [], start_time: null, end_time: null, start_date: null, end_date: null, is_active: true, ...extra })
const matches = (r, local) => ruleMatches(r, algiersClock(at(local)))

test('Ramadan iftar window: date range + overnight 17:30 → 02:00, checked on the evening it started', () => {
  const ramadan = rule({ start_date: '2026-02-18', end_date: '2026-03-19', start_time: '17:30', end_time: '02:00' })
  assert.equal(matches(ramadan, '2026-03-01T18:00'), true)
  assert.equal(matches(ramadan, '2026-03-01T17:29'), false)
  assert.equal(matches(ramadan, '2026-03-01T12:00'), false)
  assert.equal(matches(ramadan, '2026-03-02T01:59'), true, 'after midnight belongs to the previous evening')
  assert.equal(matches(ramadan, '2026-03-02T02:00'), false, 'end is exclusive')
  assert.equal(matches(ramadan, '2026-03-20T01:00'), true, 'the last evening still runs past midnight')
  assert.equal(matches(ramadan, '2026-03-20T18:00'), false, 'the day after the range')
  assert.equal(matches(ramadan, '2026-02-18T01:00'), false, 'the early morning of the first day belongs to the eve (out of range)')
  assert.equal(matches(ramadan, '2026-02-18T17:30'), true)
})

test('weekdays, overnight weekday windows, all-day and union of rules', () => {
  // 2026-09-25 is a Friday (weekday 5).
  const fridayNight = rule({ weekdays: [5], start_time: '20:00', end_time: '02:00' })
  assert.equal(matches(fridayNight, '2026-09-25T21:00'), true)
  assert.equal(matches(fridayNight, '2026-09-26T01:30'), true, 'Saturday 01:30 is still Friday night')
  assert.equal(matches(fridayNight, '2026-09-26T21:00'), false, 'Saturday evening')
  assert.equal(matches(fridayNight, '2026-09-25T01:00'), false, 'Friday early morning belongs to Thursday')
  assert.equal(matches(fridayNight, '2026-09-25T19:59'), false)
  assert.equal(matches(rule({ start_time: '10:00', end_time: '10:00', weekdays: [0] }), '2026-09-27T03:00'), true, 'equal times = all day (Sunday)')
  assert.equal(matches(rule({ start_time: '22:00' }), '2026-09-27T23:59'), true, 'no end = until midnight')
  assert.equal(matches(rule({ is_active: false }), '2026-09-27T12:00'), false)

  const lunch = rule({ weekdays: [0, 1, 2, 3, 4], start_time: '11:00', end_time: '15:00' })
  const dinner = rule({ start_time: '18:00', end_time: '23:00' })
  assert.equal(rulesAllow([lunch, dinner], at('2026-09-27T12:00')), true)
  assert.equal(rulesAllow([lunch, dinner], at('2026-09-27T16:00')), false)
  assert.equal(rulesAllow([lunch, dinner], at('2026-09-25T12:00')), false, 'no lunch on Friday')
  assert.equal(rulesAllow([lunch, dinner], at('2026-09-25T19:00')), true)
  assert.equal(rulesAllow([], at('2026-09-25T04:00')), true, 'no rule = always available')
  assert.equal(rulesAllow([rule({ is_active: false, start_time: '01:00', end_time: '02:00' })], at('2026-09-25T04:00')), true)

  assert.equal(ruleProblem(rule({ start_time: '25:00' })), 'bad_time')
  assert.equal(ruleProblem(rule({ start_date: '2026-13-01' })), 'bad_date')
  assert.equal(ruleProblem(rule({ start_date: '2026-03-19', end_date: '2026-02-18' })), 'date_order')
  assert.equal(ruleProblem(rule({ weekdays: [7] })), 'bad_weekday')
  assert.equal(ruleProblem(rule({ start_time: '09:05', end_time: '23:59', weekdays: [1, 2] })), null)
})

test('rules are stored per item / category, validated, and flagged on menu reads', () => {
  const { db, cleanup } = freshDb()
  try {
    seedMenu(db)
    const saved = availability.setRules(db, 'menu_item', 1, [{ label: 'Lunch', weekdays: [0, 1, 2, 3, 4], start_time: '11:00', end_time: '15:00' }])
    assert.deepEqual(saved.map((r) => [r.label, r.weekdays, r.start_time, r.end_time, r.is_active]), [['Lunch', [0, 1, 2, 3, 4], '11:00', '15:00', true]])
    assert.throws(() => availability.setRules(db, 'menu_item', 1, [{ start_time: '9h' }]), /AVAILABILITY_BAD_TIME/)
    assert.throws(() => availability.setRules(db, 'category', 99, []), /AVAILABILITY_NOT_FOUND/)
    assert.equal(availability.getRules(db, 'menu_item', 1).length, 1, 'a refused save keeps the old rules')
    availability.setRules(db, 'category', 2, [{ start_time: '18:00', end_time: '02:00' }])

    const menu = db.prepare('SELECT * FROM menu_items ORDER BY id').all()
    const flags = (local) => decorateMenuItems(db, menu.map((m) => ({ ...m })), at(local)).map((m) => m.available_now)
    assert.deepEqual(flags('2026-09-27T12:00'), [1, 1, 0], 'Sunday noon: lunch burger yes, drinks (evening category) no')
    assert.deepEqual(flags('2026-09-27T19:00'), [0, 1, 1])
    assert.deepEqual(flags('2026-09-28T01:00'), [0, 1, 1], 'drinks run past midnight')
    const state = availability.availabilityState(db, 'menu_item', 1, at('2026-09-27T16:00'))
    assert.deepEqual([state.available_now, state.enforce, state.rules.length], [false, 'warn', 1])
    availability.setRules(db, 'menu_item', 1, [])
    assert.equal(availability.availabilityState(db, 'menu_item', 1, at('2026-09-27T16:00')).available_now, true)
  } finally {
    cleanup()
  }
})

test('order-service: warn mode sells, block mode refuses (translated), edits cannot add a blocked item', () => {
  const { db, cleanup } = freshDb()
  try {
    seedMenu(db)
    availability.setRules(db, 'menu_item', 1, [{ weekdays: [0, 1, 2, 3, 4], start_time: '11:00', end_time: '15:00' }])
    const afternoon = createOrderService({ db, now: () => at('2026-09-27T16:00') })
    const noon = createOrderService({ db, now: () => at('2026-09-27T12:00') })
    assert.equal(tryOrder(afternoon, { lines: [{ menuItemId: 1, quantity: 1 }] }).ok, true, "'warn' never refuses")

    availability.setEnforce(db, 'block')
    assert.throws(() => availability.setEnforce(db, 'maybe'), /AVAILABILITY_INVALID_MODE/)
    setSetting(db, 'language', 'fr')
    const refused = tryOrder(afternoon, { lines: [{ menuItemId: 2, quantity: 1 }, { menuItemId: 1, quantity: 1 }] })
    assert.deepEqual([refused.ok, refused.code, refused.lineIndex], [false, 'inactive_item', 1])
    assert.equal(refused.message, "« Burger » n'est pas disponible à cette heure")
    setSetting(db, 'language', 'ar')
    assert.equal(tryOrder(afternoon, { lines: [{ menuItemId: 1, quantity: 1 }] }).message, '«برغر» غير متوفر في هذا الوقت')

    const lunch = tryOrder(noon, { lines: [{ menuItemId: 1, quantity: 1 }] })
    assert.equal(lunch.ok, true)
    const burgerLine = db.prepare('SELECT id FROM order_items WHERE order_id = ?').get(lunch.orderId)
    const later = afternoon.updateOrderLines({
      orderId: lunch.orderId,
      lines: [{ orderItemId: burgerLine.id, menuItemId: 1, quantity: 2 }, { menuItemId: 3, quantity: 1 }]
    })
    assert.equal(later.ok, true, 'an existing line may still change after hours')
    const blocked = afternoon.updateOrderLines({
      orderId: lunch.orderId,
      lines: [{ orderItemId: burgerLine.id, menuItemId: 1, quantity: 2 }, { menuItemId: 1, quantity: 1 }]
    })
    assert.deepEqual([blocked.ok, blocked.code], [false, 'inactive_item'])
  } finally {
    cleanup()
  }
})
