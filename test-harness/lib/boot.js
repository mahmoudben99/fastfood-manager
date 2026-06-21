// Boot a POS test instance straight into the working Order screen (clean DB, activated,
// set up, seeded menu + promo). Reused by every deep POS scenario.
const path = require('path')
const os = require('os')
const fs = require('fs')
const { launchPos, mainWindow } = require('./pos')
const { seedViaIpc } = require('./seed')
const { sleep } = require('./util')

async function bootSeededPos() {
  const userData = path.join(os.tmpdir(), 'ffm-test-userdata')
  fs.rmSync(userData, { recursive: true, force: true })

  const app = await launchPos({ userData })
  let win = await mainWindow(app, { timeoutMs: 45000 })
  await sleep(2500)

  const seed = await seedViaIpc(win)

  // Navigate to the bare URL (drops the #/activate hash) so the activated→/orders redirect runs.
  const base = win.url().split('#')[0]
  await win.goto(base, { waitUntil: 'domcontentloaded' })
  await sleep(3500)
  win = await mainWindow(app, { timeoutMs: 20000 })

  return { app, win, seed, userData }
}

module.exports = { bootSeededPos }
