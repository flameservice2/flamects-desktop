# Flame CTS desktop app

Electron wrapper around `src/FlameCTS.html` (the live Supabase-backed web page).
The page is unchanged apart from bundling supabase-js and the Sora/Inter fonts
locally (see `scripts/prepare.js`). Data, login and realtime sync go to the same
Supabase project as the web version.

- `npm install`
- `npm start` – run the app
- `npm run dist:win` – Windows installer in `dist/` (on Linux this needs Wine)
- `npm run dist:linux` – Linux AppImage

## Releasing an update

1. Change `src/FlameCTS.html` (or the other sources).
2. Bump `version` in `package.json` and push to `main`.
3. The **Release** workflow builds the Windows installer and publishes it as a
   GitHub release (`v<version>`).
4. Installed apps check for a new release when they start, every 10 minutes and when brought back to the front,
   download it in the background and offer "Restart now" (or install it when
   the app is closed). Business data is not touched; it stays in Supabase.

`web/FlameCTS.html` (made by `npm run build:app`) is the same page for use in a
browser.

## Android app (`android/`)

A small Java WebView app around the same page (`app/`, copied into the APK's
assets by the **Android** workflow). The page is served from
`https://appassets.androidplatform.net/app/` and `android/app/src/main/assets/shim.js`
connects it to the phone: printing, PDF sharing to WhatsApp/email, Excel/PDF
downloads, the Back button, and the same Update bar as the PC app.

- **Page updates:** every release also carries `FlameCTS-app.html`. The phone
  checks `releases/latest` on start, every 10 minutes and on resume, downloads a
  newer page and offers "Restart now". No new APK is needed for page changes.
- **App updates:** only when the Java/manifest changes. Bump `versionCode` in
  `android/app/build.gradle`, let the **Android** workflow build the unsigned
  APK, sign it with the release key (`python3 android/sign_apk.py in.apk
  FlameCTS-Android.apk key.p12 PASSWORD`), attach it to a release, then update
  `android/latest.json`; phones are offered the new APK.
- The release key is not in this repository. Every APK must be signed with it.
