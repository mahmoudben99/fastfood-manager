// Seed the POS into a working state (activated + setup + menu + promo) and confirm it lands
// on the main Order screen. This is the foundation for all deeper POS feature tests.
const path = require('path')
const os = require('os')
const fs = require('fs')
const { launchPos, mainWindow } = require('../lib/pos')
const { seedViaIpc } = require('../lib/seed')
const { artifactsDir, saveText, log, sleep } = require('../lib/util')

exports.run = async () => {
  const out = artifactsDir('pos-seeded')
  const userData = path.join(os.tmpdir(), 'ffm-test-userdata')
  fs.rmSync(userData, { recursive: true, force: true })

  log('launch #1 (create + migrate DB) …')
  let app = await launchPos({ userData })
  let win = await mainWindow(app, { timeoutMs: 45000 })
  await sleep(2500)

  log('seeding via IPC (activate + setup + menu + promo) …')
  const seed = await seedViaIpc(win)
  saveText(out, 'seed.json', JSON.stringify(seed, null, 2))
  log('seed result:', JSON.stringify(seed))

  const after = await win.evaluate(() => window.api.settings.getAll())
  saveText(out, 'after-seed-settings.json', JSON.stringify(after, null, 2))
  log('after-seed: activation_status=', after.activation_status, ' activation_type=', after.activation_type, ' setup_complete=', after.setup_complete, ' machine_id=', after.machine_id)

  log('navigating to bare URL (no hash) → fresh load → activated redirect …')
  // reload() keeps the committed #/activate hash, so navigate to the bare index.html instead;
  // the HashRouter then starts at '/', hits the catch-all, and redirects based on activated.
  const base = win.url().split('#')[0]
  await win.goto(base, { waitUntil: 'domcontentloaded' })
  await sleep(4000)
  win = await mainWindow(app, { timeoutMs: 20000 })

  const afterReload = await win.evaluate(() => window.api.settings.getAll()).catch((e) => ({ ERR: String(e) }))
  saveText(out, 'after-reload-settings.json', JSON.stringify(afterReload, null, 2))
  log('after-reload: activation_status=', afterReload.activation_status, ' setup_complete=', afterReload.setup_complete, ' (api?', typeof afterReload)

  const url = (() => { try { return win.url() } catch (e) { return '' } })()
  const bodyText = await win.evaluate(() => document.body.innerText.slice(0, 800)).catch(() => '')
  await win.screenshot({ path: path.join(out, 'order-screen.png') })
  saveText(out, 'screen.txt', `url: ${url}\n\n${bodyText}`)
  log('landed on:', url.split('#').pop())

  await app.close().catch(() => {})

  if (!url.includes('/orders')) {
    throw new Error(`expected to land on /orders, got: ${url}`)
  }
  return { artifacts: out }
}
