// TV UI test: launch the kiosk on the emulator, screenshot the pairing screen, type a code,
// screenshot again. Proves the harness can drive the TV app end to end via adb.
const assert = require('assert')
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
  const initialFocus = tv.focus()
  const initialUi = tv.uiXml()
  saveText(out, '1-pairing.xml', initialUi)
  assert(initialFocus.includes('com.fastfood.tv'), `TV app is not foreground: ${initialFocus}`)
  assert(initialUi.includes('Fast Food Manager - TV'), 'pairing title is not visible')
  assert(initialUi.includes('Connect'), 'pairing Connect action is not visible')

  tv.type('1234')
  await sleep(900)
  tv.screenshot(path.join(out, '2-typed.png'))
  const typedUi = tv.uiXml()
  saveText(out, '2-typed.xml', typedUi)
  assert(typedUi.includes('text="1234"'), 'pairing input did not receive the 4-digit code')

  // Press the IME "done"/enter to submit the code.
  tv.key(66) // KEYCODE_ENTER
  await sleep(8000)
  tv.screenshot(path.join(out, '3-after-connect.png'))

  const finalFocus = tv.focus()
  const finalUi = tv.uiXml()
  const logcat = tv.dumpLog()
  saveText(out, '3-after-connect.xml', finalUi)
  saveText(out, 'focus.txt', finalFocus)
  saveText(out, 'logcat.txt', logcat)
  assert(finalFocus.includes('com.fastfood.tv'), `TV app left the foreground: ${finalFocus}`)
  assert(
    !/FATAL EXCEPTION[\s\S]{0,2000}Process: com\.fastfood\.tv/.test(logcat),
    'Fast Food TV crashed during pairing; inspect logcat.txt'
  )
  log('TV focus:', finalFocus)
  log('screens in', out)
  return { artifacts: out }
}
