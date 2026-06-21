# FFM Test Lab — agentic, self-driving testing

Lets the assistant (in `/loop`) drive and verify **every** surface of Fast Food Manager
without a human clicking: the POS desktop app, the TV app, and the admin.

## How each surface is driven
- **POS (Electron)** → Playwright-Electron (`lib/pos.js`). Launches the **built** app with an
  **isolated `--user-data-dir`** (throwaway DB) so automated clicks NEVER touch real restaurant
  data. Can click, fill, read the DOM, and screenshot.
- **TV app** → `adb` (`lib/tv.js`). Install/launch/tap/type/key/screenshot/logcat. Can point the
  app at a local admin via `RESOLVER=http://10.0.2.2:3000/api/pair` for offline end-to-end.
- **Admin / web** → Playwright browser (add when needed) or direct API calls.

## Prereqs
- Android TV emulator installed at `D:\Android` (AVD `ffm_tv`). Boot it with `Start-Test-Lab.bat`.
- POS built at least once: from the app root, `npm run build`.
- `npm install` here (Playwright; browsers are skipped — Electron uses its own).

## Run
```
Start-Test-Lab.bat        # boots the emulator
npm install               # first time (PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1)
npm run pos               # launch POS, screenshot -> artifacts/
npm run tv                # drive the TV pairing UI -> artifacts/
node run.js <scenario>    # any scenario in scenarios/
```
Screenshots + logs land in `artifacts/<scenario>-<timestamp>/`. The assistant reads those PNGs
to *see* the result and decide the next step.

## Scenarios
- `pos-smoke` — launch POS, screenshot the first screen.
- `tv-ui` — launch the kiosk, screenshot pairing, type a code, submit, screenshot result.
- (add more: order-with-discount, language-switch, e2e-pairing, …)
