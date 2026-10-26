import { useCallback, useSyncExternalStore } from 'react';

export type CameraMode = 'auto' | 'webrtc' | 'mjpeg' | 'snapshot';
export type Lang = 'es' | 'en';
export type Theme = 'system' | 'light' | 'dark';
export type EtaMethod = 'auto' | 'slicer' | 'printer' | 'file' | 'filament';
export type PaletteStyle =
  | 'tonalSpot'
  | 'neutral'
  | 'vibrant'
  | 'expressive'
  | 'fidelity'
  | 'content'
  | 'rainbow'
  | 'fruitSalad'
  | 'monochrome';

export interface Printer {
  id: string;
  name: string;
  host: string;
  port: number;
  cameraMode: CameraMode;
  /** Overrides the auto-detected stream/snapshot URL when set. */
  cameraUrl: string;
}

export interface Settings {
  lang: Lang;
  theme: Theme;
  /** Seed color for the palette: 'device' uses the Android wallpaper color, else a hex. */
  color: string;
  paletteStyle: PaletteStyle;
  eta: EtaMethod;
  /** Background notifications and widget updates while printing (Android). */
  notify: boolean;
}

interface State {
  printers: Printer[];
  activeId: string | null;
  settings: Settings;
}

const KEY = 'printer-hub:v1';

function defaultSettings(): Settings {
  const lang =
    typeof navigator !== 'undefined' && !navigator.language.startsWith('es') ? 'en' : 'es';
  return { lang, theme: 'system', color: 'device', paletteStyle: 'tonalSpot', eta: 'auto', notify: true };
}

function load(): State {
  const fallback = { printers: [], activeId: null, settings: defaultSettings() };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      return { ...fallback, ...saved, settings: { ...fallback.settings, ...saved.settings } };
    }
  } catch {
    /* storage unavailable or corrupt */
  }
  return fallback;
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

/** Current settings for code that runs outside React (e.g. API error messages). */
export const getSettings = () => state.settings;

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

export function useSettings() {
  const settings = useSyncExternalStore(subscribe, () => state.settings);
  const updateSettings = useCallback(
    (patch: Partial<Settings>) => setState({ ...state, settings: { ...state.settings, ...patch } }),
    [],
  );
  return { settings, updateSettings };
}

export function useStore() {
  const s = useSyncExternalStore(subscribe, () => state);
  const active = s.printers.find((p) => p.id === s.activeId) ?? s.printers[0] ?? null;

  const savePrinter = useCallback((p: Printer) => {
    const exists = state.printers.some((x) => x.id === p.id);
    setState({
      ...state,
      printers: exists
        ? state.printers.map((x) => (x.id === p.id ? p : x))
        : [...state.printers, p],
      activeId: state.activeId ?? p.id,
    });
  }, []);

  const removePrinter = useCallback((id: string) => {
    const printers = state.printers.filter((x) => x.id !== id);
    setState({
      ...state,
      printers,
      activeId: state.activeId === id ? (printers[0]?.id ?? null) : state.activeId,
    });
  }, []);

  const selectPrinter = useCallback((id: string) => setState({ ...state, activeId: id }), []);

  return { printers: s.printers, active, savePrinter, removePrinter, selectPrinter };
}
