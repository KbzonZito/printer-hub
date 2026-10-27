import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PrinterConnection, TIMING, type HttpApi, type Snapshot } from './PrinterConnection';
import type { RawStatus } from './statusModel';
import type { SocketHandlers, Transport } from './transport';

// A fake Moonraker behind a fake socket. Tests change `server` to script its behaviour.

interface FakeServer {
  klippy: string;
  stateMessage: string;
  status: RawStatus;
  /** Methods that never answer (to simulate a dead connection). */
  silent: Set<string>;
  /** Whether new sockets open, fail, or stay pending. */
  accept: 'open' | 'fail' | 'hang';
  calls: string[];
  objects: string[];
  config: Record<string, any>;
}

function fakeMoonraker() {
  const server: FakeServer = {
    klippy: 'ready',
    stateMessage: 'Printer is ready',
    status: {
      webhooks: { state: 'ready', state_message: 'Printer is ready' },
      extruder: { temperature: 25, target: 0 },
      print_stats: { state: 'standby' },
    },
    silent: new Set(),
    accept: 'open',
    calls: [],
    objects: ['extruder', 'heater_bed', 'output_pin LED'],
    config: {},
  };
  const sockets: { handlers: SocketHandlers; closed: boolean }[] = [];

  const answer = (method: string, params: any) => {
    switch (method) {
      case 'server.connection.identify':
        return { connection_id: 1 };
      case 'server.info':
        return { klippy_state: server.klippy, components: ['history'] };
      case 'printer.info':
        return { state: server.klippy, state_message: server.stateMessage };
      case 'printer.objects.list':
        return { objects: server.objects };
      case 'printer.objects.query':
        if (params?.objects?.configfile) {
          return { status: { configfile: { settings: server.config } } };
        }
      // falls through
      case 'printer.objects.subscribe':
        if (server.klippy !== 'ready') throw { code: 503, message: 'Klippy Host not connected' };
        return { eventtime: 1, status: structuredClone(server.status) };
      default:
        throw { code: -32601, message: `Method not found: ${method} ${params}` };
    }
  };

  const transport: Transport = (_url, handlers) => {
    const socket = { handlers, closed: false };
    sockets.push(socket);
    if (server.accept === 'open') queueMicrotask(() => !socket.closed && handlers.onOpen());
    if (server.accept === 'fail')
      queueMicrotask(() => !socket.closed && handlers.onClose(1006, ''));
    return {
      send: (data) => {
        const msg = JSON.parse(data);
        server.calls.push(msg.method);
        if (server.silent.has(msg.method)) return;
        let body: object;
        try {
          body = { result: answer(msg.method, msg.params) };
        } catch (error) {
          body = { error };
        }
        queueMicrotask(
          () =>
            !socket.closed &&
            handlers.onMessage(JSON.stringify({ jsonrpc: '2.0', id: msg.id, ...body })),
        );
      },
      close: () => {
        socket.closed = true;
      },
    };
  };

  const current = () => sockets.filter((s) => !s.closed).at(-1)!;
  return {
    server,
    transport,
    sockets,
    notify: (method: string, params: any[] = []) =>
      current().handlers.onMessage(JSON.stringify({ jsonrpc: '2.0', method, params })),
    /** The printer drops the connection. */
    drop: () => {
      const s = current();
      s.closed = true;
      s.handlers.onClose(1006, '');
    },
  };
}

function fakeHttp(overrides: Partial<HttpApi> = {}): HttpApi {
  return {
    serverInfo: vi.fn(async () => ({ klippy_state: 'ready' })),
    printerInfo: vi.fn(async () => ({ state_message: '' })),
    objectList: vi.fn(async () => ['extruder', 'heater_bed']),
    query: vi.fn(async () => ({
      webhooks: { state: 'ready' },
      extruder: { temperature: 99, target: 0 },
    })),
    ...overrides,
  };
}

function connect(http = fakeHttp()) {
  const moon = fakeMoonraker();
  const conn = new PrinterConnection({ url: 'ws://x/websocket', transport: moon.transport, http });
  const snaps: Snapshot[] = [];
  conn.subscribe((s) => snaps.push(s));
  return { conn, moon, http, snaps, state: () => conn.getSnapshot().state };
}

const tick = (ms = 0) => vi.advanceTimersByTimeAsync(ms);

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(Math, 'random').mockReturnValue(0); // no jitter
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('PrinterConnection', () => {
  it('follows the startup sequence and becomes ready with the status', async () => {
    const { conn, moon, state } = connect();
    conn.start();
    expect(state().kind).toBe('connecting');
    await tick();
    expect(moon.server.calls).toEqual([
      'server.connection.identify',
      'server.info',
      'printer.objects.list',
      'printer.objects.subscribe',
    ]);
    expect(state()).toEqual({ kind: 'ready' });
    const snap = conn.getSnapshot();
    expect(snap.mode).toBe('realtime');
    expect(snap.status?.extruder.temperature).toBe(25);
    expect(snap.names?.lightPin).toBe('output_pin LED');
  });

  it('applies status updates, at most every 250 ms', async () => {
    const { conn, moon, snaps } = connect();
    conn.start();
    await tick();
    const before = snaps.length;
    moon.notify('notify_status_update', [{ extruder: { temperature: 30 } }, 1]);
    moon.notify('notify_status_update', [{ extruder: { temperature: 31 } }, 2]);
    moon.notify('notify_status_update', [{ extruder: { target: 200 } }, 3]);
    expect(snaps.length).toBe(before);
    await tick(TIMING.emitInterval);
    expect(snaps.length).toBe(before + 1);
    expect(conn.getSnapshot().status?.extruder).toEqual({ temperature: 31, target: 200 });
  });

  it('reads the fan scale of a Creality Hi before subscribing', async () => {
    const { conn, moon } = connect();
    moon.server.objects = ['extruder', 'output_pin fan0'];
    moon.server.config = { 'output_pin fan0': { scale: 255 } };
    moon.server.status['output_pin fan0'] = { value: 51 };
    conn.start();
    await tick();
    expect(moon.server.calls).toContain('printer.objects.query');
    expect(conn.getSnapshot().status?.fanSpeed).toBeCloseTo(0.2);
  });

  it('continues when identify is not supported', async () => {
    const { conn, moon, state } = connect();
    moon.server.silent.add('server.connection.identify');
    conn.start();
    await tick(5000);
    expect(state().kind).toBe('ready');
  });

  it('waits while Klipper starts, then subscribes', async () => {
    const { conn, moon, state } = connect();
    moon.server.klippy = 'startup';
    conn.start();
    await tick();
    expect(state()).toEqual({ kind: 'klippy', klippyState: 'startup', message: '' });
    moon.server.klippy = 'ready';
    await tick(TIMING.klippyStartupRecheck);
    expect(state().kind).toBe('ready');
  });

  it('shows the Klipper error message and recovers on notify_klippy_ready', async () => {
    const { conn, moon, state } = connect();
    moon.server.klippy = 'shutdown';
    moon.server.stateMessage = 'MCU shutdown: Timer too close';
    conn.start();
    await tick();
    expect(state()).toEqual({
      kind: 'klippy',
      klippyState: 'shutdown',
      message: 'MCU shutdown: Timer too close',
    });
    expect(conn.getSnapshot().status).toBeNull();
    moon.server.klippy = 'ready';
    moon.notify('notify_klippy_ready');
    await tick();
    expect(state().kind).toBe('ready');
  });

  it('re-checks Klipper after notify_klippy_disconnected', async () => {
    const { conn, moon, state } = connect();
    conn.start();
    await tick();
    moon.server.klippy = 'startup';
    moon.notify('notify_klippy_disconnected');
    await tick();
    expect(state()).toMatchObject({ kind: 'klippy', klippyState: 'startup' });
    expect(conn.getSnapshot().status?.klippyState).toBe('startup');
  });

  it('reconnects with growing waits and keeps the last status', async () => {
    const { conn, moon, state } = connect();
    conn.start();
    await tick();
    moon.server.accept = 'hang';
    moon.drop();
    expect(state()).toMatchObject({ kind: 'reconnecting', attempt: 1 });
    expect(conn.getSnapshot().status?.extruder.temperature).toBe(25);
    await tick(1000); // attempt 1 opens a socket that hangs…
    await tick(TIMING.openTimeout); // …and times out
    expect(state()).toMatchObject({ kind: 'reconnecting', attempt: 2 });
    expect(moon.sockets).toHaveLength(2);
    moon.server.accept = 'open';
    await tick(2000);
    expect(state().kind).toBe('ready');
    expect(moon.sockets).toHaveLength(3);
  });

  it('remembers when the connection was lost across attempts', async () => {
    const { conn, moon, state } = connect();
    conn.start();
    await tick();
    const lostAt = Date.now();
    moon.server.accept = 'hang';
    moon.drop();
    await tick(1000 + TIMING.openTimeout);
    expect(state()).toMatchObject({ kind: 'reconnecting', since: lostAt });
  });

  it('retries at once with retryNow', async () => {
    const { conn, moon, state } = connect();
    conn.start();
    await tick();
    moon.server.accept = 'hang';
    moon.drop();
    moon.server.accept = 'open';
    conn.retryNow();
    await tick();
    expect(state().kind).toBe('ready');
  });

  it('detects a silent connection with the watchdog', async () => {
    const { conn, moon, state } = connect();
    conn.start();
    await tick();
    moon.server.silent.add('server.info');
    await tick(TIMING.watchdogIdle + 2000); // silence → probe
    expect(state().kind).toBe('ready');
    await tick(TIMING.watchdogProbe); // probe unanswered
    expect(state().kind).toBe('reconnecting');
  });

  it('keeps a quiet but healthy connection open', async () => {
    const { conn, moon, state } = connect();
    conn.start();
    await tick();
    await tick(30_000); // no notifications, but every probe gets an answer
    expect(state().kind).toBe('ready');
    expect(moon.sockets).toHaveLength(1);
  });

  it('falls back to HTTP polling when the WebSocket never opens', async () => {
    const http = fakeHttp();
    const { conn, moon, state } = connect(http);
    moon.server.accept = 'fail';
    conn.start();
    await tick(); // failure 1
    await tick(1000); // failure 2
    await tick(2000); // failure 3 → HTTP works → polling
    expect(conn.getSnapshot().mode).toBe('polling');
    expect(conn.getSnapshot().server?.klippy_state).toBe('ready');
    expect(state().kind).toBe('ready');
    expect(conn.getSnapshot().status?.extruder.temperature).toBe(99);
    await tick(TIMING.pollInterval * 2);
    expect(http.query).toHaveBeenCalledTimes(3);
  });

  it('goes back to the WebSocket when it works again', async () => {
    const http = fakeHttp();
    const { conn, moon } = connect(http);
    moon.server.accept = 'fail';
    conn.start();
    await tick(3000);
    expect(conn.getSnapshot().mode).toBe('polling');
    moon.server.accept = 'open';
    await tick(TIMING.wsRetryWhilePolling);
    expect(conn.getSnapshot().mode).toBe('realtime');
    const calls = (http.query as any).mock.calls.length;
    await tick(TIMING.pollInterval * 3);
    expect((http.query as any).mock.calls.length).toBe(calls);
  });

  it('keeps reconnecting when the printer is off (no HTTP either)', async () => {
    const http = fakeHttp({ serverInfo: vi.fn(async () => Promise.reject(new Error('down'))) });
    const { conn, moon, state } = connect(http);
    moon.server.accept = 'fail';
    conn.start();
    await tick(3000);
    expect(conn.getSnapshot().mode).toBe('realtime');
    expect(state()).toMatchObject({ kind: 'reconnecting', attempt: 3 });
  });

  it('reports Klipper problems while polling', async () => {
    const http = fakeHttp({
      query: vi.fn(async () => Promise.reject(new Error('503'))),
      serverInfo: vi.fn(async () => ({ klippy_state: 'error' })),
      printerInfo: vi.fn(async () => ({ state_message: 'Config error' })),
    });
    const { conn, moon, state } = connect(http);
    moon.server.accept = 'fail';
    conn.start();
    await tick(3000);
    expect(state()).toEqual({ kind: 'klippy', klippyState: 'error', message: 'Config error' });
  });

  it('pauses and resumes', async () => {
    const { conn, moon, state } = connect();
    conn.start();
    await tick();
    conn.pause();
    expect(state().kind).toBe('paused');
    expect(moon.sockets[0].closed).toBe(true);
    await tick(60_000);
    expect(moon.sockets).toHaveLength(1);
    conn.resume();
    await tick();
    expect(state().kind).toBe('ready');
    expect(moon.sockets).toHaveLength(2);
  });

  it('refresh re-reads the status', async () => {
    const { conn, moon } = connect();
    conn.start();
    await tick();
    moon.server.status.extruder.temperature = 180;
    conn.refresh();
    await tick();
    expect(conn.getSnapshot().status?.extruder.temperature).toBe(180);
  });

  it('forwards other notifications', async () => {
    const { conn, moon } = connect();
    const events: string[] = [];
    conn.onEvent((m, p) => events.push(`${m}:${p[0] ?? ''}`));
    conn.start();
    await tick();
    moon.notify('notify_gcode_response', ['ok']);
    expect(events).toContain('notify_gcode_response:ok');
  });

  it('ignores answers from a socket that was replaced', async () => {
    const { conn, moon, state } = connect();
    moon.server.silent.add('printer.objects.subscribe');
    conn.start();
    await tick();
    moon.drop(); // the first socket dies while subscribe is pending
    moon.server.silent.clear();
    await tick(1000);
    expect(state().kind).toBe('ready');
    expect(moon.sockets[0].closed).toBe(true);
  });

  it('does nothing after stop', async () => {
    const { conn, moon, snaps } = connect();
    conn.start();
    await tick();
    conn.stop();
    const count = snaps.length;
    await tick(120_000);
    expect(snaps.length).toBe(count);
    expect(moon.sockets).toHaveLength(1);
  });
});
