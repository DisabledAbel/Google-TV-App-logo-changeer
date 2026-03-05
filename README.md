# Google TV Logo Changer

Upload an image from your web browser and instantly show it on a Google TV screen page.

## Same Wi‑Fi requirement (important)

To transfer images from your browser to TV, devices must be on the same Wi‑Fi network:
- Device 1 (phone/laptop): opens upload page.
- Device 2 (Google TV): opens TV display page.
- Both connect to the same local server IP (example: `http://192.168.1.100:3000`).

## Local run

```bash
node server.js
```

Then open:
- Upload page: `http://<your-local-ip>:3000/`
- TV page: `http://<your-local-ip>:3000/tv.html`

## Deploy on Vercel

This repo includes `vercel.json` so all routes are handled by `server.js` as a Vercel Node function.

```bash
vercel
vercel --prod
```

After deploy, use your Vercel URL instead of local IP.


## GitHub Pages website for APK install

This repo includes a workflow to publish a GitHub Pages installer website with a direct APK download button.

- Workflow: `.github/workflows/deploy-apk-site.yml`
- Published file: `app-debug.apk`
- Site source template: `docs/index.html`

How to use:
1. Push to `main` or run the workflow manually from Actions.
2. Enable GitHub Pages in repo settings (Build and deployment: GitHub Actions).
3. Open your Pages URL and tap **Download APK**.

## Build APK with GitHub Actions

A workflow is included at `.github/workflows/build-apk.yml`.

1. Push branch to GitHub.
2. Open **Actions** → **Build Android APK**.
3. Run workflow (or trigger via push/PR).
4. Download artifact: `google-tv-logo-changer-debug-apk`.

The Android app (in `/android`) is a WebView launcher where users set the server URL and open upload or TV pages.

## Important Vercel note

- Local mode persists uploads in `current-logo.json`.
- On Vercel, filesystem writes are not durable across invocations, so persistence is best-effort only unless you add external storage (Vercel KV/Blob/database).
