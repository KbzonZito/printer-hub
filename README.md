# Printer Hub

An Android app to control 3D printers running **Klipper + Moonraker** over your local network.
Built for the **Creality Hi** (rooted), and works with the K1, K2, Sovol, Voron, Elegoo and any
other printer that exposes Moonraker (the same API Mobileraker uses).

## Features

- **Home**: status, progress, layer, remaining time and estimated finish time, temperatures (tap
  to set), fan, light, pause / resume / cancel and homing. The **emergency stop** is always in
  the top-right corner.
- **Live tuning** while printing: speed, flow, Z offset (babystepping) and part fan.
- **Temperature chart** for the nozzle and bed over the last 5, 10 or 20 minutes.
- **Camera**: Creality WebRTC (port 8000), webcams configured in Moonraker, or MJPEG (port 8080).
  Rotate the device for a landscape view.
- **Control**: jog the axes, home, extrude / retract, run Klipper macros and a G-code console.
- **Files**: browse the printer's folders in a list or grid, sort by date, name or size,
  create folders, and move, rename, delete or upload files. Tapping a file shows its details
  and a time estimate adjusted with your own print history (last real print time, slicer
  estimate corrected by how fast your printer really is, or a filament-based estimate).
- **History** with totals and one-tap reprint, plus **timelapses** (requires the
  moonraker-timelapse plugin).
- **Notifications** when a print finishes, pauses or fails, even with the app closed, and a
  **home screen widget** with progress and finish time.
- **Share a .gcode** from another app (Drive, WhatsApp, your slicer…) to upload or print it.
- **Network discovery** to find Moonraker printers on your Wi-Fi.
- **Full-screen camera** from the Home card: pinch, drag or double tap to zoom, share a
  capture of the current frame, and change the camera mode.
- **Backup** of printers, presets and appearance to a file, to restore on another phone.
- Android niceties: swipe panels down to close them, back gesture that closes panels and
  folders first, pull to refresh, subtle
  vibration on pause / cancel / emergency stop, themed icon and system font size.
- **Away from home**: see [docs/remote-access.md](docs/remote-access.md) (Tailscale).
- **Preheat presets**: add, edit or remove materials with their nozzle and bed temperatures.
- **Settings** in collapsible sections: multiple printers, connection test, camera mode, language (English / Spanish),
  light / dark / system theme, and the remaining-time method (automatic, slicer, printer M73,
  file progress or filament used).
- Material 3 dynamic color: use the device's Material You color or pick one of the preset
  colors, with any palette style (tonal spot, neutral, vibrant, expressive, fidelity, content,
  rainbow, fruit salad, monochrome).
- Material 3 look with a floating navigation bar on phones and a navigation rail with a
  two-column dashboard on tablets.

## Install on Android

1. Open [Releases](https://github.com/KbzonZito/printer-hub/releases) on your phone.
2. Download `printer-hub-X.Y.Z.apk` from the latest release and open it (allow "install unknown
   apps" the first time). Newer releases install as updates.
3. Tap **Scan network**, or enter the printer's IP (printer screen → Network) and port `7125`.

## Versions and releases

The version lives in `package.json` (`MAJOR.MINOR.PATCH`); the Android `versionCode` is derived
from it. Changes are listed under `[Unreleased]` in [CHANGELOG.md](CHANGELOG.md).

1. Work and commit locally; don't push yet.
2. Build a test APK and install it on the phone:
   ```bash
   npm run apk              # installs directly if the phone is connected with USB/Wi-Fi debugging
   npm run apk -- --serve   # or download it from the phone over the local network
   ```
   Test builds are named `X.Y.Z-test.<commit>` and use the release key, so they install over
   the released app.
3. When it all works, publish:
   ```bash
   npm run release -- 0.3.0
   ```
   This dates the changelog, commits, tags `v0.3.0` and pushes. GitHub Actions builds the APK
   and creates the release with the changelog as notes. Pushes to `main` without a tag only
   check that the app builds.

Local builds need JDK 21 and the Android SDK (`brew install openjdk@21` and
`brew install --cask android-commandlinetools`, then `sdkmanager "platform-tools"
"platforms;android-36" "build-tools;36.0.0"`).

### Signing

Releases and test builds are signed with the same key so they update each other. Run this once
to create it and upload it to the repository secrets (requires `gh` and `openssl`):

```bash
./scripts/setup-signing.sh
```

The key is kept in `~/.config/printer-hub`; back it up, since an installed app can only be
updated by an APK signed with the same key.

## Development

```bash
npm install
npm run dev          # UI in the browser
npm run android:sync # build and copy into the Android project
npm run mock         # simulated Moonraker on port 7125 (add the printer as 127.0.0.1)
npm test             # unit tests (Vitest)
```

The simulator has failure scenarios for testing the connection handling:
`MOCK_SCENARIO=drop npm run mock` (also `klippy-startup`, `shutdown`, `silent`,
`reject-origin` and `slow`; see `scripts/mock-moonraker.mjs`).

In the browser, requests to the printer may fail because of CORS; the APK uses native HTTP
(`CapacitorHttp`) so it isn't affected. To test from a browser, add `cors_domains: *` to the
`[authorization]` section of `moonraker.conf`.

Notifications, the widget, file sharing and network discovery are native Android code in
`android/app/src/main/java/com/kbzonzito/printerhub/` and only work in the APK.

Stack: React + TypeScript + Vite, packaged with Capacitor. GitHub Actions builds the APK
(`.github/workflows/android.yml`), so Android Studio isn't required.
