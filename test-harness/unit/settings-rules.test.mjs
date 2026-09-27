import assert from 'node:assert/strict'
import test from 'node:test'
import {
  DEFAULT_CURRENCY_SYMBOL,
  healBlockIds,
  migrateLegacySocialRows,
  normalizeOrderAlertMinutes,
  orderAlertMinutesOrDefault,
  parseSocialMedia,
  serializeSocialMedia
} from '../../src/shared/settings-rules.ts'

test('order alert minutes: only whole numbers >= 1 are accepted', () => {
  assert.equal(normalizeOrderAlertMinutes('20'), 20)
  assert.equal(normalizeOrderAlertMinutes(' 5 '), 5)
  assert.equal(normalizeOrderAlertMinutes('7.9'), 7)
  assert.equal(normalizeOrderAlertMinutes('0'), null)
  assert.equal(normalizeOrderAlertMinutes('-5'), null)
  assert.equal(normalizeOrderAlertMinutes(''), null)
  assert.equal(normalizeOrderAlertMinutes('abc'), null)
  assert.equal(normalizeOrderAlertMinutes(null), null)
  assert.equal(normalizeOrderAlertMinutes('99999'), 1440)
  // Read side never yields an unusable value.
  assert.equal(orderAlertMinutesOrDefault('0'), 20)
  assert.equal(orderAlertMinutesOrDefault(undefined), 20)
  assert.equal(orderAlertMinutesOrDefault('15'), 15)
})

test('currency symbol fallback is DA', () => {
  assert.equal(DEFAULT_CURRENCY_SYMBOL, 'DA')
})

test('social media JSON round-trips in the format the printer reads', () => {
  const json = serializeSocialMedia([
    { platform: 'instagram', handle: ' @burger ' },
    { platform: 'facebook', handle: '   ' },
    { platform: '', handle: 'x' },
    null
  ])
  assert.equal(json, '[{"platform":"instagram","handle":"@burger"}]')
  assert.deepEqual(parseSocialMedia(json), [{ platform: 'instagram', handle: '@burger' }])
  assert.deepEqual(parseSocialMedia('not json'), [])
  assert.deepEqual(parseSocialMedia(''), [])
  assert.deepEqual(parseSocialMedia('{"a":1}'), [])
})

test('legacy social_media table rows migrate only when the setting is empty', () => {
  const rows = [
    { id: 1, platform: 'tiktok', handle: '@tt', created_at: 'x' },
    { id: 2, platform: 'whatsapp', handle: '' }
  ]
  assert.equal(migrateLegacySocialRows(undefined, rows), '[{"platform":"tiktok","handle":"@tt"}]')
  assert.equal(migrateLegacySocialRows('[]', rows), '[{"platform":"tiktok","handle":"@tt"}]')
  assert.equal(migrateLegacySocialRows('[{"platform":"facebook","handle":"fb"}]', rows), null)
  assert.equal(migrateLegacySocialRows('', []), null)
})

test('duplicate or missing block ids are re-assigned, good ids are kept', () => {
  let n = 0
  const makeId = () => `new-${++n}`
  const healed = healBlockIds(
    [
      { id: '101', type: 'logo' },
      { id: '101', type: 'divider' },
      { type: 'total' },
      { id: '7', type: 'custom_text' }
    ],
    makeId
  )
  assert.deepEqual(healed.map((b) => b.id), ['101', 'new-1', 'new-2', '7'])
  assert.equal(new Set(healed.map((b) => b.id)).size, healed.length)
  assert.equal(healed[1].type, 'divider')
})
