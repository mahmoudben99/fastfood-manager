// POS driver: launch the real (built) Electron app via Playwright with an ISOLATED test
// database, so automated clicks never touch the user's real restaurant data.
const { _electron: electron } = require('playwright')

const APP_DIR = process.env.FFM_DIR || 'D:\\Fast Food Manager\\Fastfood Manager\\fastfood-manager'
const ELECTRON = APP_DIR + '\\node_modules\\electron\\dist\\electron.exe'

/** Launch the built POS app. `userData` is a throwaway dir → clean DB, never touches real data. */
async function launchPos({ userData }) {
  const env = { ...process.env }
  // Critical: ELECTRON_RUN_AS_NODE leaks from VS Code terminals and breaks require('electron').
  delete env.ELECTRON_RUN_AS_NODE
  // Give the test instance its OWN cloud identity so it never touches a real machine's
  // Supabase rows (display_settings/menu_sync/etc.). Stable so re-runs reuse the same test row.
  if (!env.FFM_MACHINE_ID_OVERRIDE) env.FFM_MACHINE_ID_OVERRIDE = 'TESTLAB000000001'
  return electron.launch({
    executablePath: ELECTRON,
    args: [APP_DIR, `--user-data-dir=${userData}`],
    cwd: APP_DIR,
    env,
    timeout: 60000
  })
}

/** Wait for the MAIN renderer window (index.html), skipping the splash (splash.html). */
async function mainWindow(app, { timeoutMs = 40000 } = {}) {
  const start = Date.now()
  const isMain = (w) => { try { return w.url().includes('index.html') } catch (e) { return false } }
  while (Date.now() - start < timeoutMs) {
    const hit = app.windows().find(isMain)
    if (hit) return hit
    try {
      const w = await app.waitForEvent('window', { timeout: 2500 })
      if (isMain(w)) return w
    } catch (e) { /* keep polling */ }
  }
  const ws = app.windows()
  return ws[ws.length - 1] // fallback: whatever's open (likely splash)
}

module.exports = { launchPos, mainWindow, APP_DIR }
