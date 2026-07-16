// TV-app driver: full control of the Fast Food TV app on the Android emulator via adb.
const { execFileSync } = require('child_process')
const fs = require('fs')

const ADB = process.env.ADB || 'D:\\Android\\sdk\\platform-tools\\adb.exe'
const PKG = 'com.fastfood.tv'

function adb(args, opts = {}) {
  return execFileSync(ADB, args, { maxBuffer: 64 * 1024 * 1024, ...opts })
}

module.exports = {
  adb,
  devices: () => adb(['devices']).toString(),
  /** Install / update the APK. */
  install: (apk) => adb(['install', '-r', apk]).toString(),
  /** Launch the kiosk. Optional resolverUrl points the app at a local admin (e.g. http://10.0.2.2:3000/api/pair). */
  launch: (resolverUrl) => {
    const a = ['shell', 'am', 'start', '-n', `${PKG}/.MainActivity`]
    if (resolverUrl) a.push('--es', 'resolver', resolverUrl)
    return adb(a).toString()
  },
  stop: () => adb(['shell', 'am', 'force-stop', PKG]).toString(),
  /** Clear the app's saved pairing so the next launch shows the pairing screen. */
  reset: () => { try { adb(['shell', 'pm', 'clear', PKG]) } catch (e) {} },
  tap: (x, y) => adb(['shell', 'input', 'tap', String(x), String(y)]),
  type: (text) => adb(['shell', 'input', 'text', String(text)]),
  key: (code) => adb(['shell', 'input', 'keyevent', String(code)]),
  /** Capture a PNG to `path` (binary-safe; no PowerShell redirect). */
  screenshot: (path) => { fs.writeFileSync(path, adb(['exec-out', 'screencap', '-p'])); return path },
  clearLog: () => { try { adb(['logcat', '-c']) } catch (e) {} },
  dumpLog: () => { try { return adb(['logcat', '-d', '-t', '400']).toString() } catch (e) { return '' } },
  /** Dump the current accessibility hierarchy for assertions (not just screenshots). */
  uiXml: () => {
    const remote = '/sdcard/ffm-tv-window.xml'
    try {
      adb(['shell', 'uiautomator', 'dump', remote])
      return adb(['exec-out', 'cat', remote]).toString()
    } finally {
      try { adb(['shell', 'rm', '-f', remote]) } catch (e) {}
    }
  },
  focus: () => {
    const m = adb(['shell', 'dumpsys', 'window']).toString().match(/mCurrentFocus=.*/)
    return m ? m[0] : ''
  }
}
