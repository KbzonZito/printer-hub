import { spawn, type ChildProcess } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  fetchObjectList,
  fetchPrinterInfo,
  fetchServerInfo,
  queryObjects,
  websocketUrl,
} from '../api/moonraker';
import { newPrinter } from '../store';
import { PrinterConnection, TIMING, type ConnectionState } from './PrinterConnection';
import { webTransport } from './transport';

// The real connection against the simulator (scripts/mock-moonraker.mjs), one scenario per
// port, with real time and shortened timings.

const servers: ChildProcess[] = [];

function startMock(scenario: string, port: number, env: Record<string, string> = {}) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn('node', ['scripts/mock-moonraker.mjs'], {
      env: { ...process.env, MOCK_SCENARIO: scenario, MOCK_PORT: String(port), ...env },
    });
    servers.push(child);
    child.stdout.on('data', (d) => String(d).includes('Mock Moonraker on') && resolve());
    child.on('exit', (code) => reject(new Error(`mock ${scenario} exited (${code})`)));
  });
}

function connect(port: number) {
  const printer = { ...newPrinter(), host: '127.0.0.1', port };
  const conn = new PrinterConnection({
    url: websocketUrl(printer),
    transport: webTransport,
    http: {
      serverInfo: () => fetchServerInfo(printer),
      printerInfo: () => fetchPrinterInfo(printer),
      objectList: () => fetchObjectList(printer),
      query: (objects) => queryObjects(printer, objects),
    },
  });
  const seen: ConnectionState['kind'][] = [];
  conn.subscribe((s) => seen.at(-1) !== s.state.kind && seen.push(s.state.kind));
  conn.start();
  return { conn, printer, seen };
}

async function until(check: () => boolean, ms: number) {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error('timed out waiting');
    await new Promise((r) => setTimeout(r, 50));
  }
}

const original = { ...TIMING };
beforeAll(async () => {
  Object.assign(TIMING, { watchdogIdle: 1500, watchdogProbe: 800, backoff: [300, 600] });
  await Promise.all([
    startMock('normal', 7311),
    startMock('klippy-startup', 7312, { MOCK_STARTUP_MS: '1500' }),
    startMock('shutdown', 7313, { MOCK_RESTART_MS: '500' }),
    startMock('drop', 7314, { MOCK_DROP_MS: '1500' }),
    startMock('silent', 7315, { MOCK_SILENT_AFTER_MS: '1000' }),
  ]);
}, 15_000);

afterAll(() => {
  Object.assign(TIMING, original);
  for (const s of servers) s.kill();
});

describe('connection against the simulator', () => {
  it('receives live updates in real time', async () => {
    const { conn } = connect(7311);
    await until(() => conn.getSnapshot().state.kind === 'ready', 3000);
    const first = conn.getSnapshot().status!.printDuration;
    await new Promise((r) => setTimeout(r, 1200));
    const snap = conn.getSnapshot();
    expect(snap.mode).toBe('realtime');
    expect(snap.status!.printDuration).toBeGreaterThan(first);
    expect(snap.status!.light?.pin).toBe('LED');
    conn.stop();
  });

  it('gets the console responses as events', async () => {
    const { conn, printer } = connect(7311);
    const lines: string[] = [];
    conn.onEvent((m, p) => m === 'notify_gcode_response' && lines.push(p[0]));
    await until(() => conn.getSnapshot().state.kind === 'ready', 3000);
    await fetch(`http://127.0.0.1:${printer.port}/printer/gcode/script?script=M115`, {
      method: 'POST',
    });
    await until(() => lines.some((l) => l.includes('FIRMWARE_NAME')), 2000);
    conn.stop();
  });

  it('waits for Klipper to start', async () => {
    const { conn, seen } = connect(7312);
    await until(() => conn.getSnapshot().state.kind === 'ready', 5000);
    expect(seen).toEqual(['connecting', 'klippy', 'ready']);
    conn.stop();
  });

  it('recovers from a shutdown after FIRMWARE_RESTART', async () => {
    const { conn, printer } = connect(7313);
    await until(() => conn.getSnapshot().state.kind === 'klippy', 3000);
    expect(conn.getSnapshot().state).toMatchObject({
      klippyState: 'shutdown',
      message: expect.stringContaining('Timer too close'),
    });
    await fetch(`http://127.0.0.1:${printer.port}/printer/firmware_restart`, { method: 'POST' });
    await until(() => conn.getSnapshot().state.kind === 'ready', 5000);
    conn.stop();
  });

  it('reconnects by itself when the connection drops', async () => {
    const { conn, seen } = connect(7314);
    await until(
      () => seen.includes('reconnecting') && conn.getSnapshot().state.kind === 'ready',
      6000,
    );
    expect(conn.getSnapshot().status).not.toBeNull();
    conn.stop();
  });

  it('notices a connection that went silent', async () => {
    const { conn, seen } = connect(7315);
    await until(() => conn.getSnapshot().state.kind === 'ready', 3000);
    await until(() => seen.includes('reconnecting'), 6000);
    conn.stop();
  });
});
