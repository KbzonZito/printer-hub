# Development

Notes for working on Printer Hub itself. Users don't need any of this.

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

## Commands

```bash
npm install
npm run dev          # UI in the browser
npm run android:sync # build and copy into the Android project
npm run mock         # simulated Moonraker on port 7125 (add the printer as 127.0.0.1)
npm test             # unit tests (Vitest)
npm run check        # types, lint (oxlint), formatting (Prettier), unused translations and tests
npm run format       # format src/ and scripts/ with Prettier
npm run e2e          # end-to-end tests: the app in Chromium against the simulator (Playwright)
npm run bench:gcode  # G-code parser speed (GCODE_BENCH_DIR=folder adds your own files)
```

`npm run check` and the end-to-end tests also run in GitHub Actions before every build, along
with the Android unit tests (`./gradlew testReleaseUnitTest`). The first time, install the
browser for the end-to-end tests with `npx playwright install chromium`.

The simulator has failure scenarios for testing the connection handling:
`MOCK_SCENARIO=drop npm run mock` (also `klippy-startup`, `shutdown`, `silent`,
`reject-origin` and `slow`; see `scripts/mock-moonraker.mjs`). It serves real G-code at the
Creality Hi's measured speed (`MOCK_FILE_RATE=0` for full speed), and
`MOCK_PRINT=pruebas/grande_50mb.gcode MOCK_PROGRESS=0.6` prints another file from another
point.

In the browser, requests to the printer may fail because of CORS; the APK uses native HTTP
(`CapacitorHttp`) so it isn't affected. To test from a browser, add `cors_domains: *` to the
`[authorization]` section of `moonraker.conf`.

Notifications, the widget, file sharing and network discovery are native Android code in
`android/app/src/main/java/com/kbzonzito/printerhub/` and only work in the APK.

Stack: React + TypeScript + Vite, packaged with Capacitor. GitHub Actions builds the APK
(`.github/workflows/android.yml`), so Android Studio isn't required.
