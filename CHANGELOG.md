# Changelog

All notable changes to Printer Hub. Versions follow [semantic versioning](https://semver.org):
new features bump the minor number, fixes bump the patch number.

## [Unreleased]

## [0.4.0] - 2026-10-26

First numbered release.

### Printer
- Dashboard with status, progress, layer, remaining time and finish time (slicer, M73, file
  or filament based), temperatures, fan, light, pause / resume / cancel, homing and
  emergency stop.
- Preheat button and editable preheat presets (nozzle and bed per material).
- Live tuning while printing: speed, flow, Z offset and part fan.
- Temperature chart for the last 5, 10 or 20 minutes.
- Camera: Creality WebRTC, Moonraker webcams or MJPEG, full screen in landscape.
- Control: jog, homing, extrude / retract, macros and G-code console.

### Files
- Folders: browse, create, rename, move and delete.
- Sort by date, name or size; list or grid view.
- File details with a time estimate adjusted with your print history.
- Upload G-code, or share a .gcode from another app to upload or print it.
- Print history with totals, and timelapses.

### Connection
- Real-time updates over Moonraker's WebSocket instead of polling every 2 seconds. On Android the
  connection is opened natively, so it works even when the printer's `cors_domains` doesn't
  allow the app (as on the Creality Hi). If the WebSocket can't be used, the app falls back to
  polling by itself.
- Reconnects automatically (also when coming back to the app) and shows "Reconnecting…" with a
  retry button when the printer can't be reached.
- A dedicated screen when Klipper is starting, shut down, in error or not running, with
  "Restart firmware" and "Restart Klipper".
- The console shows responses instantly, and files and history refresh when they change on the
  printer.
- Fixed the part fan always showing 0% on the Creality Hi; the Timelapse tab only appears when
  the printer has the timelapse plugin.

### App
- Welcome wizard on first launch: welcome screen, appearance, notifications and a guided
  "add your printer" step (network scan or IP with help, connection check, camera detection
  and name). It can be reopened from Settings, and "Add printer" uses the same guide.
- Material 3 design with dynamic color (device color or presets) and palette styles.
- Floating navigation bar on phones, navigation rail on tablets.
- Notifications when a print finishes, pauses or fails, and a home screen widget.
- Network discovery, several printers, English and Spanish, light and dark themes.
