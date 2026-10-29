import { useEffect, useRef, useState } from 'react';
import { gcodeFileUrl, type GcodeFile } from '../api/moonraker';
import type { Printer } from '../store';
import { deleteModel, getModel, putModel } from './cache';
import type { GcodeLayer, GcodeSummary } from './model';
import { PARSER_VERSION } from './parser';
import type { FromWorker, ToWorker } from './worker';

// Cache → download in chunks → worker → model. See docs/plans/vista-previa-gcode.md (D2, D3, D7).

/** Files above this aren't opened at all (D10). */
export const MAX_BYTES = 300e6;
/** Files above this ask first: at ~0.9 MB/s the Creality Hi takes about a minute. */
export const WARN_BYTES = 50e6;
/** Live mode (D11): header for the modes and objects, and the range around the printing byte. */
const PRIORITY_HEAD = 64 * 1024;
/** Before the printing byte: the start of its layer (big files have layers of up to ~1 MB). */
const PRIORITY_BEFORE = 1.5e6;
/** After it: the rest of that layer. */
const PRIORITY_AFTER = 0.75e6;
/** Closer to the start than this, downloading from the beginning reaches it sooner. */
const PRIORITY_MIN = 4e6;
/** Bytes sent to the worker at a time. */
const BATCH = 64 * 1024;
/** React updates while loading, at most this often. */
const UPDATE_MS = 200;

export interface LoadStats {
  fromCache: boolean;
  bytes: number;
  /** Time to the first chunk (shows whether the download really streams) and to the end. */
  firstByteMs: number | null;
  downloadMs: number | null;
  /** Time the worker spent parsing. */
  parseMs: number;
  chunks: number;
}

export interface GcodeModelState {
  status: 'loading' | 'ready' | 'error';
  layers: GcodeLayer[];
  summary: GcodeSummary | null;
  /** Layer count from the header, known early (for progress). */
  layersHint: number | null;
  received: number;
  total: number | null;
  error: string | null;
  stats: LoadStats;
  /**
   * The layers are only those around the printing position (live mode, D11) while the whole
   * file downloads; layer numbers aren't known yet.
   */
  partial: boolean;
  /** Drops the cached model and downloads the file again. */
  reload: () => void;
}

const emptyStats = (): LoadStats => ({
  fromCache: false,
  bytes: 0,
  firstByteMs: null,
  downloadMs: null,
  parseMs: 0,
  chunks: 0,
});

export function cacheKey(printer: Printer, file: GcodeFile) {
  return `${printer.id}:${file.path}:${file.modified}:${file.size}:v${PARSER_VERSION}`;
}

export interface ModelOptions {
  /** Byte being printed when opened: if the file isn't saved, that part loads first (D11). */
  liveOffset?: number | null;
}

/** Loads and parses a G-code file; `file` null means nothing to load. */
export function useGcodeModel(
  printer: Printer,
  file: GcodeFile | null,
  opts: ModelOptions = {},
): GcodeModelState {
  // Read once when loading starts; later positions don't restart the download.
  const liveOffset = useRef(opts.liveOffset);
  liveOffset.current ??= opts.liveOffset;
  const [state, setState] = useState<Omit<GcodeModelState, 'reload'>>(() => initial());
  // Bumped by reload(): skips the cache once.
  const [nonce, setNonce] = useState(0);
  const key = file ? cacheKey(printer, file) : null;
  const latest = useRef(state);
  latest.current = state;

  useEffect(() => {
    if (!file || !key) return;
    let cancelled = false;
    const controller = new AbortController();
    let worker: Worker | null = null;
    const layers: GcodeLayer[] = [];
    /** Layers around the printing position, shown until the full download reaches them. */
    let partial: GcodeLayer[] = [];
    const stats = emptyStats();
    let hint: number | null = null;
    let received = 0;
    let total: number | null = file.size || null;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const publish = (patch: Partial<Omit<GcodeModelState, 'reload'>> = {}) => {
      if (cancelled) return;
      clearTimeout(timer);
      timer = undefined;
      const pos = liveOffset.current ?? 0;
      const usePartial =
        partial.length > 0 && !(layers.length && layers[layers.length - 1].end > pos);
      setState({
        ...latest.current,
        layers: usePartial ? partial : layers.slice(),
        partial: usePartial,
        layersHint: hint,
        received,
        total,
        stats: { ...stats },
        ...patch,
      });
    };
    // Coalesce progress updates while chunks and layers stream in.
    const schedule = () => {
      timer ??= setTimeout(() => publish(), UPDATE_MS);
    };
    const fail = (message: string) => publish({ status: 'error', error: message });

    setState(initial());

    (async () => {
      if (file.size > MAX_BYTES) return fail('too-big');
      if (nonce) await deleteModel(key);
      const cached = nonce ? null : await getModel(key);
      if (cancelled) return;
      if (cached) {
        layers.push(...cached.layers);
        // Keep the figures of the original download for the info panel.
        Object.assign(stats, cached.stats ?? {});
        stats.fromCache = true;
        stats.bytes = cached.summary.bytes;
        hint = cached.summary.layersHint;
        received = total = cached.summary.bytes;
        return publish({ status: 'ready', summary: cached.summary });
      }

      const url = gcodeFileUrl(printer, file.path);
      const pos = liveOffset.current;
      if (pos != null && pos > PRIORITY_MIN) {
        const around = await loadAround(url, pos, file.size, controller.signal).catch(() => null);
        if (cancelled) return;
        if (around?.layers.length) {
          partial = around.layers;
          // Objects and kinds of the range, until the full summary arrives.
          publish({ summary: around.summary });
        }
      }

      worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
      const post = (m: ToWorker, transfer: Transferable[] = []) => worker!.postMessage(m, transfer);
      worker.onmessage = (e: MessageEvent<FromWorker>) => {
        const m = e.data;
        if (m.type === 'error') return fail(m.message);
        layers.push(...m.layers);
        stats.parseMs = m.busyMs;
        if (m.type === 'layers') {
          hint = m.hint;
          return schedule();
        }
        partial = [];
        publish({ status: 'ready', summary: m.summary });
        worker?.terminate();
        worker = null;
        putModel(key, { summary: m.summary, layers, stats: { ...stats, fromCache: false } });
      };
      worker.onerror = (e) => fail(e.message || 'worker');
      post({ type: 'start' });

      const t0 = performance.now();
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) return fail(`HTTP ${res.status}`);
      total = Number(res.headers.get('content-length')) || total;
      // Android delivers the download in ~4 KB pieces; each message to the worker has a fixed
      // cost, so pieces are gathered into blocks of BATCH bytes (~90 ms at the Hi's speed).
      let batch = new Uint8Array(BATCH);
      let filled = 0;
      const flush = () => {
        if (!filled) return;
        const data = batch.buffer.slice(0, filled);
        post({ type: 'chunk', data }, [data]);
        batch = new Uint8Array(BATCH);
        filled = 0;
        schedule();
      };
      const send = (chunk: Uint8Array) => {
        if (stats.firstByteMs == null) stats.firstByteMs = performance.now() - t0;
        stats.chunks++;
        received += chunk.length;
        let i = 0;
        while (i < chunk.length) {
          const n = Math.min(BATCH - filled, chunk.length - i);
          batch.set(chunk.subarray(i, i + n), filled);
          filled += n;
          i += n;
          if (filled === BATCH) flush();
        }
      };
      if (res.body) {
        const reader = res.body.getReader();
        for (;;) {
          const { done, value } = await reader.read();
          if (done || cancelled) break;
          if (value?.length) send(value);
        }
      } else {
        send(new Uint8Array(await res.arrayBuffer()));
      }
      flush();
      if (cancelled) return;
      stats.downloadMs = performance.now() - t0;
      stats.bytes = received;
      post({ type: 'end' });
    })().catch((e: Error) => {
      if (!cancelled) fail(e.name === 'AbortError' ? 'cancelled' : e.message);
    });

    return () => {
      cancelled = true;
      clearTimeout(timer);
      controller.abort();
      worker?.terminate();
    };
  }, [key, nonce]);

  return { ...state, reload: () => setNonce((n) => n + 1) };
}

/** Bytes a–b of the file (HTTP range). */
async function fetchRange(url: string, a: number, b: number, signal: AbortSignal) {
  const res = await fetch(url, { headers: { Range: `bytes=${a}-${b}` }, signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.arrayBuffer();
}

/**
 * D11: parses the header (modes, objects) and ~3 MB around `pos`, and returns the complete
 * layers of that range. A few seconds instead of downloading the whole file first.
 */
async function loadAround(url: string, pos: number, size: number, signal: AbortSignal) {
  const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  try {
    const from = Math.max(PRIORITY_HEAD, Math.floor(pos - PRIORITY_BEFORE));
    const to = Math.min(size - 1, Math.ceil(pos + PRIORITY_AFTER));
    const got: GcodeLayer[] = [];
    const done = new Promise<GcodeSummary>((resolve, reject) => {
      worker.onmessage = (e: MessageEvent<FromWorker>) => {
        const m = e.data;
        if (m.type === 'error') return reject(new Error(m.message));
        got.push(...m.layers);
        if (m.type === 'done') resolve(m.summary);
      };
      worker.onerror = (e) => reject(new Error(e.message));
    });
    const post = (m: ToWorker, transfer: Transferable[] = []) => worker.postMessage(m, transfer);
    post({ type: 'start' });
    const head = await fetchRange(url, 0, PRIORITY_HEAD - 1, signal);
    post({ type: 'chunk', data: head }, [head]);
    post({ type: 'seek', offset: from });
    const range = await fetchRange(url, from, to, signal);
    post({ type: 'chunk', data: range }, [range]);
    post({ type: 'end' });
    const summary = await done;
    // Keep the range's layers; the last one is cut unless the range reached the end.
    const inRange = got.filter((l) => l.start >= from);
    return { layers: to >= size - 1 ? inRange : inRange.slice(0, -1), summary };
  } finally {
    worker.terminate();
  }
}

function initial(): Omit<GcodeModelState, 'reload'> {
  return {
    partial: false,
    status: 'loading',
    layers: [],
    summary: null,
    layersHint: null,
    received: 0,
    total: null,
    error: null,
    stats: emptyStats(),
  };
}
