# Fast Food TV (Android TV / Fire TV kiosk)

A thin WebView kiosk that shows the restaurant's ambient/menu display on a TV. It is a *smart
connector*, not just a viewer:

1. On first launch the user enters the **4-digit code** shown in the POS app
   (Settings → Ambiance Screen).
2. The app asks the cloud resolver (`/api/pair?code=XXXX`) for that restaurant's connection
   info: the POS PC's **LAN IPs**, the **port**, and a **cloud fallback URL**.
3. It tries each LAN IP first (instant, free, no Supabase). The first that answers within
   ~1s is used — so a printer NIC / virtual adapter that sneaks into the list simply fails the
   probe and is skipped.
4. If none answer (firewall, AP/client isolation, the TV is on a different network), it loads
   the **cloud display URL** instead. The screen always works.
5. The working URL + code are remembered, so every later boot reconnects with **no typing**.

## Why this design
- An ambient screen is in the **same building** as the POS, so it should talk over the local
  WiFi — instant and free — not round-trip through Supabase/Vercel (which caused the lag,
  egress cost, and free-tier pausing).
- Cloud is used only for the tiny 4-digit handshake and as the last-resort fallback.

## Build
CI builds it automatically (`.github/workflows/build-tv-apk.yml`) on push to the
`feature/ambient-tv-overhaul` branch, or via "Run workflow". The APK lands as the
`fastfood-tv-apk` artifact (`app-debug.apk`).

Locally (needs JDK 17 + Android SDK):
```
cd tv-app
gradle wrapper --gradle-version 8.7
./gradlew assembleDebug
# -> app/build/outputs/apk/debug/app-debug.apk
```

## Install on a TV
Sideload `app-debug.apk` (e.g. via the "Downloader" app on Android TV / Fire TV, or
`adb install app-debug.apk`). Open **Fast Food TV**, type the 4-digit code, done.

## Notes / limits
- The debug APK is signed with the Android debug key — fine for sideloading.
- Auto-launch on boot is best-effort; some TV OS versions restrict background starts. Most
  TV launchers let you set a default "boot to app".
- For the fast LAN path, the POS PC's firewall must allow the display port — the POS app has
  a one-click "Allow through firewall" button. Without it, the app still works via cloud.
