# Fast Food TV (Android TV / Fire TV kiosk)

A small WebView kiosk that shows a restaurant's ambient/menu display on a TV. It is a smart
connector rather than a fixed URL viewer:

1. On first launch, staff enter the **4-digit code** shown in the POS app under
   **Settings > Ambiance Screen**.
2. The app asks the cloud resolver (`/api/pair?code=XXXX`) for the restaurant's LAN addresses,
   display port, profile, and cloud fallback URL.
3. It probes a bounded list of LAN addresses first. This keeps the normal in-restaurant path
   fast and avoids cloud traffic.
4. If LAN is unavailable, it loads the cloud display and periodically checks whether LAN has
   returned.
5. Code, URL, and connection mode are saved together only after the first display page has
   loaded successfully. Later boots reconnect without typing.

Connection attempts are generation-tokened, so a slow old resolver or WebView callback cannot
overwrite a newer manual attempt. Main-frame HTTP/network failures remain visible on the pairing
screen with different messages for unknown codes, resolver outages, and TV network failures.

## Local debug build

Requirements: JDK 17, Android SDK 34, and Gradle 8.7.

```sh
cd tv-app
gradle wrapper --gradle-version 8.7
./gradlew testDebugUnitTest assembleDebug
# app/build/outputs/apk/debug/app-debug.apk
```

The debug APK uses the standard Android debug key and is for developer/emulator testing only. It
can be installed with `adb install -r app-debug.apk`. Production TVs must receive the signed
release APK so future versions can update the existing installation.

> **One-time migration:** a TV that already has the legacy debug-signed APK cannot install the
> production-signed APK over it. Uninstall the debug app, install the release APK, and enter the
> restaurant code again. After that, every release signed with the same production keystore can
> update in place. Do not distribute another debug APK to a restaurant.

## Signed release build

Release tasks intentionally fail when signing material is absent. Keep the keystore outside the
repository and provide all five values through environment variables or Gradle properties:

```text
FFM_TV_KEYSTORE_PATH=/secure/location/ffm-tv-release.jks
FFM_TV_KEYSTORE_PASSWORD=...
FFM_TV_KEY_ALIAS=...
FFM_TV_KEY_PASSWORD=...
FFM_TV_SIGNING_CERT_SHA256=...
```

Optional release version overrides:

```text
FFM_TV_VERSION_CODE=3
FFM_TV_VERSION_NAME=1.2.0
```

`versionCode` must increase for every APK distributed to restaurants. Never replace or lose the
production keystore: Android will reject updates signed by a different key.

```sh
./gradlew testReleaseUnitTest assembleRelease
# app/build/outputs/apk/release/app-release.apk
```

The GitHub workflow tests and builds a debug artifact on `main`, the TV feature branch, and manual
runs. It additionally builds a signed release when manually requested from `main` with
**build_release** enabled or when a `tv-v*` tag whose commit is on `main` is pushed. The release job
uses the protected **Production** environment. Require reviewer approval on that environment and
protect `tv-v*` tags before provisioning its signing material. Configure these Production
environment secrets before using that path:

- `FFM_TV_KEYSTORE_BASE64`
- `FFM_TV_KEYSTORE_PASSWORD`
- `FFM_TV_KEY_ALIAS`
- `FFM_TV_KEY_PASSWORD`
- `FFM_TV_SIGNING_CERT_SHA256`

`FFM_TV_SIGNING_CERT_SHA256` is the SHA-256 digest of the production signing certificate. The
workflow verifies the finished APK against it, so accidentally replacing the keystore with a
different valid key cannot produce a green, fleet-incompatible artifact.

Obtain the digest once from the protected keystore with
`keytool -list -v -keystore /secure/location/ffm-tv-release.jks -alias YOUR_ALIAS`, record the
displayed `SHA256` value in the repository secret, and verify it through a second trusted copy
before the first restaurant rollout.

The workflow reports exactly which secret names are missing without printing secret values. Its
release `versionCode` uses `1000 +` the monotonic GitHub run number (so it is newer than the legacy
`versionCode=1` APK); a `tv-v1.2.0` tag produces version name `1.2.0`.

## Operational notes

- Auto-launch after boot is best-effort because some TV operating systems restrict background
  activity starts. Many TV launchers offer a separate "boot to app" setting.
- The POS PC firewall must allow the display port for LAN mode. If LAN is isolated or blocked,
  the verified cloud fallback remains available.
- Automatic WebView renderer recovery is bounded to three attempts in five minutes with backoff.
  After repeated crashes, staff can select **Connect** to make a deliberate retry instead of the
  app looping forever.
