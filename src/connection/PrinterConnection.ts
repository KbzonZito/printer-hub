import type { KlippyInfo, PrinterStatus, ServerInfo } from '../api/moonraker';
import { JsonRpc, RpcError } from './jsonrpc';
import {
  mergeStatus,
  namesFromObjects,
  parseStatus,
  subscription,
  type ObjectNames,
  type RawStatus,
} from './statusModel';
import type { Socket, Transport } from './transport';

// Live connection to one printer over Moonraker's WebSocket (JSON-RPC), following the
// startup sequence from Moonraker's docs, with reconnection, a watchdog for silent
// connections and an HTTP polling fallback. Plan: docs/plans/fase-2-tiempo-real.md

export type KlippyProblem = 'startup' | 'shutdown' | 'error' | 'disconnected';

export type ConnectionState =
  | { kind: 'connecting' }
  | { kind: 'ready' }
  /** Moonraker answers but Klipper isn't ready. */
  | { kind: 'klippy'; klippyState: KlippyProblem; message: string }
  /** The printer can't be reached; `since` is when the connection was lost. */
  | { kind: 'reconnecting'; attempt: number; retryAt: number; since: number }
  | { kind: 'paused' }
  | { kind: 'stopped' };

export interface Snapshot {
  state: ConnectionState;
  /** "polling" when the WebSocket can't be used and HTTP queries replace it. */
  mode: 'realtime' | 'polling';
  /** Last known status; kept while reconnecting so the screen doesn't go blank. */
  status: PrinterStatus | null;
  names: ObjectNames | null;
  server: ServerInfo | null;
}

/** HTTP calls used by the polling fallback. */
export interface HttpApi {
  serverInfo(): Promise<ServerInfo>;
  printerInfo(): Promise<KlippyInfo>;
  objectList(): Promise<string[]>;
  query(objects: Record<string, string[]>): Promise<RawStatus>;
}

export interface ConnectionOptions {
  url: string;
  transport: Transport;
  http: HttpApi;
  clientVersion?: string;
}

export const TIMING = {
  /** A socket that hasn't opened by then counts as failed. */
  openTimeout: 8000,
  /** Waits between reconnection attempts (the last one repeats), plus up to 20% jitter. */
  backoff: [1000, 2000, 4000, 8000, 15000],
  klippyStartupRecheck: 2000,
  klippyErrorRecheck: 5000,
  /** Moonraker sends proc stats every second, so this much silence is suspicious… */
  watchdogIdle: 8000,
  /** …and a server.info without an answer within this time means the socket is dead. */
  watchdogProbe: 4000,
  /** Status updates reach the screens at most this often. */
  emitInterval: 250,
  pollInterval: 2000,
  /** In polling mode, how often to try the WebSocket again. */
  wsRetryWhilePolling: 60_000,
  /** Sockets that never open before falling back to polling (if HTTP works). */
  failuresBeforePolling: 3,
};

type TimerName = 'open' | 'retry' | 'klippy' | 'watchdog' | 'emit' | 'poll' | 'wsRetry';

export class PrinterConnection {
  private snapshot: Snapshot = {
    state: { kind: 'connecting' },
    mode: 'realtime',
    status: null,
    names: null,
    server: null,
  };
  private raw: RawStatus = {};
  private listeners = new Set<(s: Snapshot) => void>();
  private eventListeners = new Set<(method: string, params: any[]) => void>();
  private timers = new Map<TimerName, ReturnType<typeof setTimeout>>();

  private socket: Socket | null = null;
  private rpc: JsonRpc | null = null;
  /** Bumped for every socket; late callbacks from an older one are ignored. */
  private gen = 0;
  private pollGen = 0;
  private attempt = 0;
  private failedOpens = 0;
  private lostSince: number | null = null;
  private lastMessage = 0;
  private probing = false;
  private lastEmit = 0;
  private started = false;
  private paused = false;
  private stopped = false;

  constructor(private readonly opts: ConnectionOptions) {}

  // ---------------------------------------------------------------- public API

  getSnapshot = () => this.snapshot;

  subscribe = (listener: (s: Snapshot) => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** Moonraker notifications (notify_gcode_response, notify_filelist_changed…). */
  onEvent(listener: (method: string, params: any[]) => void) {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  start() {
    if (this.started || this.stopped) return;
    this.started = true;
    this.openSocket();
  }

  stop() {
    this.stopped = true;
    this.closeSocket();
    this.stopPolling();
    this.clearAll();
    this.setState({ kind: 'stopped' });
    this.listeners.clear();
    this.eventListeners.clear();
  }

  /** App went to the background: close everything until resume(). */
  pause() {
    if (this.paused || this.stopped) return;
    this.paused = true;
    this.closeSocket();
    this.stopPolling();
    this.clearAll();
    this.setState({ kind: 'paused' });
  }

  resume() {
    if (!this.paused || this.stopped) return;
    this.paused = false;
    this.attempt = 0;
    if (this.snapshot.mode === 'polling') this.startPolling();
    else this.openSocket();
  }

  /** "Retry now" while reconnecting. */
  retryNow() {
    if (this.paused || this.stopped) return;
    if (this.snapshot.mode === 'polling') return void this.poll();
    if (this.snapshot.state.kind === 'reconnecting') {
      this.clear('retry');
      this.openSocket();
    }
  }

  /** Re-reads the whole status (e.g. right after an action). */
  refresh() {
    if (this.snapshot.mode === 'polling') return void this.poll();
    const { rpc, gen } = this;
    const names = this.snapshot.names;
    if (!rpc || !names || this.snapshot.state.kind !== 'ready') return;
    rpc
      .call<{ status: RawStatus }>('printer.objects.query', { objects: subscription(names) })
      .then(({ status }) => {
        if (gen !== this.gen) return;
        this.raw = mergeStatus(this.raw, status);
        this.emitNow();
      })
      .catch(() => {});
  }

  // ---------------------------------------------------------------- WebSocket

  private openSocket() {
    this.closeSocket();
    const gen = this.gen;
    if (this.snapshot.mode === 'realtime' && this.snapshot.state.kind !== 'reconnecting') {
      this.setState({ kind: 'connecting' });
    }
    let opened = false;
    this.socket = this.opts.transport(this.opts.url, {
      onOpen: () => {
        if (gen !== this.gen) return;
        opened = true;
        this.clear('open');
        this.onOpen(gen);
      },
      onMessage: (data) => {
        if (gen !== this.gen) return;
        this.lastMessage = Date.now();
        this.rpc?.handle(data);
      },
      onClose: () => {
        if (gen === this.gen) this.lost(opened ? 'closed' : 'failed');
      },
    });
    this.after('open', TIMING.openTimeout, () => gen === this.gen && this.lost('failed'));
  }

  /** Closes the current socket (if any) and invalidates everything tied to it. */
  private closeSocket() {
    this.gen++;
    this.socket?.close();
    this.socket = null;
    this.rpc?.failAll('connection closed');
    this.rpc = null;
    this.probing = false;
    for (const t of ['open', 'klippy', 'watchdog'] as const) this.clear(t);
  }

  private async onOpen(gen: number) {
    this.failedOpens = 0;
    if (this.snapshot.mode === 'polling') {
      // The WebSocket works again: leave the fallback.
      this.stopPolling();
      this.clear('wsRetry');
      this.snapshot = { ...this.snapshot, mode: 'realtime' };
    }
    const rpc = new JsonRpc(
      (data) => this.socket?.send(data),
      (method, params) => this.onNotification(gen, method, params),
    );
    this.rpc = rpc;
    this.lastMessage = Date.now();
    this.watch(gen);
    // Optional: older Moonraker versions may not know it.
    await rpc
      .call(
        'server.connection.identify',
        {
          client_name: 'Printer Hub',
          version: this.opts.clientVersion ?? '0',
          type: 'mobile',
          url: 'https://github.com/KbzonZito/printer-hub',
        },
        5000,
      )
      .catch(() => {});
    if (gen === this.gen) await this.checkKlippy(gen);
  }

  /** Steps 2–3 of Moonraker's startup sequence: is Klipper ready? */
  private async checkKlippy(gen: number) {
    this.clear('klippy');
    const rpc = this.rpc;
    if (!rpc) return;
    let info: ServerInfo;
    try {
      info = await rpc.call<ServerInfo>('server.info');
    } catch {
      if (gen === this.gen) this.lost('closed');
      return;
    }
    if (gen !== this.gen) return;
    this.snapshot = { ...this.snapshot, server: info };
    const state = info.klippy_state;
    if (state === 'ready') return this.subscribeStatus(gen);
    if (state === 'startup') {
      this.setKlippy('startup', '');
      this.after('klippy', TIMING.klippyStartupRecheck, () => this.checkKlippy(gen));
      return;
    }
    let message = '';
    if (state !== 'disconnected') {
      const pi = await rpc.call<KlippyInfo>('printer.info').catch(() => null);
      if (gen !== this.gen) return;
      message = pi?.state_message ?? '';
    }
    this.setKlippy(state === 'shutdown' || state === 'error' ? state : 'disconnected', message);
    this.after('klippy', TIMING.klippyErrorRecheck, () => this.checkKlippy(gen));
  }

  /** Step 4: find the optional objects and subscribe to everything the app shows. */
  private async subscribeStatus(gen: number) {
    const rpc = this.rpc;
    if (!rpc) return;
    try {
      const { objects } = await rpc.call<{ objects: string[] }>('printer.objects.list');
      const names = namesFromObjects(objects);
      const { status } = await rpc.call<{ status: RawStatus }>('printer.objects.subscribe', {
        objects: subscription(names),
      });
      if (gen !== this.gen) return;
      this.raw = status;
      this.snapshot = { ...this.snapshot, names };
      this.attempt = 0;
      this.lostSince = null;
      this.setState({ kind: 'ready' });
    } catch (err) {
      if (gen !== this.gen) return;
      // A server error (e.g. Klipper restarted meanwhile) means checking again;
      // a timeout means the connection is in trouble.
      if (err instanceof RpcError && err.code != null) {
        this.after('klippy', TIMING.klippyStartupRecheck, () => this.checkKlippy(gen));
      } else {
        this.lost('closed');
      }
    }
  }

  private onNotification(gen: number, method: string, params: any[]) {
    if (gen !== this.gen) return;
    switch (method) {
      case 'notify_status_update':
        if (this.snapshot.state.kind === 'ready' && params[0]) {
          this.raw = mergeStatus(this.raw, params[0]);
          this.scheduleEmit();
        }
        break;
      case 'notify_klippy_ready':
      case 'notify_klippy_shutdown':
      case 'notify_klippy_disconnected':
        void this.checkKlippy(gen);
        break;
    }
    for (const l of this.eventListeners) l(method, params);
  }

  /** Detects connections that stay open but no longer deliver anything. */
  private watch(gen: number) {
    this.after('watchdog', 2000, () => {
      if (gen !== this.gen || !this.rpc) return;
      if (!this.probing && Date.now() - this.lastMessage > TIMING.watchdogIdle) {
        this.probing = true;
        this.rpc
          .call('server.info', undefined, TIMING.watchdogProbe)
          .then(() => {
            if (gen === this.gen) this.probing = false;
          })
          .catch(() => gen === this.gen && this.lost('closed'));
      }
      this.watch(gen);
    });
  }

  /** The socket failed to open ("failed") or died after opening ("closed"). */
  private lost(kind: 'failed' | 'closed') {
    this.closeSocket();
    if (kind === 'failed') this.failedOpens++;
    if (this.paused || this.stopped) return;
    if (this.snapshot.mode === 'polling') {
      this.after('wsRetry', TIMING.wsRetryWhilePolling, () => this.openSocket());
      return;
    }
    if (this.failedOpens >= TIMING.failuresBeforePolling) {
      void this.tryPolling();
      return;
    }
    this.scheduleReconnect();
  }

  private scheduleReconnect() {
    const base = TIMING.backoff[Math.min(this.attempt, TIMING.backoff.length - 1)];
    const delay = Math.round(base * (1 + Math.random() * 0.2));
    this.attempt++;
    const now = Date.now();
    this.lostSince ??= now;
    this.setState({
      kind: 'reconnecting',
      attempt: this.attempt,
      retryAt: now + delay,
      since: this.lostSince,
    });
    this.after('retry', delay, () => this.openSocket());
  }

  // ---------------------------------------------------------------- polling fallback

  /** The WebSocket keeps failing to open: use HTTP if the printer answers there. */
  private async tryPolling() {
    const gen = this.gen;
    try {
      await this.opts.http.serverInfo();
    } catch {
      if (gen === this.gen && !this.paused && !this.stopped) this.scheduleReconnect();
      return;
    }
    if (gen !== this.gen || this.paused || this.stopped) return;
    this.startPolling();
  }

  private startPolling() {
    this.snapshot = { ...this.snapshot, mode: 'polling' };
    this.after('wsRetry', TIMING.wsRetryWhilePolling, () => this.openSocket());
    void this.poll();
  }

  private stopPolling() {
    this.pollGen++;
    this.clear('poll');
  }

  private async poll() {
    this.clear('poll');
    const pollGen = ++this.pollGen;
    const { http } = this.opts;
    try {
      const names = this.snapshot.names ?? namesFromObjects(await http.objectList());
      const status = await http.query(subscription(names));
      if (pollGen !== this.pollGen) return;
      this.raw = status;
      this.snapshot = { ...this.snapshot, names };
      this.attempt = 0;
      this.lostSince = null;
      const klippy = status.webhooks?.state;
      if (klippy && klippy !== 'ready') {
        this.setKlippy(klippy as KlippyProblem, status.webhooks?.state_message ?? '');
      } else {
        this.setState({ kind: 'ready' });
      }
    } catch {
      if (pollGen !== this.pollGen) return;
      // Klipper may be down (queries fail) while Moonraker still answers.
      const info = await http.serverInfo().catch(() => null);
      if (pollGen !== this.pollGen) return;
      if (info) {
        const pi = await http.printerInfo().catch(() => null);
        if (pollGen !== this.pollGen) return;
        const state = info.klippy_state;
        this.setKlippy(
          state === 'startup' || state === 'shutdown' || state === 'error' ? state : 'disconnected',
          pi?.state_message ?? '',
        );
        this.snapshot = { ...this.snapshot, names: null };
      } else {
        const now = Date.now();
        this.lostSince ??= now;
        this.attempt++;
        this.setState({
          kind: 'reconnecting',
          attempt: this.attempt,
          retryAt: now + TIMING.pollInterval,
          since: this.lostSince,
        });
      }
    }
    if (pollGen === this.pollGen) this.after('poll', TIMING.pollInterval, () => this.poll());
  }

  // ---------------------------------------------------------------- state & emitting

  private setKlippy(klippyState: KlippyProblem, message: string) {
    // Keep the parsed status consistent with what the connection knows.
    this.raw = mergeStatus(this.raw, { webhooks: { state: klippyState, state_message: message } });
    this.setState({ kind: 'klippy', klippyState, message });
  }

  private setState(state: ConnectionState) {
    this.snapshot = { ...this.snapshot, state };
    this.emitNow();
  }

  private scheduleEmit() {
    if (this.timers.has('emit')) return;
    const wait = TIMING.emitInterval - (Date.now() - this.lastEmit);
    if (wait <= 0) this.emitNow();
    else this.after('emit', wait, () => this.emitNow());
  }

  private emitNow() {
    this.clear('emit');
    this.lastEmit = Date.now();
    const { names } = this.snapshot;
    if (names && Object.keys(this.raw).length) {
      this.snapshot = { ...this.snapshot, status: parseStatus(this.raw, names) };
    }
    for (const l of this.listeners) l(this.snapshot);
  }

  // ---------------------------------------------------------------- timers

  private after(name: TimerName, ms: number, fn: () => void) {
    this.clear(name);
    this.timers.set(
      name,
      setTimeout(() => {
        this.timers.delete(name);
        fn();
      }, ms),
    );
  }

  private clear(name: TimerName) {
    const t = this.timers.get(name);
    if (t !== undefined) clearTimeout(t);
    this.timers.delete(name);
  }

  private clearAll() {
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
  }
}
