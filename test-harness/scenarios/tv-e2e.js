// TV pairing backend end-to-end (no Next.js needed):
// the seeded POS publishes its 4-digit code + reachable LAN IPs + port to Supabase, and we
// confirm it's resolvable by that code exactly the way /api/pair does. Proves the whole
// POS -> cloud-sync -> Supabase -> resolver chain that the TV app relies on.
const fs = require('fs')
const path = require('path')
const { bootSeededPos } = require('../lib/boot')
const { artifactsDir, saveText, log, sleep } = require('../lib/util')

function readSupabaseEnv() {
  const envPath = path.join(__dirname, '..', '..', 'admin', '.env.local')
  const txt = fs.readFileSync(envPath, 'utf8')
  const get = (k) => {
    const m = txt.match(new RegExp('^' + k + '=(.*)$', 'm'))
    return m ? m[1].trim().replace(/^["']|["']$/g, '') : ''
  }
  return { url: get('SUPABASE_URL'), key: get('SUPABASE_SERVICE_ROLE_KEY') }
}

exports.run = async () => {
  const out = artifactsDir('tv-e2e')
  const { app, win } = await bootSeededPos()
  try {
    const { code } = await win.evaluate(() => window.api.tablet.getPairingCode())
    log('POS pairing code:', code)

    // Publish display settings now (includes _pairing_code / _lan_ips / _port).
    await win.evaluate(() => window.api.cloud.syncDisplay())
    await sleep(4500)

    const { url, key } = readSupabaseEnv()
    if (!url || !key) throw new Error('could not read SUPABASE creds from admin/.env.local')

    // Resolve exactly like /api/pair: display_settings WHERE settings->>_pairing_code = code.
    const q = `${url}/rest/v1/display_settings?select=machine_id,profile_name,settings&settings->>_pairing_code=eq.${code}`
    const res = await fetch(q, { headers: { apikey: key, Authorization: `Bearer ${key}` } })
    const rows = await res.json()
    const row = Array.isArray(rows) ? rows[0] : null
    saveText(out, 'resolved.json', JSON.stringify(row ? { machine_id: row.machine_id, profile_name: row.profile_name, _pairing_code: row.settings._pairing_code, _lan_ips: row.settings._lan_ips, _port: row.settings._port } : rows, null, 2))

    if (!row) throw new Error(`code ${code} did NOT resolve in Supabase — POS->cloud publish failed`)
    const lanIps = JSON.parse(row.settings._lan_ips || '[]')
    const port = row.settings._port
    log(`resolved: machine=${row.machine_id} lanIps=${JSON.stringify(lanIps)} port=${port}`)

    if (row.machine_id !== 'TESTLAB000000001') throw new Error(`resolved wrong machine: ${row.machine_id}`)
    if (!Array.isArray(lanIps) || lanIps.length === 0) throw new Error('no LAN IPs were published')
    if (!port) throw new Error('no port was published')

    log('✔ TV pairing backend verified: POS published code + LAN IPs + port; resolvable by the 4-digit code')
    return { artifacts: out }
  } finally {
    await app.close().catch(() => {})
  }
}
