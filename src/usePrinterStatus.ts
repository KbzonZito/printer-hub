import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { fetchStatus, temperatureStore, type PrinterStatus } from './api/moonraker';
import type { Printer } from './store';

export interface TempSample {
  time: number;
  extruder: number;
  extruderTarget: number;
  bed: number;
  bedTarget: number;
}

export interface StatusState {
  status: PrinterStatus | null;
  error: string | null;
  connected: boolean;
  /** Recent temperatures, oldest first (about the last 20 minutes). */
  tempHistory: TempSample[];
  refresh: () => void;
}

const POLL_MS = 2000;
const HISTORY_MS = 20 * 60 * 1000;

/** Seeds the chart from Moonraker's 1 s temperature store, thinned to the poll interval. */
async function loadTempHistory(p: Printer): Promise<TempSample[]> {
  const store = await temperatureStore(p);
  const ext = store.extruder?.temperatures ?? [];
  const bed = store.heater_bed?.temperatures ?? [];
  const n = Math.min(ext.length, bed.length);
  const now = Date.now();
  const step = POLL_MS / 1000;
  const samples: TempSample[] = [];
  for (let i = n % step; i < n; i += step) {
    samples.push({
      time: now - (n - 1 - i) * 1000,
      extruder: ext[ext.length - n + i],
      extruderTarget: store.extruder?.targets?.[ext.length - n + i] ?? 0,
      bed: bed[bed.length - n + i],
      bedTarget: store.heater_bed?.targets?.[bed.length - n + i] ?? 0,
    });
  }
  return samples;
}

export function usePrinterStatusPoll(printer: Printer | null): StatusState {
  const [status, setStatus] = useState<PrinterStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tempHistory, setTempHistory] = useState<TempSample[]>([]);
  const tick = useRef<() => void>(() => {});

  useEffect(() => {
    setStatus(null);
    setError(null);
    setTempHistory([]);
    if (!printer?.host) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    loadTempHistory(printer)
      .then((h) => !cancelled && setTempHistory((cur) => [...h, ...cur]))
      .catch(() => {});

    const poll = async () => {
      clearTimeout(timer);
      try {
        const s = await fetchStatus(printer);
        if (cancelled) return;
        setStatus(s);
        setError(null);
        const now = Date.now();
        setTempHistory((h) => [
          ...h.filter((x) => now - x.time < HISTORY_MS),
          {
            time: now,
            extruder: s.extruder.temperature,
            extruderTarget: s.extruder.target,
            bed: s.bed.temperature,
            bedTarget: s.bed.target,
          },
        ]);
      } catch (err) {
        if (cancelled) return;
        setError((err as Error).message);
      }
      if (!cancelled && !document.hidden) timer = setTimeout(poll, POLL_MS);
    };
    tick.current = poll;

    const onVisibility = () => !document.hidden && poll();
    document.addEventListener('visibilitychange', onVisibility);
    poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [printer?.id, printer?.host, printer?.port]);

  return {
    status,
    error,
    connected: !!status && !error,
    tempHistory,
    refresh: () => tick.current(),
  };
}

export const StatusContext = createContext<StatusState>({
  status: null,
  error: null,
  connected: false,
  tempHistory: [],
  refresh: () => {},
});

export const usePrinterStatus = () => useContext(StatusContext);
