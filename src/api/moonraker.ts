import { request, requestJson } from './http';
import type { Printer } from '../store';

// Moonraker REST API: https://moonraker.readthedocs.io/en/latest/web_api/

export type PrintState = 'standby' | 'printing' | 'paused' | 'complete' | 'cancelled' | 'error';

export interface Heater {
  temperature: number;
  target: number;
}

export interface PrinterStatus {
  klippyState: string;
  state: PrintState;
  message: string;
  filename: string;
  /** File position progress (virtual_sdcard). */
  progress: number;
  /** Progress reported by the printer: M73 from the slicer when present, else file position. */
  displayProgress: number;
  printDuration: number;
  totalDuration: number;
  filamentUsed: number;
  currentLayer: number | null;
  totalLayer: number | null;
  extruder: Heater;
  bed: Heater;
  chamber: Heater | null;
  fanSpeed: number;
  light: { pin: string; on: boolean } | null;
  homedAxes: string;
  position: [number, number, number];
  speedFactor: number;
  extrudeFactor: number;
  zOffset: number;
  canExtrude: boolean;
}

export interface GcodeFile {
  path: string;
  modified: number;
  size: number;
}

export interface FileMetadata {
  estimated_time?: number;
  filament_weight_total?: number;
  filament_total?: number;
  layer_height?: number;
  object_height?: number;
  slicer?: string;
  thumbnails?: { width: number; height: number; relative_path: string }[];
}

export interface Webcam {
  name: string;
  service: string;
  stream_url: string;
  snapshot_url: string;
  enabled?: boolean;
}

interface Envelope<T> {
  result: T;
}

export function baseUrl(p: Printer): string {
  return `http://${p.host}:${p.port}`;
}

function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}

async function get<T>(p: Printer, path: string, timeout?: number): Promise<T> {
  const data = await requestJson<Envelope<T>>(baseUrl(p) + path, { timeout });
  return data.result;
}

async function post<T = unknown>(p: Printer, path: string, timeout?: number): Promise<T> {
  const data = await requestJson<Envelope<T>>(baseUrl(p) + path, { method: 'POST', timeout });
  return data.result;
}

// Object names vary between printers; these are discovered once per printer.
interface Discovered {
  chamber: string | null;
  lightPin: string | null;
  macros: string[];
}
const discovered = new Map<string, Discovered>();

async function discover(p: Printer): Promise<Discovered> {
  const cached = discovered.get(p.id);
  if (cached) return cached;
  const { objects } = await get<{ objects: string[] }>(p, '/printer/objects/list');
  const chamber =
    objects.find((o) => /^(heater_generic|temperature_sensor) .*chamber/i.test(o)) ?? null;
  const light = objects.find((o) => /^output_pin .*(led|light|lamp)/i.test(o)) ?? null;
  const macros = objects
    .filter((o) => o.startsWith('gcode_macro ') && !o.startsWith('gcode_macro _'))
    .map((o) => o.slice('gcode_macro '.length))
    .sort();
  const result = { chamber, lightPin: light, macros };
  discovered.set(p.id, result);
  return result;
}

export async function fetchStatus(p: Printer): Promise<PrinterStatus> {
  const extra = await discover(p).catch(
    () => ({ chamber: null, lightPin: null, macros: [] }) as Discovered,
  );
  const objects = [
    'webhooks',
    'print_stats',
    'virtual_sdcard',
    'display_status',
    'extruder',
    'heater_bed',
    'fan',
    'toolhead',
    'gcode_move',
    extra.chamber,
    extra.lightPin,
  ].filter(Boolean) as string[];
  const query = objects.map(encodeURIComponent).join('&');
  const { status: s } = await get<{ status: Record<string, any> }>(
    p,
    `/printer/objects/query?${query}`,
    5000,
  );
  const ps = s.print_stats ?? {};
  const chamber = extra.chamber ? s[extra.chamber] : null;
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
    light: extra.lightPin
      ? { pin: extra.lightPin.replace(/^output_pin /, ''), on: (s[extra.lightPin]?.value ?? 0) > 0 }
      : null,
    homedAxes: s.toolhead?.homed_axes ?? '',
    position: (s.toolhead?.position?.slice(0, 3) ?? [0, 0, 0]) as [number, number, number],
    speedFactor: s.gcode_move?.speed_factor ?? 1,
    extrudeFactor: s.gcode_move?.extrude_factor ?? 1,
    zOffset: s.gcode_move?.homing_origin?.[2] ?? 0,
    canExtrude: s.extruder?.can_extrude ?? false,
  };
}

export async function testConnection(p: Printer): Promise<string> {
  const info = await get<{ klippy_state: string; moonraker_version?: string }>(
    p,
    '/server/info',
    4000,
  );
  return `Moonraker ${info.moonraker_version ?? ''} · Klipper ${info.klippy_state}`.trim();
}

export const printerActions = {
  pause: (p: Printer) => post(p, '/printer/print/pause'),
  resume: (p: Printer) => post(p, '/printer/print/resume'),
  cancel: (p: Printer) => post(p, '/printer/print/cancel'),
  emergencyStop: (p: Printer) => post(p, '/printer/emergency_stop'),
  firmwareRestart: (p: Printer) => post(p, '/printer/firmware_restart'),
  start: (p: Printer, filename: string) =>
    post(p, `/printer/print/start?filename=${encodeURIComponent(filename)}`),
  gcode: (p: Printer, script: string) =>
    post(p, `/printer/gcode/script?script=${encodeURIComponent(script)}`, 60000),
  setTemp: (p: Printer, heater: 'extruder' | 'heater_bed', target: number) =>
    printerActions.gcode(p, `SET_HEATER_TEMPERATURE HEATER=${heater} TARGET=${target}`),
  setLight: (p: Printer, pin: string, on: boolean) =>
    printerActions.gcode(p, `SET_PIN PIN=${pin} VALUE=${on ? 1 : 0}`),
  home: (p: Printer, axes = '') => printerActions.gcode(p, `G28 ${axes}`.trim()),
  motorsOff: (p: Printer) => printerActions.gcode(p, 'M84'),
  jog: (p: Printer, axis: 'X' | 'Y' | 'Z', distance: number) =>
    printerActions.gcode(
      p,
      `SAVE_GCODE_STATE NAME=_ph_jog\nG91\nG1 ${axis}${distance} F${axis === 'Z' ? 600 : 6000}\nRESTORE_GCODE_STATE NAME=_ph_jog`,
    ),
  extrude: (p: Printer, length: number, speed = 300) =>
    printerActions.gcode(
      p,
      `SAVE_GCODE_STATE NAME=_ph_ext\nM83\nG1 E${length} F${speed}\nRESTORE_GCODE_STATE NAME=_ph_ext`,
    ),
  setSpeedFactor: (p: Printer, percent: number) =>
    printerActions.gcode(p, `M220 S${Math.round(percent)}`),
  setFlowFactor: (p: Printer, percent: number) =>
    printerActions.gcode(p, `M221 S${Math.round(percent)}`),
  adjustZOffset: (p: Printer, delta: number) =>
    printerActions.gcode(p, `SET_GCODE_OFFSET Z_ADJUST=${delta} MOVE=1`),
  setFan: (p: Printer, percent: number) =>
    printerActions.gcode(p, `M106 S${Math.round((percent / 100) * 255)}`),
};

export async function listFiles(p: Printer): Promise<GcodeFile[]> {
  const files = await get<GcodeFile[]>(p, '/server/files/list?root=gcodes');
  return files
    .filter((f) => /\.(gcode|g|gco)$/i.test(f.path))
    .sort((a, b) => b.modified - a.modified);
}

export function fetchMetadata(p: Printer, filename: string): Promise<FileMetadata> {
  return get<FileMetadata>(p, `/server/files/metadata?filename=${encodeURIComponent(filename)}`);
}

export function thumbnailUrl(p: Printer, filename: string, meta?: FileMetadata): string | null {
  const thumbs = meta?.thumbnails;
  if (!thumbs?.length) return null;
  const best = [...thumbs].sort((a, b) => b.width - a.width)[0];
  const dir = filename.includes('/') ? filename.slice(0, filename.lastIndexOf('/') + 1) : '';
  return `${baseUrl(p)}/server/files/gcodes/${encodePath(dir + best.relative_path)}`;
}

export async function deleteFile(p: Printer, filename: string): Promise<void> {
  await request(`${baseUrl(p)}/server/files/gcodes/${encodePath(filename)}`, {
    method: 'DELETE',
  });
}

export async function uploadFile(p: Printer, file: File, print = false): Promise<void> {
  const form = new FormData();
  form.append('file', file, file.name);
  form.append('root', 'gcodes');
  if (print) form.append('print', 'true');
  await request(`${baseUrl(p)}/server/files/upload`, {
    method: 'POST',
    body: form,
    timeout: 10 * 60 * 1000,
  });
}

export async function listWebcams(p: Printer): Promise<Webcam[]> {
  const { webcams } = await get<{ webcams: Webcam[] }>(p, '/server/webcams/list', 4000);
  return webcams.filter((w) => w.enabled !== false);
}

/** Resolves a webcam URL that Moonraker may return relative to the web UI host. */
export function resolveWebcamUrl(p: Printer, url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  return `http://${p.host}${url.startsWith('/') ? '' : '/'}${url}`;
}

export async function listMacros(p: Printer): Promise<string[]> {
  discovered.delete(p.id);
  return (await discover(p)).macros;
}

export interface GcodeLine {
  message: string;
  time: number;
  type: 'command' | 'response';
}

export async function gcodeStore(p: Printer, count = 100): Promise<GcodeLine[]> {
  const { gcode_store } = await get<{ gcode_store: GcodeLine[] }>(
    p,
    `/server/gcode_store?count=${count}`,
  );
  return gcode_store;
}

export interface TempSeries {
  temperatures: number[];
  targets?: number[];
}

/** Last ~20 minutes of 1 s temperature samples, keyed by heater/sensor name. */
export function temperatureStore(p: Printer): Promise<Record<string, TempSeries>> {
  return get(p, '/server/temperature_store?include_monitors=false', 8000);
}

export interface HistoryJob {
  job_id: string;
  filename: string;
  status: string;
  start_time: number;
  end_time: number | null;
  print_duration: number;
  total_duration: number;
  filament_used: number;
  exists?: boolean;
  metadata?: FileMetadata;
}

export interface HistoryTotals {
  total_jobs: number;
  total_time: number;
  total_print_time: number;
  total_filament_used: number;
  longest_job: number;
  longest_print: number;
}

export async function fetchHistory(p: Printer, limit = 50): Promise<HistoryJob[]> {
  const { jobs } = await get<{ jobs: HistoryJob[] }>(
    p,
    `/server/history/list?limit=${limit}&order=desc`,
  );
  return jobs;
}

export async function fetchHistoryTotals(p: Printer): Promise<HistoryTotals> {
  const { job_totals } = await get<{ job_totals: HistoryTotals }>(p, '/server/history/totals');
  return job_totals;
}

export interface TimelapseFile {
  path: string;
  modified: number;
  size: number;
}

/** Timelapse videos from the moonraker-timelapse plugin, if it is installed. */
export async function listTimelapses(p: Printer): Promise<TimelapseFile[]> {
  const roots = await get<{ name: string }[]>(p, '/server/files/roots');
  if (!roots.some((r) => r.name === 'timelapse')) return [];
  const files = await get<TimelapseFile[]>(p, '/server/files/list?root=timelapse');
  return files
    .filter((f) => /\.(mp4|webm|mkv)$/i.test(f.path))
    .sort((a, b) => b.modified - a.modified);
}

export function timelapseUrl(p: Printer, path: string): string {
  return `${baseUrl(p)}/server/files/timelapse/${encodePath(path)}`;
}

export function gcodeFileUrl(p: Printer, path: string): string {
  return `${baseUrl(p)}/server/files/gcodes/${encodePath(path)}`;
}

/** Probes one address for Moonraker; returns the printer's hostname when found. */
export async function probeMoonraker(host: string, port = 7125): Promise<string | null> {
  try {
    const data = await requestJson<Envelope<{ hostname?: string }>>(
      `http://${host}:${port}/printer/info`,
      { timeout: 1500 },
    );
    return data.result.hostname ?? host;
  } catch {
    return null;
  }
}
