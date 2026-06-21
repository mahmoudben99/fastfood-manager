// Scenario orchestrator. Usage: node run.js <scenario>   (default: pos-smoke)
const path = require('path')
const { log } = require('./lib/util')

const name = process.argv[2] || 'pos-smoke'

;(async () => {
  let mod
  try {
    mod = require(path.join(__dirname, 'scenarios', `${name}.js`))
  } catch (e) {
    log('no such scenario:', name, '-', e.message)
    process.exit(2)
  }
  log('▶ running scenario:', name)
  const t0 = Date.now()
  try {
    const result = await mod.run()
    log(`✔ scenario PASSED: ${name} (${Date.now() - t0}ms)`)
    if (result && result.artifacts) log('  artifacts:', result.artifacts)
  } catch (e) {
    log(`x scenario FAILED: ${name} -`, e && e.stack ? e.stack : e)
    process.exitCode = 1
  }
})()
