import type { PrinterStatus, PrintObject, PrintState } from '../api/moonraker';

// The printer's state as Klipper objects ("raw"), and how it becomes a PrinterStatus.
// Both the periodic HTTP query and the WebSocket subscription feed the same raw objects.

/** Klipper objects by name, e.g. raw.extruder.temperature. */
export type RawStatus = Record<string, Record<string, any>>;

/** Optional objects whose names vary between printers (found in printer.objects.list). */
export interface ObjectNames {
  chamber: string | null;
  lightPin: string | null;
  /** Part cooling fan: "fan", or e.g. "output_pin fan0" on the Creality Hi. */
  fan: string | null;
  /** Full-speed value of an output_pin fan (the Hi's fan0 goes 0–255); 1 for "fan". */
  fanScale: number;
  /** User-facing macros (names starting with "_" are internal). */
  macros: string[];
  /** Klipper's [exclude_object] is enabled (lets you cancel single parts mid-print). */
  excludeObject: boolean;
  /** A Z probe exists (PROBE_CALIBRATE); without one, Z_ENDSTOP_CALIBRATE is used. */
  probe: boolean;
  /** An accelerometer and [resonance_tester] exist (SHAPER_CALIBRATE). */
  shaper: boolean;
}

export function namesFromObjects(objects: string[]): ObjectNames {
  return {
    chamber: objects.find((o) => /^(heater_generic|temperature_sensor) .*chamber/i.test(o)) ?? null,
    lightPin: objects.find((o) => /^output_pin .*(led|light|lamp)/i.test(o)) ?? null,
    fan: objects.includes('fan')
      ? 'fan'
      : (objects.find((o) => /^(output_pin|fan_generic) (fan0|fan|part_fan|part)$/i.test(o)) ??
        null),
    fanScale: 1,
    macros: objects
      .filter((o) => o.startsWith('gcode_macro ') && !o.startsWith('gcode_macro _'))
      .map((o) => o.slice('gcode_macro '.length))
      .sort(),
    excludeObject: objects.includes('exclude_object'),
    probe: objects.some((o) => /^(probe|bltouch|probe_eddy_current|smart_effector)\b/.test(o)),
    shaper: objects.includes('resonance_tester'),
  };
}

/**
 * Objects and fields the app reads. Asking for specific fields (not all of them) keeps
 * Klipper from sending constant updates for values we never show, like
 * toolhead.estimated_print_time.
 */
type StatusNames = Pick<ObjectNames, 'chamber' | 'lightPin' | 'fan' | 'fanScale'> & {
  excludeObject?: boolean;
};

/** The fan's scale comes from the printer config (configfile.settings), when it's a pin. */
export function needsFanScale(names: ObjectNames) {
  return names.fan?.startsWith('output_pin ') ?? false;
}

export function withFanScale(names: ObjectNames, settings: Record<string, any> | undefined) {
  const scale = Number(settings?.[names.fan?.toLowerCase() ?? '']?.scale);
  return scale > 0 ? { ...names, fanScale: scale } : names;
}

export function subscription(names: StatusNames): Record<string, string[]> {
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
    virtual_sdcard: ['progress', 'file_position', 'file_size'],
    display_status: ['progress'],
    extruder: ['temperature', 'target', 'can_extrude'],
    heater_bed: ['temperature', 'target'],
    toolhead: ['homed_axes', 'position', 'axis_minimum', 'axis_maximum'],
    gcode_move: ['speed_factor', 'extrude_factor', 'homing_origin'],
  };
  if (names.chamber) objects[names.chamber] = ['temperature', 'target'];
  if (names.lightPin) objects[names.lightPin] = ['value'];
  if (names.fan) objects[names.fan] = names.fan === 'fan' ? ['speed'] : ['value'];
  if (names.excludeObject)
    objects.exclude_object = ['objects', 'excluded_objects', 'current_object'];
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

/** Klipper's axis limits as [x, y], or null when unknown. */
function xy(v: unknown): [number, number] | null {
  return Array.isArray(v) && typeof v[0] === 'number' && typeof v[1] === 'number'
    ? [v[0], v[1]]
    : null;
}

function parseObjects(raw: unknown): PrintObject[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((o) => o && typeof o.name === 'string')
    .map((o) => ({
      name: o.name,
      center: xy(o.center),
      polygon: Array.isArray(o.polygon)
        ? (o.polygon.map(xy).filter(Boolean) as [number, number][])
        : [],
    }));
}

export function parseStatus(s: RawStatus, names: StatusNames): PrinterStatus {
  const ps = s.print_stats ?? {};
  const chamber = names.chamber ? s[names.chamber] : null;
  const ex = s.exclude_object ?? {};
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
    fanSpeed: !names.fan
      ? 0
      : names.fan === 'fan'
        ? (s.fan?.speed ?? 0)
        : Math.min(1, (s[names.fan]?.value ?? 0) / (names.fanScale || 1)),
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
    objects: parseObjects(ex.objects),
    excludedObjects: Array.isArray(ex.excluded_objects) ? ex.excluded_objects : [],
    currentObject: typeof ex.current_object === 'string' ? ex.current_object : null,
    filePosition: s.virtual_sdcard?.file_position ?? null,
    fileSize: s.virtual_sdcard?.file_size ?? null,
    bedMin: xy(s.toolhead?.axis_minimum),
    bedMax: xy(s.toolhead?.axis_maximum),
  };
}
