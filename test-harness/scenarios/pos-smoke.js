// POS smoke test: launch the real Electron app (isolated DB), wait for the main window,
// screenshot it. Proves the harness can drive the POS GUI without touching real data.
const path = require('path')
const os = require('os')
const fs = require('fs')
const { launchPos, mainWindow } = require('../lib/pos')
const { artifactsDir, saveText, log, sleep } = require('../lib/util')

exports.run = async () => {
  const out = artifactsDir('pos-smoke')
  const userData = path.join(os.tmpdir(), 'ffm-test-userdata')
  fs.rmSync(userData, { recursive: true, force: true }) // clean DB every run

  log('launching POS (isolated userData):', userData)
  const app = await launchPos({ userData })
  try {
    const win = await mainWindow(app, { timeoutMs: 45000 })
    await sleep(3500) // let the route settle
    const shot = path.join(out, 'pos.png')
    await win.screenshot({ path: shot })
    const title = await win.title().catch(() => '')
    const url = (() => { try { return win.url() } catch (e) { return '' } })()
    // Grab a little visible text so we know which screen we landed on.
    const bodyText = await win.evaluate(() => document.body.innerText.slice(0, 600)).catch(() => '')
    saveText(out, 'screen.txt', `title: ${title}\nurl: ${url}\n\n${bodyText}`)
    log('POS title:', title)
    log('landed on:', url.split('/').pop())
    log('screenshot:', shot)
    return { artifacts: out }
  } finally {
    await app.close().catch(() => {})
  }
}
