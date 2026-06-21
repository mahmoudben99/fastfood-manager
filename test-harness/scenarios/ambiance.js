// Verifies the Ambiance screen surfaces the 4-digit TV pairing code (the UI I added).
const path = require('path')
const { bootSeededPos } = require('../lib/boot')
const { artifactsDir, saveText, log, sleep } = require('../lib/util')

exports.run = async () => {
  const out = artifactsDir('ambiance')
  const { app, win } = await bootSeededPos()
  try {
    const { code } = await win.evaluate(() => window.api.tablet.getPairingCode())
    log('expected pairing code on screen:', code)

    await win.evaluate(() => { window.location.hash = '#/admin/ambiance' })
    await sleep(1500)
    const pw = win.locator('input[type="password"]')
    if (await pw.count()) {
      await pw.first().fill('1234')
      await pw.first().press('Enter')
      await sleep(2500)
    }
    await win.screenshot({ path: path.join(out, 'ambiance.png') })
    const text = await win.evaluate(() => document.body.innerText)
    saveText(out, 'ambiance.txt', text)

    if (!text.includes(code)) {
      throw new Error(`Ambiance screen did not show the pairing code ${code}`)
    }
    log(`✔ Ambiance screen shows the pairing code ${code}`)
    return { artifacts: out }
  } finally {
    await app.close().catch(() => {})
  }
}
