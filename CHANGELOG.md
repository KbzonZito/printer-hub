# Changelog

All notable changes to Printer Hub. Versions follow [semantic versioning](https://semver.org):
new features bump the minor number, fixes bump the patch number.

## [Unreleased]

## [0.5.0] - 2026-10-27

### Added
- Android back gesture closes the open panel first, then goes up one folder in Files (or back
  from History / Timelapses), and only then returns to Home.
- Pull down to refresh in Files, History and Timelapses.
- Subtle vibration when pausing, resuming, cancelling or using the emergency stop.
- Camera tab: pinch to zoom, drag to move and double tap to zoom in or out; a button captures
  the current frame and shares it.
- Themed (monochrome) app icon on Android 13+, and a splash screen in the system colors on
  Android 12+.
- Settings backup: export printers, presets and appearance to a JSON file and import it on
  another phone.
- Guide for using the app away from home with Tailscale (docs/remote-access.md, linked in
  About).

### Changed
- Accessibility: the app follows the system font size (up to 130 %), every icon button has a
  label for screen readers, and small controls (segmented buttons, chips, breadcrumbs, links)
  have larger touch areas. Every palette is tested for 4.5:1 text contrast.

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
