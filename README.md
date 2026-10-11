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
4. Installed apps check for a new release when they start and every 4 hours,
   download it in the background and offer "Restart now" (or install it when
   the app is closed). Business data is not touched; it stays in Supabase.

`web/FlameCTS.html` (made by `npm run build:app`) is the same page for use in a
browser.
