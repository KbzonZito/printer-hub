import { createContext, useContext, useEffect, useRef } from 'react';
import type { PrinterStatus } from './api/moonraker';
import type { PrinterConnection, Snapshot } from './connection/PrinterConnection';
import { tr } from './i18n';

// What the screens read about the active printer. The data comes from the live connection
// managed by ConnectionProvider (src/connection/ConnectionProvider.tsx).

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
  /** Moonraker answers (Klipper itself may still be starting or in error). */
  connected: boolean;
  /** Recent temperatures, oldest first (about the last 20 minutes, one per second). */
  tempHistory: TempSample[];
  refresh: () => void;
}

export const OFFLINE_SNAPSHOT: Snapshot = {
  state: { kind: 'connecting' },
  mode: 'realtime',
  status: null,
  names: null,
  server: null,
};

export const ConnectionContext = createContext<PrinterConnection | null>(null);
export const SnapshotContext = createContext<Snapshot>(OFFLINE_SNAPSHOT);
export const TempHistoryContext = createContext<TempSample[]>([]);

export const useConnection = () => useContext(ConnectionContext);
export const useConnectionSnapshot = () => useContext(SnapshotContext);

export function usePrinterStatus(): StatusState {
  const conn = useContext(ConnectionContext);
  const snap = useContext(SnapshotContext);
  const tempHistory = useContext(TempHistoryContext);
  const kind = snap.state.kind;
  return {
    status: snap.status,
    error: kind === 'reconnecting' ? tr('err.unreachable') : null,
    connected: kind === 'ready' || kind === 'klippy',
    tempHistory,
    refresh: () => conn?.refresh(),
  };
}

/** Moonraker components (job_queue, timelapse…), known once connected. */
export function useCapabilities() {
  const { server } = useContext(SnapshotContext);
  const components = server?.components;
  return {
    known: components != null,
    has: (component: string) => components?.includes(component) ?? false,
  };
}

/** Whether actions that move or heat the printer make sense right now. */
export function usePrinterReady() {
  return useContext(SnapshotContext).state.kind === 'ready';
}

/** Runs `handler` for a Moonraker notification, e.g. notify_gcode_response. */
export function useConnectionEvent(method: string, handler: (params: any[]) => void) {
  const conn = useContext(ConnectionContext);
  const latest = useRef(handler);
  latest.current = handler;
  useEffect(() => {
    if (!conn) return;
    return conn.onEvent((m, params) => {
      if (m === method) latest.current(params);
    });
  }, [conn, method]);
}
