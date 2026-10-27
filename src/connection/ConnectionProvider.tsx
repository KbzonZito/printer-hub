import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { App as CapApp } from '@capacitor/app';
import { temperatureStore } from '../api/moonraker';
import type { Printer } from '../store';
import {
  ConnectionContext,
  OFFLINE_SNAPSHOT,
  SnapshotContext,
  TempHistoryContext,
  type TempSample,
} from '../usePrinterStatus';
import { createConnection } from '.';
import type { PrinterConnection, Snapshot } from './PrinterConnection';

const HISTORY_MS = 20 * 60 * 1000;
/** In the background the connection stays open this long, then closes until the app returns. */
const BACKGROUND_GRACE_MS = 30_000;

/** Seeds the chart from Moonraker's temperature store (one sample per second). */
async function loadTempHistory(p: Printer): Promise<TempSample[]> {
  const store = await temperatureStore(p);
  const ext = store.extruder?.temperatures ?? [];
  const bed = store.heater_bed?.temperatures ?? [];
  const n = Math.min(ext.length, bed.length);
  const now = Date.now();
  return Array.from({ length: n }, (_, i) => ({
    time: now - (n - 1 - i) * 1000,
    extruder: ext[ext.length - n + i],
    extruderTarget: store.extruder?.targets?.[ext.length - n + i] ?? 0,
    bed: bed[bed.length - n + i],
    bedTarget: store.heater_bed?.targets?.[bed.length - n + i] ?? 0,
  }));
}

/** One live connection for the active printer, shared by every screen. */
export function ConnectionProvider({
  printer,
  children,
}: {
  printer: Printer | null;
  children: ReactNode;
}) {
  const [conn, setConn] = useState<PrinterConnection | null>(null);

  // Created inside the effect (not during render) so StrictMode's double run works.
  useEffect(() => {
    if (!printer?.host) return setConn(null);
    const c = createConnection(printer);
    c.start();
    setConn(c);
    return () => c.stop();
  }, [printer?.id, printer?.host, printer?.port]);

  // Close the socket a while after the app goes to the background; reopen on return.
  useEffect(() => {
    if (!conn) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const sub = CapApp.addListener('appStateChange', ({ isActive }) => {
      clearTimeout(timer);
      if (isActive) conn.resume();
      else timer = setTimeout(() => conn.pause(), BACKGROUND_GRACE_MS);
    });
    return () => {
      clearTimeout(timer);
      sub.then((s) => s.remove());
    };
  }, [conn]);

  const subscribe = useCallback(
    (onChange: () => void) => conn?.subscribe(onChange) ?? (() => {}),
    [conn],
  );
  const snapshot = useSyncExternalStore(subscribe, () => conn?.getSnapshot() ?? OFFLINE_SNAPSHOT);
  const tempHistory = useTempHistory(printer, snapshot.status);

  return (
    <ConnectionContext.Provider value={conn}>
      <SnapshotContext.Provider value={snapshot}>
        <TempHistoryContext.Provider value={tempHistory}>{children}</TempHistoryContext.Provider>
      </SnapshotContext.Provider>
    </ConnectionContext.Provider>
  );
}

/** Temperature chart data: the stored history, then one sample per second. */
function useTempHistory(printer: Printer | null, status: Snapshot['status']) {
  const [history, setHistory] = useState<TempSample[]>([]);
  const latest = useRef(status);
  latest.current = status;

  useEffect(() => {
    setHistory([]);
    if (!printer?.host) return;
    let cancelled = false;
    loadTempHistory(printer)
      .then((h) => !cancelled && setHistory((cur) => [...h, ...cur]))
      .catch(() => {});
    const id = setInterval(() => {
      const s = latest.current;
      if (!s || document.hidden) return;
      const now = Date.now();
      setHistory((h) => [
        ...h.filter((x) => now - x.time < HISTORY_MS),
        {
          time: now,
          extruder: s.extruder.temperature,
          extruderTarget: s.extruder.target,
          bed: s.bed.temperature,
          bedTarget: s.bed.target,
        },
      ]);
    }, 1000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [printer?.id, printer?.host, printer?.port]);

  return history;
}
