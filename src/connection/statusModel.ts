import type { PrinterStatus, PrintState } from '../api/moonraker';

// The printer's state as Klipper objects ("raw"), and how it becomes a PrinterStatus.
// Both the periodic HTTP query and the WebSocket subscription feed the same raw objects.

/** Klipper objects by name, e.g. raw.extruder.temperature. */
export type RawStatus = Record<string, Record<string, any>>;

/** Optional objects whose names vary between printers (found in printer.objects.list). */
export interface ObjectNames {
  chamber: string | null;
  lightPin: string | null;
}

/**
 * Objects and fields the app reads. Asking for specific fields (not all of them) keeps
 * Klipper from sending constant updates for values we never show, like
 * toolhead.estimated_print_time.
 */
export function subscription(names: ObjectNames): Record<string, string[]> {
  const objects: Record<string, string[]> = {
    webhooks: ['state', 'state_message'],
    print_stats: [
      'state',
      'message',
      'filename',
      'print_duration',
      'total_duration',
      'filament_used',
      'info',
    ],
    virtual_sdcard: ['progress'],
    display_status: ['progress'],
    extruder: ['temperature', 'target', 'can_extrude'],
    heater_bed: ['temperature', 'target'],
    fan: ['speed'],
    toolhead: ['homed_axes', 'position'],
    gcode_move: ['speed_factor', 'extrude_factor', 'homing_origin'],
  };
  if (names.chamber) objects[names.chamber] = ['temperature', 'target'];
  if (names.lightPin) objects[names.lightPin] = ['value'];
  return objects;
}

/** The same subscription as a /printer/objects/query string: "extruder=temperature,target&…". */
export function queryString(objects: Record<string, string[]>): string {
  return Object.entries(objects)
    .map(([name, fields]) => `${encodeURIComponent(name)}=${fields.join(',')}`)
    .join('&');
}

/**
 * Applies an update to the raw status. Klipper sends only the fields that changed, but each
 * changed field arrives whole, so values are replaced (not merged deeper): a merge inside
 * print_stats.info could keep keys that no longer exist.
 */
export function mergeStatus(raw: RawStatus, update: RawStatus): RawStatus {
  const next = { ...raw };
  for (const [name, fields] of Object.entries(update)) {
    next[name] = { ...raw[name], ...fields };
  }
  return next;
}

export function parseStatus(s: RawStatus, names: ObjectNames): PrinterStatus {
  const ps = s.print_stats ?? {};
  const chamber = names.chamber ? s[names.chamber] : null;
  return {
    klippyState: s.webhooks?.state ?? 'unknown',
    state: (ps.state ?? 'standby') as PrintState,
    message: ps.message || s.webhooks?.state_message || '',
    filename: ps.filename ?? '',
    progress: s.virtual_sdcard?.progress ?? s.display_status?.progress ?? 0,
    displayProgress: s.display_status?.progress ?? s.virtual_sdcard?.progress ?? 0,
    printDuration: ps.print_duration ?? 0,
    totalDuration: ps.total_duration ?? 0,
    filamentUsed: ps.filament_used ?? 0,
    currentLayer: ps.info?.current_layer ?? null,
    totalLayer: ps.info?.total_layer ?? null,
    extruder: { temperature: s.extruder?.temperature ?? 0, target: s.extruder?.target ?? 0 },
    bed: { temperature: s.heater_bed?.temperature ?? 0, target: s.heater_bed?.target ?? 0 },
    chamber: chamber
      ? { temperature: chamber.temperature ?? 0, target: chamber.target ?? 0 }
      : null,
    fanSpeed: s.fan?.speed ?? 0,
    light: names.lightPin
      ? {
          pin: names.lightPin.replace(/^output_pin /, ''),
          on: (s[names.lightPin]?.value ?? 0) > 0,
        }
      : null,
    homedAxes: s.toolhead?.homed_axes ?? '',
    position: (s.toolhead?.position?.slice(0, 3) ?? [0, 0, 0]) as [number, number, number],
    speedFactor: s.gcode_move?.speed_factor ?? 1,
    extrudeFactor: s.gcode_move?.extrude_factor ?? 1,
    zOffset: s.gcode_move?.homing_origin?.[2] ?? 0,
    canExtrude: s.extruder?.can_extrude ?? false,
  };
}
