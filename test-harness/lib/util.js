const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
}

/** A fresh artifacts/<scenario>-<timestamp>/ dir for screenshots + logs. */
function artifactsDir(scenario) {
  const dir = path.join(ROOT, 'artifacts', `${scenario}-${stamp()}`)
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function saveText(dir, name, text) {
  fs.writeFileSync(path.join(dir, name), text)
}

const log = (...a) => console.log('[lab]', ...a)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

module.exports = { artifactsDir, saveText, log, sleep, ROOT }
