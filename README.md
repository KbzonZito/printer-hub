# Printer Hub

An Android app to control 3D printers running **Klipper + Moonraker** over your local network.
Built for the **Creality Hi** (rooted), and works with the K1, K2, Sovol, Voron, Elegoo and any
other printer that exposes Moonraker (the same API Mobileraker uses).

## Features

- **Home**: status, progress, layer, remaining time and estimated finish time, temperatures (tap
  to set), fan, light, pause / resume / cancel, homing and emergency stop.
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
2. Download `printer-hub.apk` from **Latest build** and open it (allow "install unknown apps"
   the first time).
3. Tap **Scan network**, or enter the printer's IP (printer screen → Network) and port `7125`.

Every push to `main` builds a new APK. For a numbered release: `git tag v1.0.0 && git push --tags`.

### Signing

CI signs the APK with the key stored in the repository secrets so updates install over the
previous version. Run this once to create the key and upload the secrets (requires `gh` and
`openssl`):

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
```

In the browser, requests to the printer may fail because of CORS; the APK uses native HTTP
(`CapacitorHttp`) so it isn't affected. To test from a browser, add `cors_domains: *` to the
`[authorization]` section of `moonraker.conf`.

Notifications, the widget, file sharing and network discovery are native Android code in
`android/app/src/main/java/com/kbzonzito/printerhub/` and only work in the APK.

Stack: React + TypeScript + Vite, packaged with Capacitor. GitHub Actions builds the APK
(`.github/workflows/android.yml`), so Android Studio isn't required.
