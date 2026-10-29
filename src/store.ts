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

export type FileSort = 'date' | 'name' | 'size';

export interface TempPreset {
  id: string;
  name: string;
  nozzle: number;
  bed: number;
  /** Price per kg of filament, for the cost of each print (optional). */
  price?: number;
}

export const DEFAULT_PRESETS: TempPreset[] = [
  { id: 'pla', name: 'PLA', nozzle: 210, bed: 60 },
  { id: 'petg', name: 'PETG', nozzle: 240, bed: 75 },
  { id: 'abs', name: 'ABS', nozzle: 250, bed: 100 },
  { id: 'tpu', name: 'TPU', nozzle: 225, bed: 50 },
];

export interface Settings {
  lang: Lang;
  theme: Theme;
  /** Seed color for the palette: 'device' uses the Android wallpaper color, else a hex. */
  color: string;
  paletteStyle: PaletteStyle;
  eta: EtaMethod;
  presets: TempPreset[];
  /** Symbol shown with print costs. */
  currency: string;
  fileSort: FileSort;
  fileSortDesc: boolean;
  fileView: 'list' | 'grid';
  /** The welcome wizard was completed (or skipped). */
  onboarded: boolean;
  /** Background notifications and widget updates while printing (Android). */
  notify: boolean;
  /** Also notify when the first layer is done (needs layer info from the slicer). */
  notifyFirstLayer: boolean;
  /** Power device to switch off once a print finishes and the nozzle cools (Android). */
  powerOffDevice: string;
  /** Saved G-code previews not opened for this many days are deleted (0 = never). */
  previewCacheDays: number;
}

export interface State {
  printers: Printer[];
  activeId: string | null;
  settings: Settings;
}

const KEY = 'printer-hub:v1';

export function defaultSettings(): Settings {
  const lang =
    typeof navigator !== 'undefined' && !navigator.language.startsWith('es') ? 'en' : 'es';
  return {
    lang,
    theme: 'system',
    color: 'device',
    paletteStyle: 'tonalSpot',
    eta: 'auto',
    presets: DEFAULT_PRESETS,
    currency: '$',
    fileSort: 'date',
    fileSortDesc: true,
    fileView: 'list',
    notify: true,
    notifyFirstLayer: false,
    powerOffDevice: '',
    previewCacheDays: 30,
    onboarded: false,
  };
}

function load(): State {
  const fallback = { printers: [], activeId: null, settings: defaultSettings() };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      // Installs from before the welcome wizard already have their printers set up.
      const onboarded = saved.settings?.onboarded ?? (saved.printers?.length ?? 0) > 0;
      return {
        ...fallback,
        ...saved,
        settings: { ...fallback.settings, ...saved.settings, onboarded },
      };
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

/** Everything saved, for backups (src/backup.ts). */
export const getState = () => state;
export const replaceState = (next: State) => setState(next);

export const newId = () => Math.random().toString(36).slice(2, 10);

export function newPrinter(): Printer {
  return {
    id: newId(),
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
