# Printer Hub

#### Control your Klipper 3D printer from your Android phone.

[![Latest release](https://img.shields.io/github/v/release/KbzonZito/printer-hub)](https://github.com/KbzonZito/printer-hub/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/KbzonZito/printer-hub/total)](https://github.com/KbzonZito/printer-hub/releases)
[![License: MIT](https://img.shields.io/github/license/KbzonZito/printer-hub)](LICENSE)
![Android 7+](https://img.shields.io/badge/Android-7%2B-3ddc84?logo=android&logoColor=white)

[Download](https://github.com/KbzonZito/printer-hub/releases/latest) •
[Install](#install) •
[Getting started](#getting-started) •
[Supported printers](#supported-printers) •
[Away from home](docs/remote-access.md)

Printer Hub talks to [Moonraker](https://github.com/Arksine/moonraker), the API behind Mainsail,
Fluidd and Mobileraker, directly on your Wi-Fi. No account, no cloud, no ads. It was built for
the **Creality Hi** and works with any printer that runs Klipper and Moonraker.

<!-- Screenshots: add phone captures here, for example
<p align="center">
  <img src="docs/screenshots/home.png" width="200">
  <img src="docs/screenshots/files.png" width="200">
  <img src="docs/screenshots/preview.png" width="200">
  <img src="docs/screenshots/widget.png" width="200">
</p>
-->

## Main features

- **Live status**: progress, current layer, time left and finish time, temperatures, fans
  and light. Pause, resume or cancel, with an **emergency stop** always in the top-right corner.
- **Camera** on the Home screen (Creality WebRTC, MJPEG or the webcams set up in Moonraker),
  full screen with zoom and snapshots.
- **Tune while printing**: speed, flow, Z offset and part fan. Temperature chart for the
  nozzle and bed.
- **Files**: browse folders, upload, move, rename and delete, and print. Each file shows its
  thumbnail and a time estimate that learns from your own print history.
- **G-code preview** layer by layer, with a live view of the layer being printed.
- **Notifications** when a print finishes, pauses or fails, even with the app closed, with a
  photo. A **home screen widget** and a **Quick Settings tile** show the progress.
- **Control**: move the axes, home, extrude, run macros and send G-code from a console.
- **Guided calibrations**: PID for the nozzle and bed, Z offset and input shaper. Bed mesh
  heatmap, and a config editor for `printer.cfg`.
- **Exclude objects** from a running print by tapping them on a map of the bed.
- **History** with statistics, one-tap reprint and timelapses.
- **Several printers**, with an overview of all of them at once.
- **Extras when your printer has them**: print queue, [Spoolman](https://github.com/Donkie/Spoolman)
  filament spools, smart plugs that can switch off by themselves after a print.
- **Print cost** from the price per kg of each material.
- **Share a G-code** from your slicer, Drive or a chat app to upload or print it.
- Material You colors, light and dark themes, phones and tablets, English and Spanish.
- **Backup** of your printers and settings, to move them to a new phone.

## Install

Printer Hub isn't on Google Play yet. You can install it from GitHub in two ways.

### With Obtainium (recommended)

[Obtainium](https://github.com/ImranR98/Obtainium) installs apps straight from their GitHub
releases and lets you know when there's an update.

1. Install Obtainium.
2. Tap **Add app** and paste `https://github.com/KbzonZito/printer-hub`.
3. Tap **Add**, then **Install**.

### By hand

1. Open the [latest release](https://github.com/KbzonZito/printer-hub/releases/latest) on your
   phone and download `printer-hub-X.Y.Z.apk`.
2. Open it. The first time, Android asks you to allow installing apps from your browser.
3. To update, download the new APK and install it the same way. Your printers and settings
   are kept.

## Getting started

### Before you start

- A printer running **Klipper and Moonraker**. On the Creality Hi and K1 this needs root
  access. See [Supported printers](#supported-printers).
- Your phone and the printer on the **same Wi-Fi network**.

### Connect a printer

The first time you open the app, a short setup asks for your language and colors, then for
your printer:

- **Scan the network** finds the printers running Moonraker on your Wi-Fi. Tap yours.
- **Enter the IP** if you already know it. The port is usually `7125`. On the Creality Hi
  you'll find the IP on the printer screen, under **Settings → Network**.

Give it a name and tap **Save printer**. The camera is detected by itself.

### Add, switch or remove printers

Go to **Settings → Printers**:

- **Add printer** to connect another one, the same way as the first time.
- Tap a printer to make it the active one.
- Tap the **pencil** to change its name, address or camera, or the **bin** to remove it.

With two or more printers, tap the printer name at the top of the screen to see all of them
at once and jump between them.

### Using the app

The app has four tabs:

- **Home**: the print in progress, camera, temperatures and fans. Tap a temperature to heat up
  with one of your materials.
- **Control**: move the axes, macros, console, calibrations, bed mesh, smart plugs and the
  config editor.
- **Files**: your G-code files, plus the **History**, **Timelapse** and **Queue** tabs. Tap a
  file to see its details, preview it and print it.
- **Settings**: printers, appearance, materials, notifications, storage and backup.

A few tips:

- Pull down to refresh a list, and swipe a panel down to close it.
- Turn on notifications in **Settings → Notifications** and add the widget to your home
  screen to follow a print without opening the app.
- To reach the printer when you're away from home, see
  [Access your printer from outside home](docs/remote-access.md).

## Supported printers

Printer Hub works with any printer that exposes Moonraker on your network.

| Printer                                                   | Status                       |
| --------------------------------------------------------- | ---------------------------- |
| Creality Hi (rooted)                                      | Tested every release         |
| Creality K1, K1C, K1 Max, K2 (rooted, with Moonraker)     | Should work                  |
| Sovol SV08 and other printers with Klipper out of the box | Should work                  |
| Elegoo Neptune 4 series                                   | Should work                  |
| Voron, RatRig and other self-built Klipper printers       | Should work                  |
| Bambu Lab, Prusa, and printers with stock Marlin firmware | Not supported (no Moonraker) |

Is your printer working, or not? Please [open an issue](https://github.com/KbzonZito/printer-hub/issues)
and tell me the model, so this list can grow.

## Privacy

Printer Hub only talks to your printers, directly on your network or over your own VPN. It has
no account, no analytics, no ads and no server of its own. Your settings and saved previews
stay on the phone, and **Settings → Storage** lets you delete them.

## Contributing

Bug reports and ideas are welcome in the [issues](https://github.com/KbzonZito/printer-hub/issues).
To build the app yourself, see [docs/development.md](docs/development.md).

## License

[MIT](LICENSE) © KbzonZito
