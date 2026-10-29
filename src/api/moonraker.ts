import { request, requestJson } from './http';
import type { Printer } from '../store';
import {
  namesFromObjects,
  queryString,
  type ObjectNames,
  type RawStatus,
} from '../connection/statusModel';

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
  /** Parts the slicer labelled in the G-code (Klipper's exclude_object). */
  objects: PrintObject[];
  excludedObjects: string[];
  currentObject: string | null;
  /** Bed limits (toolhead axis_minimum / axis_maximum), for drawing the bed. */
  bedMin: [number, number] | null;
  bedMax: [number, number] | null;
}

export interface PrintObject {
  name: string;
  center: [number, number] | null;
  /** Outline on the bed in mm; may be empty if the slicer only gave a center. */
  polygon: [number, number][];
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
  filament_type?: string;
  filament_name?: string;
  first_layer_extr_temp?: number;
  first_layer_bed_temp?: number;
  nozzle_diameter?: number;
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

export async function get<T>(p: Printer, path: string, timeout?: number): Promise<T> {
  const data = await requestJson<Envelope<T>>(baseUrl(p) + path, { timeout });
  return data.result;
}

export async function post<T = unknown>(p: Printer, path: string, timeout?: number): Promise<T> {
  const data = await requestJson<Envelope<T>>(baseUrl(p) + path, { method: 'POST', timeout });
  return data.result;
}

export async function del<T = unknown>(p: Printer, path: string): Promise<T> {
  const data = await requestJson<Envelope<T>>(baseUrl(p) + path, { method: 'DELETE' });
  return data.result;
}

// Object names vary between printers; these are discovered once per printer.
type Discovered = ObjectNames;
const discovered = new Map<string, Discovered>();

async function discover(p: Printer): Promise<Discovered> {
  const cached = discovered.get(p.id);
  if (cached) return cached;
  const { objects } = await get<{ objects: string[] }>(p, '/printer/objects/list');
  const result = namesFromObjects(objects);
  discovered.set(p.id, result);
  return result;
}

export interface ServerInfo {
  klippy_state: 'ready' | 'startup' | 'shutdown' | 'error' | 'disconnected' | string;
  klippy_connected?: boolean;
  components?: string[];
  moonraker_version?: string;
  api_version_string?: string;
}

export interface KlippyInfo {
  state?: string;
  state_message?: string;
  hostname?: string;
  software_version?: string;
}

export function websocketUrl(p: Printer): string {
  return `ws://${p.host}:${p.port}/websocket`;
}

export const fetchServerInfo = (p: Printer) => get<ServerInfo>(p, '/server/info', 5000);
export const fetchPrinterInfo = (p: Printer) => get<KlippyInfo>(p, '/printer/info', 5000);
export const fetchObjectList = async (p: Printer) =>
  (await get<{ objects: string[] }>(p, '/printer/objects/list', 5000)).objects;
export const queryObjects = async (p: Printer, objects: Record<string, string[]>) =>
  (await get<{ status: RawStatus }>(p, `/printer/objects/query?${queryString(objects)}`, 5000))
    .status;

export async function testConnection(p: Printer): Promise<string> {
  const info = await get<{ klippy_state: string; moonraker_version?: string }>(
    p,
    '/server/info',
    4000,
  );
  return `Moonraker ${info.moonraker_version ?? ''} · Klipper ${info.klippy_state}`.trim();
}

export const printerActions = {
  excludeObject: (p: Printer, name: string) =>
    printerActions.gcode(p, `EXCLUDE_OBJECT NAME=${name}`),
  pause: (p: Printer) => post(p, '/printer/print/pause'),
  resume: (p: Printer) => post(p, '/printer/print/resume'),
  cancel: (p: Printer) => post(p, '/printer/print/cancel'),
  emergencyStop: (p: Printer) => post(p, '/printer/emergency_stop'),
  firmwareRestart: (p: Printer) => post(p, '/printer/firmware_restart'),
  restartKlipper: (p: Printer) => post(p, '/printer/restart'),
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

export interface GcodeDir {
  name: string;
  /** Path relative to the gcodes root. */
  path: string;
  modified: number;
  size: number;
}

const GCODE_EXT = /\.(gcode|g|gco)$/i;
const joinPath = (dir: string, name: string) => (dir ? `${dir}/${name}` : name);

/** One folder of the gcodes root: its subfolders and G-code files. */
export async function listDirectory(
  p: Printer,
  dir: string,
): Promise<{ dirs: GcodeDir[]; files: GcodeFile[] }> {
  const res = await get<{
    dirs: { dirname: string; modified: number; size: number }[];
    files: { filename: string; modified: number; size: number }[];
  }>(p, `/server/files/directory?path=${encodeURIComponent(joinPath('gcodes', dir))}`);
  return {
    dirs: res.dirs
      .filter((d) => !d.dirname.startsWith('.'))
      .map((d) => ({ ...d, name: d.dirname, path: joinPath(dir, d.dirname) })),
    files: res.files
      .filter((f) => GCODE_EXT.test(f.filename))
      .map((f) => ({ path: joinPath(dir, f.filename), modified: f.modified, size: f.size })),
  };
}

export async function createDirectory(p: Printer, path: string): Promise<void> {
  await post(p, `/server/files/directory?path=${encodeURIComponent(`gcodes/${path}`)}`);
}

export async function deleteDirectory(p: Printer, path: string): Promise<void> {
  await request(
    `${baseUrl(p)}/server/files/directory?path=${encodeURIComponent(`gcodes/${path}`)}&force=true`,
    { method: 'DELETE' },
  );
}

/** Moves or renames a file or folder inside the gcodes root. */
export async function moveItem(p: Printer, source: string, dest: string): Promise<void> {
  const q = `source=${encodeURIComponent(`gcodes/${source}`)}&dest=${encodeURIComponent(`gcodes/${dest}`)}`;
  await post(p, `/server/files/move?${q}`);
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

export async function uploadFile(p: Printer, file: File, print = false, dir = ''): Promise<void> {
  const form = new FormData();
  form.append('file', file, file.name);
  form.append('root', 'gcodes');
  if (dir) form.append('path', dir);
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
/**
 * Where a still frame of the camera may be, best first: the custom URL (as a snapshot), the
 * webcams configured in Moonraker, then mjpg-streamer's default port. The Creality WebRTC
 * camera has no still frames, so the background service falls back to the G-code thumbnail.
 */
export async function snapshotUrls(p: Printer): Promise<string[]> {
  const urls: string[] = [];
  const custom = p.cameraUrl.trim();
  if (custom) urls.push(custom.replace('action=stream', 'action=snapshot'));
  try {
    for (const cam of await listWebcams(p))
      if (cam.snapshot_url && !/webrtc/i.test(cam.service))
        urls.push(resolveWebcamUrl(p, cam.snapshot_url));
  } catch {
    /* Moonraker webcam API unavailable */
  }
  urls.push(`http://${p.host}:8080/?action=snapshot`);
  return [...new Set(urls)];
}

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

/** Newest first; `since` (Unix seconds) limits it to jobs started after that. */
export async function fetchHistory(p: Printer, limit = 50, since?: number): Promise<HistoryJob[]> {
  const { jobs } = await get<{ jobs: HistoryJob[] }>(
    p,
    `/server/history/list?limit=${limit}&order=desc${since ? `&since=${Math.floor(since)}` : ''}`,
    15000,
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

export interface SystemVersions {
  hostname?: string;
  klipper?: string;
  moonraker?: string;
}

export async function fetchVersions(p: Printer): Promise<SystemVersions> {
  const [printer, server] = await Promise.all([
    get<{ hostname?: string; software_version?: string }>(p, '/printer/info').catch(() => null),
    get<{ moonraker_version?: string }>(p, '/server/info').catch(() => null),
  ]);
  return {
    hostname: printer?.hostname,
    klipper: printer?.software_version,
    moonraker: server?.moonraker_version,
  };
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
