#!/usr/bin/env node
// Simulated Moonraker + Klipper for developing without a printer.
//
//   npm run mock                          normal printer, printing a Benchy
//   MOCK_SCENARIO=drop npm run mock       pick a failure scenario (see SCENARIOS below)
//   MOCK_PORT=7126 npm run mock           another port
//
// HTTP and the JSON-RPC WebSocket (/websocket) read the same simulated printer, so both
// transports return consistent data.
import http from 'node:http';
import { WebSocketServer } from 'ws';

const SCENARIOS = {
  normal: 'Ready and printing',
  'klippy-startup': 'Klipper reports "startup" for 10 s, then becomes ready',
  shutdown: 'Klipper is shut down until FIRMWARE_RESTART',
  drop: 'Every WebSocket connection is closed every 30 s',
  silent: '15 s after opening, each WebSocket stops sending and answering, without closing',
  'reject-origin': 'WebSocket handshakes that carry an Origin header get 403 (like cors_domains)',
  slow: 'Every HTTP and JSON-RPC response is delayed 2 s',
};
const scenario = process.env.MOCK_SCENARIO ?? 'normal';
if (!SCENARIOS[scenario]) {
  console.error(
    `Unknown MOCK_SCENARIO "${scenario}". Options:\n${Object.keys(SCENARIOS).join('\n')}`,
  );
  process.exit(1);
}
const PORT = Number(process.env.MOCK_PORT ?? 7125);
const COMPONENTS = (
  process.env.MOCK_COMPONENTS ??
  'klippy_connection,file_manager,history,proc_stats,webcam,job_queue,timelapse,authorization'
).split(',');
// Scenario timings in ms, shorter in the automated tests (src/connection/integration.test.ts).
const MS = {
  startup: Number(process.env.MOCK_STARTUP_MS ?? 10_000),
  restart: Number(process.env.MOCK_RESTART_MS ?? 3000),
  silentAfter: Number(process.env.MOCK_SILENT_AFTER_MS ?? 15_000),
  drop: Number(process.env.MOCK_DROP_MS ?? 30_000),
};
const delay = () => new Promise((r) => setTimeout(r, scenario === 'slow' ? 2000 : 0));
const now = () => Date.now() / 1000;

// ---------------------------------------------------------------- simulated printer

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
  LIGHT,
  CHAMBER,
  'gcode_macro LOAD_FILAMENT',
  'gcode_macro UNLOAD_FILAMENT',
  'gcode_macro _HIDDEN',
  'gcode_macro PRINT_START',
];

const klippy = {
  state: scenario === 'shutdown' ? 'shutdown' : scenario === 'klippy-startup' ? 'startup' : 'ready',
  message: scenario === 'shutdown' ? "MCU 'mcu' shutdown: Timer too close" : 'Printer is ready',
};

const printer = {
  webhooks: { state: klippy.state, state_message: klippy.message },
  print_stats: {
    state: 'printing',
    filename: 'Benchy_PLA_0.2mm.gcode',
    print_duration: 2400,
    total_duration: 2460,
    filament_used: 2345,
    message: '',
    info: { current_layer: 87, total_layer: 240 },
  },
  virtual_sdcard: { progress: 0.36, is_active: true, file_position: 1512000 },
  display_status: { progress: 0.36, message: null },
  extruder: { temperature: 209.6, target: 210, power: 0.4, can_extrude: true },
  heater_bed: { temperature: 59.8, target: 60, power: 0.2 },
  fan: { speed: 1 },
  toolhead: { homed_axes: 'xyz', position: [120.5, 98.2, 17.4, 0], estimated_print_time: 0 },
  gcode_move: { speed_factor: 1.1, extrude_factor: 1, homing_origin: [0, 0, -0.02, 0] },
  idle_timeout: { state: 'Printing' },
  exclude_object: { objects: [], excluded_objects: [], current_object: null },
  bed_mesh: { profile_name: 'default', probed_matrix: [[0]] },
  [LIGHT]: { value: 1 },
  [CHAMBER]: { temperature: 31.2 },
};

const gcodeStore = [
  { message: 'G28', time: now() - 60, type: 'command' },
  { message: '// Homing done', time: now() - 59, type: 'response' },
];

function setKlippy(state, message) {
  // Klipper restarts drop subscriptions; clients must subscribe again after notify_klippy_ready.
  if (state !== 'ready') wss.clients.forEach((ws) => (ws.subscription = null));
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
  setKlippy('startup', 'Klipper is starting');
  setTimeout(() => setKlippy('ready', 'Printer is ready'), MS.restart);
}
if (scenario === 'klippy-startup')
  setTimeout(() => setKlippy('ready', 'Printer is ready'), MS.startup);

function respond(line) {
  gcodeStore.push({ message: line, time: now(), type: 'response' });
  broadcast('notify_gcode_response', [line]);
}

function runGcode(script) {
  for (const cmd of script
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)) {
    gcodeStore.push({ message: cmd, time: now(), type: 'command' });
    const heater = cmd.match(/SET_HEATER_TEMPERATURE HEATER=(\w+) TARGET=([\d.]+)/i);
    const m104 = cmd.match(/^M10[49] S([\d.]+)/i);
    const m140 = cmd.match(/^M1(40|90) S([\d.]+)/i);
    if (heater) printer[heater[1]].target = Number(heater[2]);
    else if (m104) printer.extruder.target = Number(m104[1]);
    else if (m140) printer.heater_bed.target = Number(m140[2]);
    else if (/^FIRMWARE_RESTART|^RESTART/i.test(cmd)) return restartKlippy();
    else if (/^M115/i.test(cmd)) respond('// FIRMWARE_NAME:Klipper FIRMWARE_VERSION:v0.12.0-mock');
    respond('ok');
  }
}

// Physics: heaters drift towards their targets; the print advances while printing.
setInterval(() => {
  for (const h of [printer.extruder, printer.heater_bed]) {
    const goal = h.target || 25;
    h.temperature += (goal - h.temperature) * 0.08 + (Math.random() - 0.5) * 0.3;
    h.temperature = Math.round(h.temperature * 10) / 10;
  }
  const ps = printer.print_stats;
  if (klippy.state === 'ready' && ps.state === 'printing') {
    ps.print_duration += 0.25;
    ps.total_duration += 0.25;
    ps.filament_used += 0.4;
    const p = Math.min(1, printer.virtual_sdcard.progress + 0.00005);
    printer.virtual_sdcard.progress = printer.display_status.progress = p;
    ps.info.current_layer = Math.max(1, Math.round(p * ps.info.total_layer));
  }
  printer.toolhead.estimated_print_time += 0.25;
}, 250);

/** Fields requested by a query/subscribe ({ name: null | [fields] }). */
function pick(request) {
  const out = {};
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
function diff(prev, next) {
  const out = {};
  for (const [name, obj] of Object.entries(next)) {
    for (const [k, v] of Object.entries(obj)) {
      if (JSON.stringify(prev[name]?.[k]) !== JSON.stringify(v)) (out[name] ??= {})[k] = v;
    }
  }
  return out;
}

class RpcError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function requireReady() {
  if (klippy.state !== 'ready')
    throw new RpcError(503, `Klippy Host not connected (${klippy.state})`);
}

const files = [
  { path: 'Benchy_PLA_0.2mm.gcode', modified: now() - 3600, size: 4_200_000 },
  { path: 'models/Soporte_movil.gcode', modified: now() - 86400, size: 12_500_000 },
  { path: 'Calibration_cube.gcode', modified: now() - 5 * 86400, size: 900_000 },
];
const dirs = new Set(['models', 'empty']);

/** API shared by HTTP and JSON-RPC, keyed by JSON-RPC method name. */
const api = {
  'server.info': () => ({
    klippy_connected: klippy.state !== 'disconnected',
    klippy_state: klippy.state,
    components: COMPONENTS,
    failed_components: [],
    warnings: [],
    websocket_count: wss.clients.size,
    moonraker_version: 'v0.9.3-mock',
    api_version: [1, 5, 0],
    api_version_string: '1.5.0',
  }),
  'server.connection.identify': () => ({ connection_id: Math.floor(Math.random() * 1e9) }),
  'printer.info': () => ({
    state: klippy.state,
    state_message: klippy.message,
    hostname: 'creality-hi',
    software_version: 'v0.12.0-mock',
  }),
  'printer.objects.list': () => (requireReady(), { objects: OBJECTS }),
  'printer.objects.query': (p) => (requireReady(), { eventtime: now(), status: pick(p.objects) }),
  'printer.gcode.script': (p) => (requireReady(), runGcode(p.script), 'ok'),
  'printer.firmware_restart': () => (restartKlippy(), 'ok'),
  'printer.restart': () => (restartKlippy(), 'ok'),
  'printer.emergency_stop': () => (setKlippy('shutdown', 'Shutdown due to M112 command'), 'ok'),
  'printer.print.pause': () => (requireReady(), (printer.print_stats.state = 'paused'), 'ok'),
  'printer.print.resume': () => (requireReady(), (printer.print_stats.state = 'printing'), 'ok'),
  'printer.print.cancel': () => (requireReady(), (printer.print_stats.state = 'cancelled'), 'ok'),
  'server.gcode_store': (p) => ({ gcode_store: gcodeStore.slice(-(p.count ?? 100)) }),
};

// ---------------------------------------------------------------- HTTP

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect width="300" height="300" fill="#223"/><path d="M80 210 L150 90 L220 210Z" fill="#ff7a1a"/></svg>`;
const HTTP_ROUTES = {
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
  'GET /server/gcode_store': 'server.gcode_store',
};

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', '*');
  if (req.method === 'OPTIONS') return res.end();
  await delay();
  const u = new URL(req.url, 'http://x');
  const q = Object.fromEntries(u.searchParams);
  const send = (result) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ result }));
  };
  const fail = (code, message) => {
    res.statusCode = code;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: { code, message } }));
  };
  try {
    const method = HTTP_ROUTES[`${req.method} ${u.pathname}`];
    if (method) return send(api[method]({ ...q, count: q.count && Number(q.count) }));
    if (u.pathname === '/printer/objects/query') {
      // ?extruder&toolhead=homed_axes,position
      const objects = Object.fromEntries(
        [...u.searchParams].map(([k, v]) => [k, v ? v.split(',') : null]),
      );
      return send(api['printer.objects.query']({ objects }));
    }
    if (u.pathname === '/printer/print/start') {
      requireReady();
      Object.assign(printer.print_stats, {
        state: 'printing',
        filename: q.filename,
        print_duration: 0,
      });
      printer.virtual_sdcard.progress = 0;
      return send('ok');
    }
    if (u.pathname === '/server/temperature_store') {
      const n = 1200;
      const series = (from, to) => Array.from({ length: n }, (_, i) => Math.min(to, from + i));
      return send({
        extruder: {
          temperatures: series(25, printer.extruder.temperature),
          targets: Array(n).fill(printer.extruder.target),
        },
        heater_bed: {
          temperatures: series(25, printer.heater_bed.temperature),
          targets: Array(n).fill(printer.heater_bed.target),
        },
      });
    }
    if (u.pathname === '/server/history/list')
      return send({
        count: 3,
        jobs: [
          {
            job_id: '1',
            filename: 'Benchy_PLA_0.2mm.gcode',
            status: 'completed',
            start_time: now() - 86400,
            end_time: 1,
            print_duration: 5400,
            total_duration: 5600,
            filament_used: 4200,
            exists: true,
            metadata: {
              estimated_time: 5500,
              filament_type: 'PLA',
              thumbnails: [{ width: 300, height: 300, relative_path: '.thumbs/t.svg' }],
            },
          },
          {
            job_id: '2',
            filename: 'models/Soporte_movil.gcode',
            status: 'cancelled',
            start_time: now() - 2 * 86400,
            end_time: 1,
            print_duration: 1200,
            total_duration: 1300,
            filament_used: 800,
            exists: true,
          },
          {
            job_id: '3',
            filename: 'old.gcode',
            status: 'error',
            start_time: now() - 5 * 86400,
            end_time: 1,
            print_duration: 300,
            total_duration: 300,
            filament_used: 50,
            exists: false,
          },
        ],
      });
    if (u.pathname === '/server/history/totals')
      return send({
        job_totals: {
          total_jobs: 42,
          total_time: 400000,
          total_print_time: 360000,
          total_filament_used: 512000,
          longest_job: 30000,
          longest_print: 29000,
        },
      });
    if (u.pathname === '/server/files/roots')
      return send([
        { name: 'gcodes' },
        { name: 'config' },
        ...(COMPONENTS.includes('timelapse') ? [{ name: 'timelapse' }] : []),
      ]);
    if (u.pathname === '/server/files/list' && q.root === 'timelapse')
      return send([
        { path: 'timelapse_Benchy_20261025.mp4', modified: now() - 86400, size: 8_400_000 },
      ]);
    if (u.pathname === '/server/files/list') return send(files);
    if (u.pathname === '/server/files/directory') return send(directory(req.method, q));
    if (u.pathname === '/server/files/move') return send(move(q));
    if (u.pathname === '/server/files/metadata')
      return send({
        estimated_time: 6540,
        filament_weight_total: 14.2,
        filament_total: 4800,
        filament_type: 'PLA',
        filament_name: 'Hyper PLA',
        first_layer_extr_temp: 220,
        first_layer_bed_temp: 60,
        object_height: 48,
        slicer: 'Creality Print',
        layer_height: 0.2,
        thumbnails: [{ width: 300, height: 300, relative_path: '.thumbs/t.svg' }],
      });
    if (u.pathname.startsWith('/server/files/gcodes/')) {
      res.setHeader('Content-Type', 'image/svg+xml');
      return res.end(svg);
    }
    if (u.pathname === '/server/webcams/list') return send({ webcams: [] });
    if (req.method === 'POST') return send('ok');
    fail(404, 'Not found');
  } catch (e) {
    fail(e.code ?? 500, e.message);
  }
});

function directory(method, q) {
  const d = q.path.replace(/^gcodes\/?/, '');
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
    dirs: [...sub, '.thumbs'].map((n) => ({ dirname: n, modified: now() - 7200, size: 4096 })),
    files: files
      .filter((f) => f.path.startsWith(pre) && !f.path.slice(pre.length).includes('/'))
      .map((f) => ({ filename: f.path.slice(pre.length), modified: f.modified, size: f.size })),
  };
}

function move(q) {
  const src = q.source.replace(/^gcodes\//, '');
  const dst = q.dest.replace(/^gcodes\//, '');
  for (const f of files) {
    if (f.path === src) f.path = dst;
    else if (f.path.startsWith(`${src}/`)) f.path = dst + f.path.slice(src.length);
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

// ---------------------------------------------------------------- WebSocket (JSON-RPC 2.0)

const wss = new WebSocketServer({ noServer: true });
// In the "silent" scenario each connection goes quiet a while after it opens.
const isSilent = (ws) => scenario === 'silent' && Date.now() - ws.openedAt > MS.silentAfter;

server.on('upgrade', (req, socket, head) => {
  if (new URL(req.url, 'http://x').pathname !== '/websocket') return socket.destroy();
  if (scenario === 'reject-origin' && req.headers.origin) {
    socket.end('HTTP/1.1 403 Forbidden\r\n\r\n');
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
});

function broadcast(method, params) {
  const msg = JSON.stringify({ jsonrpc: '2.0', method, ...(params ? { params } : {}) });
  for (const ws of wss.clients) if (ws.readyState === ws.OPEN && !isSilent(ws)) ws.send(msg);
}

wss.on('connection', (ws) => {
  // Subscribed objects and the last values sent to this client.
  ws.subscription = null;
  ws.lastSent = {};
  ws.openedAt = Date.now();
  ws.on('message', async (raw) => {
    if (isSilent(ws)) return;
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    await delay();
    const reply = (body) =>
      ws.readyState === ws.OPEN && ws.send(JSON.stringify({ jsonrpc: '2.0', id: msg.id, ...body }));
    try {
      if (msg.method === 'printer.objects.subscribe') {
        requireReady();
        ws.subscription = msg.params?.objects ?? {};
        ws.lastSent = pick(ws.subscription);
        return reply({ result: { eventtime: now(), status: ws.lastSent } });
      }
      const fn = api[msg.method];
      if (!fn) throw new RpcError(-32601, `Method not found: ${msg.method}`);
      reply({ result: fn(msg.params ?? {}) });
    } catch (e) {
      reply({ error: { code: e.code ?? -32000, message: e.message } });
    }
  });
});

// Status updates every 250 ms (only what changed) and process stats every second.
setInterval(() => {
  if (klippy.state !== 'ready') return;
  for (const ws of wss.clients) {
    if (!ws.subscription || ws.readyState !== ws.OPEN || isSilent(ws)) continue;
    const next = pick(ws.subscription);
    const changed = diff(ws.lastSent, next);
    ws.lastSent = next;
    if (Object.keys(changed).length)
      ws.send(
        JSON.stringify({
          jsonrpc: '2.0',
          method: 'notify_status_update',
          params: [changed, now()],
        }),
      );
  }
}, 250);
setInterval(
  () =>
    broadcast('notify_proc_stat_update', [
      { cpu_temp: 48.2, websocket_connections: wss.clients.size },
    ]),
  1000,
);
if (scenario === 'drop')
  setInterval(() => {
    for (const ws of wss.clients) ws.terminate();
    console.log('drop: closed all WebSocket connections');
  }, MS.drop);

server.listen(PORT, () => {
  console.log(`Mock Moonraker on http://localhost:${PORT} (ws://localhost:${PORT}/websocket)`);
  console.log(`Scenario: ${scenario} — ${SCENARIOS[scenario]}`);
});
