// TV UI test: launch the kiosk on the emulator, screenshot the pairing screen, type a code,
// screenshot again. Proves the harness can drive the TV app end to end via adb.
const path = require('path')
const tv = require('../lib/tv')
const { artifactsDir, saveText, log, sleep } = require('../lib/util')

exports.run = async () => {
  const out = artifactsDir('tv-ui')
  const resolver = process.env.RESOLVER || '' // e.g. http://10.0.2.2:3000/api/pair for local e2e

  tv.reset() // clear saved pairing -> show the pairing screen
  tv.clearLog()
  tv.launch(resolver)
  await sleep(3500)
  tv.screenshot(path.join(out, '1-pairing.png'))

  tv.type('1234')
  await sleep(900)
  tv.screenshot(path.join(out, '2-typed.png'))

  // Press the IME "done"/enter to submit the code.
  tv.key(66) // KEYCODE_ENTER
  await sleep(4000)
  tv.screenshot(path.join(out, '3-after-connect.png'))

  saveText(out, 'focus.txt', tv.focus())
  saveText(out, 'logcat.txt', tv.dumpLog())
  log('TV focus:', tv.focus())
  log('screens in', out)
  return { artifacts: out }
}
