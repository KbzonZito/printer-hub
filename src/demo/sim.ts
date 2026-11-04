import { generateGcode, objectDefinitions } from './gcodeGen';

// The demo printer: Moonraker + Klipper simulated inside the app, for trying Printer Hub
// without a printer (and for Google Play's reviewers). A smaller cousin of
// scripts/mock-moonraker.mjs, without its failure scenarios. HTTP requests (demoFetch) and
// the JSON-RPC socket (demoTransport) read the same simulated printer.

const now = () => Date.now() / 1000;
const LIGHT = 'output_pin LED';
const CHAMBER = 'temperature_sensor chamber_temp';
const OBJECTS = [
  'webhooks',
  'print_stats',
  'virtual_sdcard',
  'display_status',
  'extruder',
  'heater_bed',
  'fan',
  'toolhead',
  'gcode_move',
  'idle_timeout',
  'exclude_object',
  'bed_mesh',
  'probe',
  'manual_probe',
  'resonance_tester',
  'adxl345',
  LIGHT,
  CHAMBER,
  'gcode_macro LOAD_FILAMENT',
  'gcode_macro UNLOAD_FILAMENT',
  'gcode_macro PRINT_START',
];
const COMPONENTS = [
  'klippy_connection',
  'file_manager',
  'history',
  'webcam',
  'job_queue',
  'authorization',
  'spoolman',
  'power',
];

type Obj = Record<string, unknown>;
type Query = Record<string, string>;

class RpcError extends Error {
  constructor(
    readonly code: number,
    message: string,
  ) {
    super(message);
  }
}

// ---------------------------------------------------------------- files

interface DemoFile {
  path: string;
  modified: number;
  /** Size of the generated G-code, in MB. */
  mb: number;
  tools?: number;
  time: number;
  grams: number;
  material: string;
  color: string;
}

const FILES: DemoFile[] = [
  {
    path: 'Benchy_PLA_0.2mm.gcode',
    modified: now() - 3600,
    mb: 1.5,
    time: 6540,
    grams: 14.2,
    material: 'PLA',
    color: '#ff7a1a',
  },
  {
    path: 'models/Phone_stand.gcode',
    modified: now() - 86400,
    mb: 2,
    tools: 2,
    time: 10800,
    grams: 32.5,
    material: 'PETG',
    color: '#2d9cdb',
  },
  {
    path: 'models/Cable_clips.gcode',
    modified: now() - 3 * 86400,
    mb: 0.6,
    time: 2100,
    grams: 5.1,
    material: 'PLA',
    color: '#27ae60',
  },
  {
    path: 'Calibration_cube.gcode',
    modified: now() - 5 * 86400,
    mb: 0.8,
    time: 1500,
    grams: 7.8,
    material: 'PLA',
    color: '#eb5757',
  },
];
const files = [...FILES];
const dirs = new Set(['models']);
/** G-code of each file, generated the first time it's needed. */
const gcode = new Map<string, Uint8Array>();
const uploads = new Map<string, Uint8Array>();

function gcodeFor(path: string): Uint8Array | null {
  const uploaded = uploads.get(path);
  if (uploaded) return uploaded;
  let data = gcode.get(path);
  if (!data) {
    const f = files.find((x) => x.path === path);
    if (!f) return null;
    data = new TextEncoder().encode(generateGcode(f.mb, { tools: f.tools ?? 1 }));
    gcode.set(path, data);
  }
  return data;
}

function layersOf(data: Uint8Array): number {
  const head = new TextDecoder().decode(data.subarray(0, 400));
  return Number(/total layer number: (\d+)/.exec(head)?.[1] ?? 100);
}

/** A small picture of the part, in the file's color. */
function thumbnail(color: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300"><rect width="300" height="300" fill="#1e2228"/><ellipse cx="150" cy="235" rx="110" ry="22" fill="#2c323b"/><path d="M70 230 L95 120 L205 120 L230 230 Z" fill="${color}"/><path d="M95 120 L120 70 L180 70 L205 120 Z" fill="${color}" opacity=".75"/><rect x="128" y="40" width="44" height="30" rx="4" fill="${color}" opacity=".55"/></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function metadata(path: string): Obj {
  const f = files.find((x) => x.path === path);
  if (!f) throw new RpcError(404, `File ${path} not found`);
  return {
    size: gcode.get(path)?.length ?? Math.round(f.mb * 1e6),
    modified: f.modified,
    estimated_time: f.time,
    filament_weight_total: f.grams,
    filament_total: Math.round(f.grams * 330),
    filament_type: f.material,
    filament_name: `Demo ${f.material}`,
    first_layer_extr_temp: f.material === 'PETG' ? 240 : 210,
    first_layer_bed_temp: f.material === 'PETG' ? 75 : 60,
    object_height: 48,
    layer_height: 0.2,
    nozzle_diameter: 0.4,
    slicer: 'Creality Print',
    thumbnail_data: thumbnail(f.color),
  };
}

// ---------------------------------------------------------------- printer

function mockMesh() {
  const n = 7;
  const matrix = Array.from({ length: n }, (_row, y) =>
    Array.from({ length: n }, (_col, x) => {
      const dx = x / (n - 1) - 0.5;
      const dy = y / (n - 1) - 0.5;
      return Math.round((0.18 * (dx * dx + dy * dy) - 0.06 * dx + 0.04 * dy - 0.02) * 1000) / 1000;
    }),
  );
  return {
    profile_name: 'default',
    mesh_min: [10, 10],
    mesh_max: [250, 250],
    probed_matrix: matrix,
    mesh_matrix: matrix,
    profiles: { default: { points: matrix, mesh_params: {} } },
  };
}

function freshObjects() {
  const objects = objectDefinitions();
  return { objects, excluded_objects: [] as string[], current_object: objects[0].name };
}

const klippy = { state: 'ready', message: 'Printer is ready' };
const printer = {
  webhooks: { state: 'ready', state_message: 'Printer is ready' },
  print_stats: {
    state: 'printing',
    filename: FILES[0].path,
    print_duration: 2400,
    total_duration: 2460,
    filament_used: 2345,
    message: '',
    info: { current_layer: 1, total_layer: 100 },
  },
  virtual_sdcard: { progress: 0.36, is_active: true, file_position: 0, file_size: 0 },
  display_status: { progress: 0.36, message: null },
  extruder: { temperature: 209.6, target: 210, power: 0.4, can_extrude: true },
  heater_bed: { temperature: 59.8, target: 60, power: 0.2 },
  fan: { speed: 1 },
  toolhead: {
    homed_axes: 'xyz',
    position: [120.5, 98.2, 7.2, 0],
    estimated_print_time: 0,
    axis_minimum: [-2, -2, 0, 0],
    axis_maximum: [262, 262, 300, 0],
  },
  gcode_move: { speed_factor: 1, extrude_factor: 1, homing_origin: [0, 0, 0, 0] },
  idle_timeout: { state: 'Printing' },
  exclude_object: freshObjects(),
  bed_mesh: mockMesh(),
  manual_probe: {
    is_active: false,
    z_position: null as number | null,
    z_position_lower: null,
    z_position_upper: null,
  },
  [LIGHT]: { value: 1 },
  [CHAMBER]: { temperature: 31.2 },
} as Record<string, Obj> & {
  print_stats: {
    state: string;
    filename: string;
    print_duration: number;
    total_duration: number;
    filament_used: number;
    message: string;
    info: { current_layer: number; total_layer: number };
  };
  virtual_sdcard: {
    progress: number;
    is_active: boolean;
    file_position: number;
    file_size: number;
  };
  display_status: { progress: number; message: null };
  extruder: { temperature: number; target: number; power: number; can_extrude: boolean };
  heater_bed: { temperature: number; target: number; power: number };
  toolhead: { position: number[]; estimated_print_time: number } & Obj;
  idle_timeout: { state: string };
  exclude_object: ReturnType<typeof freshObjects>;
  manual_probe: { is_active: boolean; z_position: number | null } & Obj;
};

const gcodeStore = [
  { message: 'G28', time: now() - 60, type: 'command' },
  { message: '// Homing done', time: now() - 59, type: 'response' },
];

interface Job {
  job_id: string;
  filename: string;
  status: string;
  start_time: number;
  end_time: number;
  print_duration: number;
  total_duration: number;
  filament_used: number;
  exists: boolean;
  metadata?: Obj;
}

/** Three months of past prints for the history and statistics (always the same). */
const history: Job[] = (() => {
  let seed = 7;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const out: Job[] = [];
  for (let i = 0; i < 70; i++) {
    const r = rand();
    const status = r < 0.82 ? 'completed' : r < 0.93 ? 'cancelled' : 'error';
    const f = FILES[i % FILES.length];
    const duration = Math.round(f.time * (0.9 + rand() * 0.2));
    const start = now() - (1 + i * 1.3) * 86400;
    out.push({
      job_id: String(100 + i),
      filename: f.path,
      status,
      start_time: start,
      end_time: start + duration,
      print_duration: status === 'completed' ? duration : Math.round(duration * rand()),
      total_duration: duration + 120,
      filament_used: Math.round(f.grams * 330),
      exists: true,
      metadata: {
        estimated_time: f.time,
        filament_type: f.material,
        filament_weight_total: f.grams,
        thumbnail_data: thumbnail(f.color),
      },
    });
  }
  return out;
})();
let nextJob = 200;

/** X/Y of the last move with both, just before byte `pos` (for the toolhead). */
function positionAt(data: Uint8Array, pos: number): [number, number] | null {
  const lines = new TextDecoder().decode(data.subarray(Math.max(0, pos - 4000), pos)).split('\n');
  // The first piece may be a cut line; skip it.
  for (let i = lines.length - 1; i > 0; i--) {
    const l = lines[i];
    if (!/^G[0-3] /.test(l)) continue;
    const x = / X(-?[\d.]+)/.exec(l)?.[1];
    const y = / Y(-?[\d.]+)/.exec(l)?.[1];
    if (x != null && y != null) return [Number(x), Number(y)];
  }
  return null;
}

function startPrint(filename: string) {
  const data = gcodeFor(filename);
  if (!data) throw new RpcError(404, `File ${filename} not found`);
  const f = files.find((x) => x.path === filename);
  Object.assign(printer.print_stats, {
    state: 'printing',
    filename,
    print_duration: 0,
    total_duration: 0,
    filament_used: 0,
    message: '',
    info: { current_layer: 1, total_layer: layersOf(data) },
  });
  Object.assign(printer.virtual_sdcard, {
    progress: 0,
    is_active: true,
    file_position: 0,
    file_size: data.length,
  });
  printer.display_status.progress = 0;
  printer.extruder.target = f?.material === 'PETG' ? 240 : 210;
  printer.heater_bed.target = f?.material === 'PETG' ? 75 : 60;
  printer.idle_timeout.state = 'Printing';
  // A new print starts with every object included again, like Klipper.
  printer.exclude_object = freshObjects();
}

function endPrint(status: 'complete' | 'cancelled') {
  const ps = printer.print_stats;
  ps.state = status;
  printer.virtual_sdcard.is_active = false;
  printer.extruder.target = 0;
  printer.heater_bed.target = 0;
  printer.idle_timeout.state = 'Idle';
  const f = files.find((x) => x.path === ps.filename);
  history.unshift({
    job_id: String(nextJob++),
    filename: ps.filename,
    status: status === 'complete' ? 'completed' : 'cancelled',
    start_time: now() - ps.total_duration,
    end_time: now(),
    print_duration: ps.print_duration,
    total_duration: ps.total_duration,
    filament_used: ps.filament_used,
    exists: true,
    metadata: f ? { filament_type: f.material, thumbnail_data: thumbnail(f.color) } : undefined,
  });
  broadcast('notify_history_changed', [{ action: 'finished' }]);
}

function setKlippy(state: string, message: string) {
  // Klipper restarts drop subscriptions; clients subscribe again after notify_klippy_ready.
  if (state !== 'ready') clients.forEach((c) => (c.subscription = null));
  klippy.state = state;
  klippy.message = message;
  printer.webhooks = { state, state_message: message };
  broadcast(
    state === 'ready'
      ? 'notify_klippy_ready'
      : state === 'shutdown'
        ? 'notify_klippy_shutdown'
        : 'notify_klippy_disconnected',
  );
}

function restartKlippy() {
  if (printer.print_stats.state === 'printing' || printer.print_stats.state === 'paused')
    endPrint('cancelled');
  setKlippy('startup', 'Klipper is starting');
  setTimeout(() => setKlippy('ready', 'Printer is ready'), 3000);
}

function respond(line: string) {
  gcodeStore.push({ message: line, time: now(), type: 'response' });
  broadcast('notify_gcode_response', [line]);
}

function runGcode(script: string) {
  for (const cmd of script
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)) {
    gcodeStore.push({ message: cmd, time: now(), type: 'command' });
    const heater = /SET_HEATER_TEMPERATURE HEATER=(\w+) TARGET=([\d.]+)/i.exec(cmd);
    const m104 = /^M10[49] S([\d.]+)/i.exec(cmd);
    const m140 = /^M1(40|90) S([\d.]+)/i.exec(cmd);
    const fan = /^M106(?: S([\d.]+))?/i.exec(cmd);
    const speed = /^M220 S([\d.]+)/i.exec(cmd);
    const flow = /^M221 S([\d.]+)/i.exec(cmd);
    const pin = /^SET_PIN PIN=(\S+) VALUE=([\d.]+)/i.exec(cmd);
    const offset = /^SET_GCODE_OFFSET .*Z(?:_ADJUST)?=(-?[\d.]+)/i.exec(cmd);
    if (heater && printer[heater[1]]) printer[heater[1]].target = Number(heater[2]);
    else if (m104) printer.extruder.target = Number(m104[1]);
    else if (m140) printer.heater_bed.target = Number(m140[2]);
    else if (fan) printer.fan = { speed: Math.min(1, Number(fan[1] ?? 255) / 255) };
    else if (/^M107/i.test(cmd)) printer.fan = { speed: 0 };
    else if (speed)
      printer.gcode_move = { ...printer.gcode_move, speed_factor: Number(speed[1]) / 100 };
    else if (flow)
      printer.gcode_move = { ...printer.gcode_move, extrude_factor: Number(flow[1]) / 100 };
    else if (pin && printer[`output_pin ${pin[1]}`])
      printer[`output_pin ${pin[1]}`] = { value: Number(pin[2]) };
    else if (offset) {
      const origin = [...(printer.gcode_move.homing_origin as number[])];
      origin[2] = /Z_ADJUST/i.test(cmd) ? origin[2] + Number(offset[1]) : Number(offset[1]);
      origin[2] = Math.round(origin[2] * 1000) / 1000;
      printer.gcode_move = { ...printer.gcode_move, homing_origin: origin };
    } else if (/^G28/i.test(cmd)) printer.toolhead.homed_axes = 'xyz';
    else if (/^FIRMWARE_RESTART|^RESTART/i.test(cmd)) return restartKlippy();
    else if (/^BED_MESH_CALIBRATE/i.test(cmd)) printer.bed_mesh = mockMesh();
    else if (/^PID_CALIBRATE/i.test(cmd)) {
      for (let i = 1; i <= 3; i++)
        respond(`// sample:${i} pwm:1.0000 asymmetry:0.2${i} tolerance:n/a`);
      respond('// PID parameters: pid_Kp=22.865 pid_Ki=1.574 pid_Kd=83.052');
      respond(
        '// The SAVE_CONFIG command will update the printer config file with these parameters and restart the printer.',
      );
    } else if (/^SHAPER_CALIBRATE/i.test(cmd)) {
      respond('// Fitted shaper zv frequency = 56.4 Hz (vibrations = 9.1%, smoothing ~= 0.044)');
      respond('// Recommended shaper_type_x = mzv, shaper_freq_x = 53.8 Hz');
      respond('// Recommended shaper_type_y = ei, shaper_freq_y = 61.2 Hz');
    } else if (/^(PROBE_CALIBRATE|Z_ENDSTOP_CALIBRATE)/i.test(cmd)) {
      Object.assign(printer.manual_probe, { is_active: true, z_position: 5 });
      respond('// Starting manual Z probe. Use TESTZ to adjust position.');
    } else if (/^TESTZ Z=(-?[\d.]+)/i.test(cmd)) {
      const mp = printer.manual_probe;
      if (!mp.is_active) {
        respond('!! Manual probe not active');
        continue;
      }
      const dz = Number(/Z=(-?[\d.]+)/i.exec(cmd)![1]);
      mp.z_position = Math.round(((mp.z_position ?? 0) + dz) * 1000) / 1000;
      respond(`// Z position: ${mp.z_position.toFixed(3)}`);
    } else if (/^ACCEPT/i.test(cmd)) {
      const mp = printer.manual_probe;
      respond(`// probe: z_offset: ${(mp.z_position ?? 0).toFixed(3)}`);
      respond(
        '// The SAVE_CONFIG command will update the printer config file and restart the printer.',
      );
      Object.assign(mp, { is_active: false, z_position: null });
    } else if (/^ABORT/i.test(cmd)) {
      Object.assign(printer.manual_probe, { is_active: false, z_position: null });
      respond('// Manual probe aborted');
    } else if (/^SAVE_CONFIG/i.test(cmd)) return restartKlippy();
    else if (/^EXCLUDE_OBJECT NAME=(\S+)/i.test(cmd)) {
      const name = /NAME=(\S+)/i.exec(cmd)![1].toUpperCase();
      const ex = printer.exclude_object;
      if (!ex.objects.some((o) => o.name === name)) {
        respond(`!! Unknown object name "${name}"`);
        continue;
      }
      ex.excluded_objects = [...new Set([...ex.excluded_objects, name])];
      respond(`// Excluding object ${name}`);
    } else if (/^M115/i.test(cmd))
      respond('// FIRMWARE_NAME:Klipper FIRMWARE_VERSION:v0.12.0-demo');
    respond('ok');
  }
}

/** Physics, 4 times a second: heaters drift to their targets and the print advances. */
function tick() {
  for (const h of [printer.extruder, printer.heater_bed]) {
    const goal = h.target || 25;
    h.temperature += (goal - h.temperature) * 0.08 + (Math.random() - 0.5) * 0.3;
    h.temperature = Math.round(h.temperature * 10) / 10;
    h.power = h.target ? Math.max(0, Math.min(1, (goal - h.temperature) / 20 + 0.3)) : 0;
  }
  const ps = printer.print_stats;
  if (klippy.state === 'ready' && ps.state === 'printing') {
    ps.print_duration += 0.25;
    ps.total_duration += 0.25;
    ps.filament_used += 0.4;
    // A whole print takes about an hour and a half.
    const sd = printer.virtual_sdcard;
    const p = Math.min(1, sd.progress + 0.00005 * Number(printer.gcode_move.speed_factor ?? 1));
    sd.progress = printer.display_status.progress = p;
    const data = gcodeFor(ps.filename);
    if (data) {
      sd.file_size = data.length;
      sd.file_position = Math.floor(p * data.length);
      const xy = positionAt(data, sd.file_position);
      const z = Math.round(Math.max(1, Math.round(p * ps.info.total_layer)) * 0.2 * 100) / 100;
      if (xy) printer.toolhead.position = [xy[0], xy[1], z, 0];
    }
    ps.info.current_layer = Math.max(1, Math.round(p * ps.info.total_layer));
    const ex = printer.exclude_object;
    const left = ex.objects.filter((o) => !ex.excluded_objects.includes(o.name));
    ex.current_object = left.length ? left[Math.floor(Date.now() / 4000) % left.length].name : '';
    if (p >= 1) endPrint('complete');
  } else if (ps.state === 'printing') ps.total_duration += 0.25;
  printer.toolhead.estimated_print_time += 0.25;
  sendUpdates();
}

function requireReady() {
  if (klippy.state !== 'ready')
    throw new RpcError(503, `Klippy Host not connected (${klippy.state})`);
}

/** Fields requested by a query/subscribe ({ name: null | [fields] }). */
function pick(request: Record<string, string[] | null>): Record<string, Obj> {
  const out: Record<string, Obj> = {};
  for (const [name, fields] of Object.entries(request)) {
    const obj = printer[name];
    if (!obj) continue;
    out[name] = fields
      ? Object.fromEntries(fields.filter((f) => f in obj).map((f) => [f, obj[f]]))
      : obj;
  }
  return structuredClone(out);
}

/** Only the fields whose value changed since `prev` (what Klipper sends in updates). */
function diff(prev: Record<string, Obj>, next: Record<string, Obj>): Record<string, Obj> {
  const out: Record<string, Obj> = {};
  for (const [name, obj] of Object.entries(next)) {
    for (const [k, v] of Object.entries(obj)) {
      if (JSON.stringify(prev[name]?.[k]) !== JSON.stringify(v)) (out[name] ??= {})[k] = v;
    }
  }
  return out;
}

// ---------------------------------------------------------------- extra services

const queue = { state: 'paused', jobs: [] as Obj[] };
let queueId = 1;
function queueChanged(action: string) {
  broadcast('notify_job_queue_changed', [
    { action, updated_queue: queue.jobs, queue_state: queue.state },
  ]);
}
function jobQueue(method: string, path: string, q: Query) {
  if (path === '/server/job_queue/job' && method === 'POST') {
    if (q.reset === 'true') queue.jobs = [];
    for (const filename of (q.filenames ?? '').split(',').filter(Boolean))
      queue.jobs.push({ filename, job_id: String(queueId++), time_added: now(), time_in_queue: 0 });
    queueChanged('jobs_added');
  } else if (path === '/server/job_queue/job' && method === 'DELETE') {
    const ids = (q.job_ids ?? '').split(',');
    queue.jobs = q.all === 'true' ? [] : queue.jobs.filter((j) => !ids.includes(String(j.job_id)));
    queueChanged('jobs_removed');
  } else if (path === '/server/job_queue/pause') {
    queue.state = 'paused';
    queueChanged('state_changed');
  } else if (path === '/server/job_queue/start') {
    queue.state = 'ready';
    queueChanged('state_changed');
  }
  return { queued_jobs: queue.jobs, queue_state: queue.state };
}

const spools = [
  { id: 1, color: 'ff7a1a', name: 'Orange PLA', material: 'PLA', remaining: 640 },
  { id: 2, color: '2d9cdb', name: 'Blue PETG', material: 'PETG', remaining: 25 },
  { id: 3, color: 'f2f2f2', name: 'Matte White PLA', material: 'PLA', remaining: 910 },
].map((x) => ({
  id: x.id,
  remaining_weight: x.remaining,
  used_weight: 1000 - x.remaining,
  filament: {
    id: x.id,
    name: x.name,
    material: x.material,
    color_hex: x.color,
    density: 1.24,
    diameter: 1.75,
    weight: 1000,
    vendor: { id: 1, name: 'Demo' },
  },
}));
let activeSpool: number | null = 1;
function spoolman(method: string, path: string, q: Query) {
  if (path === '/server/spoolman/status')
    return { spoolman_connected: true, pending_reports: [], spool_id: activeSpool };
  if (path === '/server/spoolman/spool_id') {
    if (method === 'POST') {
      activeSpool = q.spool_id ? Number(q.spool_id) : null;
      broadcast('notify_active_spool_set', [{ spool_id: activeSpool }]);
    }
    return { spool_id: activeSpool };
  }
  if (path === '/server/spoolman/proxy') {
    const one = /^\/v1\/spool\/(\d+)$/.exec(q.path ?? '');
    const response = one ? spools.find((x) => x.id === Number(one[1])) : spools;
    return q.use_v2_response === 'true' ? { response, error: null } : response;
  }
  throw new RpcError(404, 'Not found');
}

const devices = [
  {
    device: 'printer',
    status: 'on',
    locked_while_printing: true,
    type: 'shelly',
    is_shutdown: false,
  },
  {
    device: 'lights',
    status: 'off',
    locked_while_printing: false,
    type: 'shelly',
    is_shutdown: false,
  },
];
function power(path: string, q: Query) {
  if (path === '/machine/device_power/devices') return { devices };
  const dev = devices.find((d) => d.device === q.device);
  if (!dev) throw new RpcError(404, `Device ${q.device} not found`);
  if (path === '/machine/device_power/device' && q.action && q.action !== 'status') {
    dev.status = q.action === 'toggle' ? (dev.status === 'on' ? 'off' : 'on') : q.action;
    broadcast('notify_power_changed', [dev]);
  }
  return { [dev.device]: dev.status };
}

const configFiles: Record<string, string> = {
  'printer.cfg': `# Demo printer
[include macros.cfg]

[printer]
kinematics: corexy
max_velocity: 500
max_accel: 12000

[extruder]
nozzle_diameter: 0.400
max_temp: 300

[heater_bed]
max_temp: 110

[bed_mesh]
mesh_min: 10, 10
mesh_max: 250, 250
probe_count: 7, 7
`,
  'macros.cfg': `[gcode_macro PRINT_START]
gcode:
  G28
  BED_MESH_CALIBRATE

[gcode_macro LOAD_FILAMENT]
gcode:
  M83
  G1 E50 F300
`,
};

/** Temperatures over the last 20 minutes, one a second, like Moonraker's store. */
function temperatureStore() {
  const n = 1200;
  const series = (h: { temperature: number; target: number }) => ({
    temperatures: Array.from({ length: n }, (_, i) => {
      const warmup = Math.min(1, i / 120);
      const goal = h.target || h.temperature;
      return Math.round((25 + (goal - 25) * warmup + Math.sin(i / 7) * 0.4) * 10) / 10;
    }),
    targets: Array.from({ length: n }, () => h.target),
    powers: Array.from({ length: n }, () => (h.target ? 0.3 : 0)),
  });
  return {
    extruder: series(printer.extruder),
    heater_bed: series(printer.heater_bed),
    [CHAMBER]: { temperatures: Array.from({ length: n }, () => 31) },
  };
}

function directory(method: string, q: Query) {
  const d = (q.path ?? '').replace(/^gcodes\/?/, '');
  if (method === 'POST') {
    dirs.add(d);
    broadcast('notify_filelist_changed', [
      { action: 'create_dir', item: { root: 'gcodes', path: d } },
    ]);
    return {};
  }
  if (method === 'DELETE') {
    dirs.delete(d);
    for (let i = files.length - 1; i >= 0; i--)
      if (files[i].path.startsWith(`${d}/`)) files.splice(i, 1);
    broadcast('notify_filelist_changed', [
      { action: 'delete_dir', item: { root: 'gcodes', path: d } },
    ]);
    return {};
  }
  const pre = d ? `${d}/` : '';
  const sub = new Set(
    [...dirs]
      .filter((x) => x.startsWith(pre) && x !== d)
      .map((x) => x.slice(pre.length).split('/')[0]),
  );
  for (const f of files) {
    const rest = f.path.startsWith(pre) ? f.path.slice(pre.length) : null;
    if (rest?.includes('/')) sub.add(rest.split('/')[0]);
  }
  return {
    dirs: [...sub].map((n) => ({ dirname: n, modified: now() - 7200, size: 4096 })),
    files: files
      .filter((f) => f.path.startsWith(pre) && !f.path.slice(pre.length).includes('/'))
      .map((f) => ({
        filename: f.path.slice(pre.length),
        modified: f.modified,
        size: gcodeFor(f.path)?.length ?? 0,
      })),
  };
}

function move(q: Query) {
  const src = (q.source ?? '').replace(/^gcodes\//, '');
  const dst = (q.dest ?? '').replace(/^gcodes\//, '');
  for (const f of files) {
    const old = f.path;
    if (old === src) f.path = dst;
    else if (old.startsWith(`${src}/`)) f.path = dst + old.slice(src.length);
    else continue;
    for (const store of [gcode, uploads]) {
      const data = store.get(old);
      if (data) {
        store.delete(old);
        store.set(f.path, data);
      }
    }
  }
  if (dirs.has(src)) {
    dirs.delete(src);
    dirs.add(dst);
  }
  broadcast('notify_filelist_changed', [
    { action: 'move_file', item: { root: 'gcodes', path: dst } },
  ]);
  return {};
}

async function upload(form: FormData) {
  const file = form.get('file');
  const root = String(form.get('root') ?? 'gcodes');
  const dir = form.get('path');
  if (!(file instanceof Blob)) throw new RpcError(400, 'No file');
  const name = 'name' in file ? String(file.name) : 'upload.gcode';
  const path = [dir, name].filter(Boolean).join('/');
  if (root === 'config') {
    configFiles[path] = await file.text();
    return { item: { path, root }, action: 'create_file' };
  }
  const data = new Uint8Array(await file.arrayBuffer());
  uploads.set(path, data);
  const i = files.findIndex((f) => f.path === path);
  if (i >= 0) files.splice(i, 1);
  files.push({
    path,
    modified: now(),
    mb: data.length / 1e6,
    time: Math.round(data.length / 300),
    grams: Math.round(data.length / 100_000),
    material: 'PLA',
    color: '#9b51e0',
  });
  broadcast('notify_filelist_changed', [{ action: 'create_file', item: { root: 'gcodes', path } }]);
  if (form.get('print') === 'true') startPrint(path);
  return { item: { path, root }, action: 'create_file' };
}

/** API shared by HTTP and JSON-RPC, keyed by JSON-RPC method name. */
const api: Record<string, (p: Obj) => unknown> = {
  'server.info': () => ({
    klippy_connected: true,
    klippy_state: klippy.state,
    components: COMPONENTS,
    failed_components: [],
    warnings: [],
    websocket_count: clients.size,
    moonraker_version: 'v0.9.3-demo',
    api_version: [1, 5, 0],
    api_version_string: '1.5.0',
  }),
  'server.connection.identify': () => ({ connection_id: Math.floor(Math.random() * 1e9) }),
  'printer.info': () => ({
    state: klippy.state,
    state_message: klippy.message,
    hostname: 'demo-printer',
    software_version: 'v0.12.0-demo',
  }),
  'printer.objects.list': () => (requireReady(), { objects: OBJECTS }),
  'printer.objects.query': (p) => (
    requireReady(),
    { eventtime: now(), status: pick(p.objects as Record<string, string[] | null>) }
  ),
  'printer.gcode.script': (p) => (requireReady(), runGcode(String(p.script ?? '')), 'ok'),
  'printer.firmware_restart': () => (restartKlippy(), 'ok'),
  'printer.restart': () => (restartKlippy(), 'ok'),
  'printer.emergency_stop': () => {
    if (printer.print_stats.state === 'printing' || printer.print_stats.state === 'paused')
      endPrint('cancelled');
    setKlippy('shutdown', 'Shutdown due to M112 command');
    return 'ok';
  },
  'printer.print.pause': () => (requireReady(), (printer.print_stats.state = 'paused'), 'ok'),
  'printer.print.resume': () => (requireReady(), (printer.print_stats.state = 'printing'), 'ok'),
  'printer.print.cancel': () => (requireReady(), endPrint('cancelled'), 'ok'),
  'printer.print.start': (p) => (requireReady(), startPrint(String(p.filename)), 'ok'),
  'server.gcode_store': (p) => ({ gcode_store: gcodeStore.slice(-Number(p.count ?? 100)) }),
};

const HTTP_ROUTES: Record<string, string> = {
  'GET /server/info': 'server.info',
  'GET /printer/info': 'printer.info',
  'GET /printer/objects/list': 'printer.objects.list',
  'POST /printer/gcode/script': 'printer.gcode.script',
  'POST /printer/firmware_restart': 'printer.firmware_restart',
  'POST /printer/restart': 'printer.restart',
  'POST /printer/emergency_stop': 'printer.emergency_stop',
  'POST /printer/print/pause': 'printer.print.pause',
  'POST /printer/print/resume': 'printer.print.resume',
  'POST /printer/print/cancel': 'printer.print.cancel',
  'POST /printer/print/start': 'printer.print.start',
  'GET /server/gcode_store': 'server.gcode_store',
};

// ---------------------------------------------------------------- HTTP

const json = (result: unknown) =>
  new Response(JSON.stringify({ result }), { headers: { 'Content-Type': 'application/json' } });
const failure = (code: number, message: string) =>
  new Response(JSON.stringify({ error: { code, message } }), {
    status: code,
    headers: { 'Content-Type': 'application/json' },
  });

function serveGcode(path: string, range: string | null): Response {
  const data = gcodeFor(path);
  if (!data) return failure(404, 'File not found');
  const m = /^bytes=(\d*)-(\d*)$/.exec(range ?? '');
  if (!m) return new Response(data.slice(), { headers: { 'Content-Type': 'text/plain' } });
  const start = m[1] ? Number(m[1]) : Math.max(0, data.length - Number(m[2]));
  const end = m[1] && m[2] ? Math.min(Number(m[2]), data.length - 1) : data.length - 1;
  return new Response(data.slice(start, end + 1), {
    status: 206,
    headers: {
      'Content-Type': 'text/plain',
      'Content-Range': `bytes ${start}-${end}/${data.length}`,
    },
  });
}

async function route(method: string, u: URL, body: unknown, range: string | null) {
  const q: Query = Object.fromEntries(u.searchParams);
  const path = u.pathname;
  const rpc = HTTP_ROUTES[`${method} ${path}`];
  if (rpc) return json(api[rpc](q));
  if (path === '/printer/objects/query') {
    const objects = Object.fromEntries(
      [...u.searchParams].map(([k, v]) => [k, v ? v.split(',') : null]),
    );
    return json(api['printer.objects.query']({ objects }));
  }
  if (path === '/server/temperature_store') return json(temperatureStore());
  if (path === '/server/history/list') {
    const since = Number(q.since ?? 0);
    const jobs = history.filter((j) => j.start_time >= since);
    return json({ count: jobs.length, jobs: jobs.slice(0, Number(q.limit ?? 50)) });
  }
  if (path === '/server/history/totals') {
    const done = history.filter((j) => j.status === 'completed');
    return json({
      job_totals: {
        total_jobs: history.length,
        total_time: history.reduce((s, j) => s + j.total_duration, 0),
        total_print_time: history.reduce((s, j) => s + j.print_duration, 0),
        total_filament_used: history.reduce((s, j) => s + j.filament_used, 0),
        longest_job: Math.max(...done.map((j) => j.total_duration)),
        longest_print: Math.max(...done.map((j) => j.print_duration)),
      },
    });
  }
  if (path === '/server/files/roots') return json([{ name: 'gcodes' }, { name: 'config' }]);
  if (path === '/server/files/list' && q.root === 'config')
    return json(
      Object.entries(configFiles).map(([p, text]) => ({
        path: p,
        modified: now() - 86400,
        size: text.length,
        permissions: 'rw',
      })),
    );
  if (path === '/server/files/list')
    return json(
      files.map((f) => ({
        path: f.path,
        modified: f.modified,
        size: gcodeFor(f.path)?.length ?? 0,
      })),
    );
  if (path === '/server/files/directory') return json(directory(method, q));
  if (path === '/server/files/move') return json(move(q));
  if (path === '/server/files/metadata') return json(metadata(q.filename ?? ''));
  if (path === '/server/files/upload' && body instanceof FormData) return json(await upload(body));
  if (path.startsWith('/server/files/gcodes/')) {
    const file = decodeURIComponent(path.slice('/server/files/gcodes/'.length));
    if (method === 'DELETE') {
      const i = files.findIndex((f) => f.path === file);
      if (i < 0) return failure(404, 'File not found');
      files.splice(i, 1);
      gcode.delete(file);
      uploads.delete(file);
      broadcast('notify_filelist_changed', [
        { action: 'delete_file', item: { root: 'gcodes', path: file } },
      ]);
      return json({ item: { path: file, root: 'gcodes' }, action: 'delete_file' });
    }
    return serveGcode(file, range);
  }
  if (path.startsWith('/server/files/config/')) {
    const name = decodeURIComponent(path.slice('/server/files/config/'.length));
    if (!(name in configFiles)) return failure(404, 'File not found');
    return new Response(configFiles[name], { headers: { 'Content-Type': 'text/plain' } });
  }
  if (path === '/server/webcams/list') return json({ webcams: [] });
  if (path.startsWith('/server/job_queue/')) return json(jobQueue(method, path, q));
  if (path.startsWith('/server/spoolman/')) return json(spoolman(method, path, q));
  if (path.startsWith('/machine/device_power/')) return json(power(path, q));
  if (path === '/machine/system_info')
    return json({ system_info: { cpu_info: { model: 'Demo' }, distribution: { name: 'Demo' } } });
  if (method === 'POST') return json('ok');
  return failure(404, 'Not found');
}

/** Answers an HTTP request to the demo printer, like Moonraker would. */
export async function handleRequest(url: string, init: RequestInit = {}): Promise<Response> {
  startSim();
  const method = (init.method ?? 'GET').toUpperCase();
  const headers = new Headers(init.headers);
  // A short pause, so the app behaves like it does on a network.
  await new Promise((r) => setTimeout(r, 60));
  try {
    return await route(method, new URL(url), init.body, headers.get('Range'));
  } catch (e) {
    return failure(e instanceof RpcError ? e.code : 500, (e as Error).message);
  }
}

// ---------------------------------------------------------------- JSON-RPC socket

interface Client {
  deliver: (data: string) => void;
  subscription: Record<string, string[] | null> | null;
  lastSent: Record<string, Obj>;
}
const clients = new Set<Client>();

function broadcast(method: string, params?: unknown[]) {
  const msg = JSON.stringify({ jsonrpc: '2.0', method, ...(params ? { params } : {}) });
  for (const c of clients) c.deliver(msg);
}

function sendUpdates() {
  if (klippy.state !== 'ready') return;
  for (const c of clients) {
    if (!c.subscription) continue;
    const next = pick(c.subscription);
    const changed = diff(c.lastSent, next);
    c.lastSent = next;
    if (Object.keys(changed).length)
      c.deliver(
        JSON.stringify({
          jsonrpc: '2.0',
          method: 'notify_status_update',
          params: [changed, now()],
        }),
      );
  }
}

/** Opens a socket to the demo printer; `deliver` receives each message as text. */
export function connect(deliver: (data: string) => void) {
  startSim();
  const client: Client = { deliver, subscription: null, lastSent: {} };
  clients.add(client);
  return {
    send(raw: string) {
      let msg: { id?: number; method?: string; params?: Obj };
      try {
        msg = JSON.parse(raw);
      } catch {
        return;
      }
      const reply = (body: Obj) =>
        setTimeout(() => {
          if (clients.has(client)) deliver(JSON.stringify({ jsonrpc: '2.0', id: msg.id, ...body }));
        }, 30);
      try {
        if (msg.method === 'printer.objects.subscribe') {
          requireReady();
          client.subscription = (msg.params?.objects ?? {}) as Record<string, string[] | null>;
          client.lastSent = pick(client.subscription);
          return reply({ result: { eventtime: now(), status: client.lastSent } });
        }
        const fn = api[msg.method ?? ''];
        if (!fn) throw new RpcError(-32601, `Method not found: ${msg.method}`);
        reply({ result: fn(msg.params ?? {}) });
      } catch (e) {
        reply({
          error: { code: e instanceof RpcError ? e.code : -32000, message: (e as Error).message },
        });
      }
    },
    close() {
      clients.delete(client);
    },
  };
}

let started = false;
/** Starts the simulation the first time the demo printer is used. */
function startSim() {
  if (started) return;
  started = true;
  const data = gcodeFor(printer.print_stats.filename)!;
  printer.print_stats.info.total_layer = layersOf(data);
  printer.virtual_sdcard.file_size = data.length;
  setInterval(tick, 250);
  setInterval(() => broadcast('notify_proc_stat_update', [{ cpu_temp: 48.2 }]), 2000);
}
