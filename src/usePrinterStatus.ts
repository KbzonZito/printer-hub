import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { fetchStatus, type PrinterStatus } from './api/moonraker';
import type { Printer } from './store';

export interface StatusState {
  status: PrinterStatus | null;
  error: string | null;
  connected: boolean;
  refresh: () => void;
}

const POLL_MS = 2000;

export function usePrinterStatusPoll(printer: Printer | null): StatusState {
  const [status, setStatus] = useState<PrinterStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const tick = useRef<() => void>(() => {});

  useEffect(() => {
    setStatus(null);
    setError(null);
    if (!printer?.host) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const poll = async () => {
      clearTimeout(timer);
      try {
        const s = await fetchStatus(printer);
        if (cancelled) return;
        setStatus(s);
        setError(null);
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

  return { status, error, connected: !!status && !error, refresh: () => tick.current() };
}

export const StatusContext = createContext<StatusState>({
  status: null,
  error: null,
  connected: false,
  refresh: () => {},
});

export const usePrinterStatus = () => useContext(StatusContext);
