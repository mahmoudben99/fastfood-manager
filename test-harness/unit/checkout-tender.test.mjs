import assert from 'node:assert/strict'
import test from 'node:test'
import { register, createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

// v4 checkout: tender / change / split math, numpad entry, drawer count helpers (pure, plain node).
const require = createRequire(import.meta.url)
const esbuildEntry = pathToFileURL(require.resolve('esbuild')).href
const loaderSrc = `
import { existsSync, statSync, readFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'
let esbuild
export async function initialize(data) { esbuild = await import(data.esbuildEntry) }
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('.') && context.parentURL) {
    try { return await nextResolve(specifier, context) }
    catch (err) {
      const base = path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier)
      for (const cand of [base + '.ts', path.join(base, 'index.ts')]) {
        if (existsSync(cand) && statSync(cand).isFile()) return nextResolve(pathToFileURL(cand).href, context)
      }
      throw err
    }
  }
  return nextResolve(specifier, context)
}
export async function load(url, context, nextLoad) {
  if (url.endsWith('.ts')) {
    const source = readFileSync(fileURLToPath(url), 'utf8')
    const result = esbuild.transformSync(source, { loader: 'ts', format: 'esm', target: 'node20' })
    return { format: 'module', source: result.code, shortCircuit: true }
  }
  return nextLoad(url, context)
}
`
register('data:text/javascript,' + encodeURIComponent(loaderSrc), import.meta.url, { data: { esbuildEntry } })

const {
  applyKey, belowMinimum, buildPayments, commitPart, countedTotal, elapsedLabel, entryValue, keyFromKeyboard,
  nonZeroCounts, overShortTone, partialCashAmount, quickTenders, tenderView, withoutUndefined
} = await import('../../src/renderer/src/components/checkout/tender.ts')

const base = (over = {}) => ({ total: 1235, lines: [], method: 'cash', entry: '', reference: '', step: 0, ...over })

test('numpad entry: digits, 00, backspace, clear, no leading zeros, max length', () => {
  let e = ''
  e = applyKey(e, '0'); assert.equal(e, '')
  e = applyKey(e, '00'); assert.equal(e, '')
  e = applyKey(e, '2'); e = applyKey(e, '00'); assert.equal(e, '200')
  e = applyKey(e, '5'); assert.equal(e, '2005')
  e = applyKey(e, 'back'); assert.equal(e, '200')
  assert.equal(applyKey('1234567', '8'), '1234567', 'max 7 digits')
  assert.equal(applyKey('123456', '00'), '123456', '00 would overflow')
  assert.equal(applyKey('55', 'clear'), '')
  assert.equal(applyKey('55', 'x'), '55', 'unknown key ignored')
  assert.equal(entryValue(''), null)
  assert.equal(entryValue('0150'), 150)
  assert.equal(keyFromKeyboard('7'), '7')
  assert.equal(keyFromKeyboard('Backspace'), 'back')
  assert.equal(keyFromKeyboard('Delete'), 'clear')
  assert.equal(keyFromKeyboard('a'), null)
})

test('quick tenders: next 100 / notes above the amount due, unique, ascending', () => {
  assert.deepEqual(quickTenders(1235), [1300, 1500, 2000, 3000])
  assert.deepEqual(quickTenders(150), [200, 500, 1000, 2000])
  assert.deepEqual(quickTenders(1300), [1500, 2000, 3000, 4000])
  assert.deepEqual(quickTenders(2000), [2500, 3000, 4000])
  assert.deepEqual(quickTenders(380, 3), [400, 500, 1000])
  for (const due of [1, 99, 450, 999, 1001, 4870, 12345]) {
    const list = quickTenders(due)
    assert.ok(list.every((v) => v > due), `all above ${due}`)
    assert.deepEqual([...list].sort((a, b) => a - b), list)
    assert.equal(new Set(list).size, list.length)
  }
})

test('cash: empty entry = exact, change, short, rounding', () => {
  const exact = tenderView(base())
  assert.equal(exact.current, 1235)
  assert.equal(exact.complete, true)
  assert.equal(exact.change, 0)
  assert.deepEqual(buildPayments(base()), [{ method: 'cash', amount: 1235, tendered: 1235 }])

  const given = tenderView(base({ entry: '2000' }))
  assert.equal(given.change, 765)
  assert.deepEqual(buildPayments(base({ entry: '2000' })), [{ method: 'cash', amount: 1235, tendered: 2000 }])

  const short = tenderView(base({ entry: '1000' }))
  assert.equal(short.complete, false)
  assert.equal(short.short, 235)
  assert.equal(short.canSplit, true)
  assert.equal(buildPayments(base({ entry: '1000' })), null)

  // Rounding to 10 DA: 1235 → 1240 owed in cash; the payment line keeps the order amount.
  const rounded = tenderView(base({ step: 10 }))
  assert.equal(rounded.due, 1240)
  assert.equal(rounded.rounding, 5)
  assert.equal(rounded.current, 1240)
  assert.deepEqual(buildPayments(base({ step: 10, entry: '1500' })), [{ method: 'cash', amount: 1235, tendered: 1500 }])
  assert.equal(tenderView(base({ step: 10, entry: '1500' })).change, 260)
  assert.equal(tenderView(base({ step: 5, total: 1232 })).due, 1230, 'rounds down too')
})

test('split: card part then cash for the rest; card cannot exceed the balance', () => {
  let s = base({ method: 'cib', entry: '1000', reference: ' 778899 ' })
  assert.equal(tenderView(s).canSplit, true)
  assert.equal(tenderView(s).complete, false)
  s = commitPart(s)
  assert.deepEqual(s.lines, [{ method: 'cib', amount: 1000, reference: '778899' }])
  assert.equal(s.entry, '')
  s = { ...s, method: 'cash', entry: '500' }
  const view = tenderView(s)
  assert.equal(view.balance, 235)
  assert.equal(view.change, 265)
  assert.deepEqual(buildPayments(s), [
    { method: 'cib', amount: 1000, reference: '778899' },
    { method: 'cash', amount: 235, tendered: 500 }
  ])

  const over = tenderView(base({ method: 'edahabia', entry: '5000' }))
  assert.equal(over.overBalance, true)
  assert.equal(over.complete, false)
  assert.equal(over.canSplit, false)

  const card = base({ method: 'baridipay', reference: 'QR-1' })
  assert.deepEqual(buildPayments(card), [{ method: 'baridipay', amount: 1235, reference: 'QR-1' }])
})

test('split: partial cash is kept on the rounding grid; fully paid lines need no current entry', () => {
  assert.equal(partialCashAmount(1234, 5), 1230)
  assert.equal(partialCashAmount(999, 0), 999)
  let s = commitPart(base({ step: 10, entry: '1000' }))
  assert.deepEqual(s.lines, [{ method: 'cash', amount: 1000, tendered: 1000 }])
  s = commitPart({ ...s, method: 'cib', entry: '235' })
  assert.deepEqual(s.lines.map((l) => l.amount), [1000], 'a card line equal to the balance is a final line, not a part')
  assert.deepEqual(buildPayments({ ...s, method: 'cib', entry: '235' }), [
    { method: 'cash', amount: 1000, tendered: 1000 }, { method: 'cib', amount: 235 }
  ])
  const done = { ...base(), lines: [{ method: 'cib', amount: 1235 }] }
  assert.equal(tenderView(done).balance, 0)
  assert.deepEqual(buildPayments(done), [{ method: 'cib', amount: 1235 }])
  assert.equal(commitPart(base({ entry: '' })).lines.length, 0, 'nothing to split')
  assert.deepEqual(buildPayments(base({ total: 0 })), [], 'free order')
})

test('drawer count, over/short tone, elapsed time, delivery minimum', () => {
  assert.equal(countedTotal({ n2000: 3, n500: 1, c100: 4, c5: 2, c10: -1, n1000: 1.5 }), 6000 + 500 + 400 + 10)
  assert.deepEqual(nonZeroCounts({ n2000: 0, n200: 2, c200: 1, c50: 'x' }), { n200: 2, c200: 1 })
  assert.equal(overShortTone(0), 'balanced')
  assert.equal(overShortTone(null), 'balanced')
  assert.equal(overShortTone(200), 'over')
  assert.equal(overShortTone(-50), 'short')
  const now = new Date('2026-09-27T12:30:00Z')
  assert.equal(elapsedLabel('2026-09-27T10:25:00Z', now), '2h 05m')
  assert.equal(elapsedLabel('2026-09-27T12:10:00Z', now), '20m')
  assert.equal(elapsedLabel('2026-09-27T13:10:00Z', now), '0m', 'clock skew never negative')
  assert.equal(elapsedLabel('nope', now), '')
  assert.equal(belowMinimum(750, 1000), 250)
  assert.equal(belowMinimum(1200, 1000), 0)
  assert.equal(belowMinimum(10, null), 0)
  assert.deepEqual(withoutUndefined({ a: 1, b: undefined, c: null }), { a: 1, c: null })
})
