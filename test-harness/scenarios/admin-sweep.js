// Broad smoke sweep: visit every admin page and confirm each renders without crashing
// (catches error-boundary blanks / i18n regressions across the whole admin surface).
const path = require('path')
const { bootSeededPos } = require('../lib/boot')
const { artifactsDir, saveText, log, sleep } = require('../lib/util')

const PAGES = ['menu', 'stock', 'workers', 'orders-history', 'analytics', 'promotions', 'ambiance', 'settings']

exports.run = async () => {
  const out = artifactsDir('admin-sweep')
  const { app, win } = await bootSeededPos()
  try {
    // Unlock the admin once.
    await win.evaluate(() => { window.location.hash = '#/admin/menu' })
    await sleep(1500)
    const pw = win.locator('input[type="password"]')
    if (await pw.count()) {
      await pw.first().fill('1234')
      await pw.first().press('Enter')
      await sleep(2200)
    }

    const results = []
    for (const p of PAGES) {
      log(`-> ${p}`)
      try {
        await win.evaluate((pg) => { window.location.hash = '#/admin/' + pg }, p)
        await sleep(1800)
        await win.screenshot({ path: path.join(out, `${p}.png`), timeout: 8000 })
        const txt = (await win.evaluate(() => document.body.innerText)) || ''
        const crashed = /something went wrong|render error|cannot read|undefined is not/i.test(txt) || txt.trim().length < 25
        results.push(`${p}: ${crashed ? 'FAIL' : 'ok'} (${txt.trim().length} chars)`)
        log(`${p}: ${crashed ? '✗ looks broken' : '✔ renders'} (${txt.trim().length} chars)`)
      } catch (e) {
        results.push(`${p}: ERROR ${e.message.split('\n')[0]}`)
        log(`${p}: ✗ ${e.message.split('\n')[0]}`)
      }
    }
    saveText(out, 'results.txt', results.join('\n'))
    const fails = results.filter((r) => r.includes('FAIL') || r.includes('ERROR'))
    if (fails.length) throw new Error('admin pages failed to render: ' + fails.join(', '))
    return { artifacts: out }
  } finally {
    await app.close().catch(() => {})
  }
}
