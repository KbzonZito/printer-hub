# Changelog

All notable changes to Printer Hub. Versions follow [semantic versioning](https://semver.org):
new features bump the minor number, fixes bump the patch number.

## [Unreleased]

## [0.8.0] - 2026-10-29

### Added
- G-code preview: "Preview" in a file's details shows it layer by layer, with
  colors by line type. Layers appear while the file downloads, and a file opens instantly the
  second time. An info panel shows the download and parse times.
- Live G-code view: "Current layer" on Home while printing follows the layer being printed,
  with what's done in full color, what's left faint, the nozzle and excluded parts crossed
  out. On big files it loads the part being printed first, so it shows in a few seconds.
- G-code preview: pinch or double tap to zoom (lines stay sharp), layer below and travel moves
  on or off, "By filament" colors for multicolor prints, and arrow keys to change the layer.
- Files from slicers Moonraker doesn't recognise (Creality Print on the Creality Hi) now show
  their thumbnail, estimated time, filament, temperatures and slicer, read from the file itself.
- Settings → Storage: space used by saved G-code previews, a button to delete them, and
  automatic deletion of previews not opened for a week or a month (the default).
- Exclude objects: while printing a plate with several parts, "Objects" on Home opens a bed
  map; tap a part (or pick it from the list) and confirm to stop printing it. Excluded parts
  stay drawn, crossed out. Needs [exclude_object] and a slicer that labels objects.
- Notifications for finished, paused, cancelled or failed prints include a photo: a camera
  still frame when the camera has one, otherwise the file's thumbnail.
- Android 16: the print progress notification uses the new progress style, with the
  percentage in the status bar and a countdown to the finish time (a "Live Update" on
  Android 16 QPR2 and later).
- Quick Settings tile with the printer's state and progress; tap it to open the app.
- Guided calibrations in Control: nozzle and bed PID, Z offset with the paper test, and input
  shaper (when the printer has an accelerometer). Each one explains what will happen, shows
  the result and lets you save it (SAVE_CONFIG) or discard it.
- All printers: with more than one printer, tap the name at the top to see them all with
  their camera, state, progress and temperatures, and tap one to switch to it.

## [0.6.0] - 2026-10-27

### Changed
- The emergency stop is a red button always visible in the top-right corner, on every tab.
- The Camera tab is gone: tap the camera on Home to open it full screen, with zoom, capture,
  camera mode, reconnect and the print status. The navigation bar has four tabs.
- Panels (bottom sheets) can be closed by swiping them down.
- About has a "Buy me a coffee" button (the link will be added once the account is ready).

### Fixed
- Buttons in rows ("Motors off", "Emergency stop"…) cut their label on narrow phones; now
  they move to the next line.

### Added
- Print queue (when Moonraker has job_queue): "Add to queue" in a file's details, and a Queue
  tab in Files to start / pause it, reorder, remove or clear jobs.
- Optional notification when the first layer is done (Settings → Notifications).
- Widget: follows the system colors on Android 12+, and when resized to two rows or more it
  shows the thumbnail of the file being printed.
- Spoolman (when installed): active spool with its remaining weight on Home, tap to change
  it, and a warning before printing a file that needs more filament than the spool has.
- Statistics from the history: prints, hours, filament and success rate per week or month,
  with a bar chart.
- Bed mesh in Control: heatmap with the maximum difference, a flatness rating, and buttons
  to calibrate it and save it (SAVE_CONFIG).
- Smart plugs (Moonraker power devices): switch them on / off from Control, also from the
  "Klipper disconnected" screen; on Android they can switch off by themselves when a print
  finishes and the nozzle is below 50 °C.
- Klipper config editor in Control: open printer.cfg and the other config files, edit,
  save, and optionally restart the firmware. Read-only files can't be edited.
- Print cost: set a price per kg in each preheat preset (and your currency symbol), and file
  details and history show what each print costs, matched by the file's material.

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
