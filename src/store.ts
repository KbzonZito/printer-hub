import { useCallback, useSyncExternalStore } from 'react';

export type CameraMode = 'auto' | 'webrtc' | 'mjpeg' | 'snapshot';

export interface Printer {
  id: string;
  name: string;
  host: string;
  port: number;
  cameraMode: CameraMode;
  /** Overrides the auto-detected stream/snapshot URL when set. */
  cameraUrl: string;
}

interface State {
  printers: Printer[];
  activeId: string | null;
}

const KEY = 'printer-hub:v1';

function load(): State {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* storage unavailable or corrupt */
  }
  return { printers: [], activeId: null };
}

let state = load();
const listeners = new Set<() => void>();

function setState(next: State) {
  state = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function newPrinter(): Printer {
  return {
    id: Math.random().toString(36).slice(2, 10),
    name: 'Creality Hi',
    host: '',
    port: 7125,
    cameraMode: 'auto',
    cameraUrl: '',
  };
}

export function useStore() {
  const s = useSyncExternalStore(subscribe, () => state);
  const active = s.printers.find((p) => p.id === s.activeId) ?? s.printers[0] ?? null;

  const savePrinter = useCallback((p: Printer) => {
    const exists = state.printers.some((x) => x.id === p.id);
    setState({
      printers: exists ? state.printers.map((x) => (x.id === p.id ? p : x)) : [...state.printers, p],
      activeId: state.activeId ?? p.id,
    });
  }, []);

  const removePrinter = useCallback((id: string) => {
    const printers = state.printers.filter((x) => x.id !== id);
    setState({
      printers,
      activeId: state.activeId === id ? (printers[0]?.id ?? null) : state.activeId,
    });
  }, []);

  const selectPrinter = useCallback((id: string) => setState({ ...state, activeId: id }), []);

  return { printers: s.printers, active, savePrinter, removePrinter, selectPrinter };
}
