// Verifies the i18n work: switch the app to Arabic then French and confirm a previously
// English-only admin screen (Promotions) actually renders translated.
const path = require('path')
const { bootSeededPos } = require('../lib/boot')
const { artifactsDir, saveText, log, sleep } = require('../lib/util')

const LANGS = [
  { code: 'ar', expect: 'العروض والولاء', label: 'Arabic' },
  { code: 'fr', expect: 'fidélité', label: 'French' }
]

exports.run = async () => {
  const out = artifactsDir('i18n')
  const { app, win } = await bootSeededPos()
  try {
    const results = []
    for (const { code, expect, label } of LANGS) {
      await win.evaluate((l) => window.api.settings.set('language', l), code)
      const base = win.url().split('#')[0]
      // FULL reload so loadSettings re-runs and i18n.changeLanguage fires (a hash-only change
      // wouldn't reload). Then route to the admin page; i18n is already switched.
      await win.goto(base, { waitUntil: 'domcontentloaded' })
      await sleep(2500)
      await win.evaluate(() => { window.location.hash = '#/admin/promotions' })
      await sleep(1800)

      // Pass the admin PasswordGate (seeded password 1234).
      const pw = win.locator('input[type="password"]')
      if (await pw.count()) {
        await pw.first().fill('1234')
        await pw.first().press('Enter')
        await sleep(2500)
      }

      await win.screenshot({ path: path.join(out, `promotions-${code}.png`) })
      const text = await win.evaluate(() => document.body.innerText)
      saveText(out, `promotions-${code}.txt`, text)

      const ok = text.includes(expect)
      results.push(`${label}: ${ok ? 'OK' : 'MISSING'} ("${expect}")`)
      log(`${label} Promotions screen: ${ok ? '✔ translated' : '✗ NOT translated — missing: ' + expect}`)
    }
    saveText(out, 'results.txt', results.join('\n'))
    if (results.some((r) => r.includes('MISSING'))) {
      throw new Error('i18n: a screen did not translate — ' + results.join(' | '))
    }
    return { artifacts: out }
  } finally {
    await app.close().catch(() => {})
  }
}
