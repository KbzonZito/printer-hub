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

/** Loads and parses a G-code file; `file` null means nothing to load. */
export function useGcodeModel(printer: Printer, file: GcodeFile | null): GcodeModelState {
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
    const stats = emptyStats();
    let hint: number | null = null;
    let received = 0;
    let total: number | null = file.size || null;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const publish = (patch: Partial<Omit<GcodeModelState, 'reload'>> = {}) => {
      if (cancelled) return;
      clearTimeout(timer);
      timer = undefined;
      setState({
        ...latest.current,
        layers: layers.slice(),
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
        publish({ status: 'ready', summary: m.summary });
        worker?.terminate();
        worker = null;
        putModel(key, { summary: m.summary, layers, stats: { ...stats, fromCache: false } });
      };
      worker.onerror = (e) => fail(e.message || 'worker');
      post({ type: 'start' });

      const t0 = performance.now();
      const res = await fetch(gcodeFileUrl(printer, file.path), { signal: controller.signal });
      if (!res.ok) return fail(`HTTP ${res.status}`);
      total = Number(res.headers.get('content-length')) || total;
      const send = (chunk: Uint8Array) => {
        if (stats.firstByteMs == null) stats.firstByteMs = performance.now() - t0;
        stats.chunks++;
        received += chunk.length;
        // Transfer the bytes; a view into a bigger buffer is copied first.
        const own =
          chunk.byteOffset === 0 && chunk.byteLength === chunk.buffer.byteLength
            ? chunk
            : chunk.slice();
        post({ type: 'chunk', data: own.buffer as ArrayBuffer }, [own.buffer as ArrayBuffer]);
        schedule();
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

function initial(): Omit<GcodeModelState, 'reload'> {
  return {
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
