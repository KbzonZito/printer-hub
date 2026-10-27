import { defaultSettings, newPrinter, type Printer, type Settings, type State } from './store';

// Settings backup: printers, presets and appearance in a JSON file the user keeps.

const FORMAT = 'printer-hub-backup';
const VERSION = 1;

export function backupJson(state: State): string {
  const { onboarded: _, ...settings } = state.settings;
  return JSON.stringify(
    {
      format: FORMAT,
      version: VERSION,
      exportedAt: new Date().toISOString(),
      printers: state.printers,
      activeId: state.activeId,
      settings,
    },
    null,
    2,
  );
}

export function backupFileName(date = new Date()) {
  return `printer-hub-${date.toISOString().slice(0, 10)}.json`;
}

export class BackupError extends Error {}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function readPrinter(raw: unknown): Printer | null {
  if (!isObject(raw) || typeof raw.host !== 'string' || !raw.host.trim()) return null;
  const base = newPrinter();
  const pick = <K extends keyof Printer>(key: K) =>
    typeof raw[key] === typeof base[key] ? (raw[key] as Printer[K]) : base[key];
  return {
    id: pick('id'),
    name: pick('name'),
    host: raw.host.trim(),
    port: pick('port'),
    cameraMode: pick('cameraMode'),
    cameraUrl: pick('cameraUrl'),
  };
}

/** Keeps only known settings whose type matches the defaults; the rest stay as defaults. */
function readSettings(raw: unknown): Settings {
  const base = defaultSettings();
  if (!isObject(raw)) return { ...base, onboarded: true };
  const out: Record<string, unknown> = { ...base };
  for (const key of Object.keys(base) as (keyof Settings)[]) {
    const value = raw[key];
    if (
      value !== undefined &&
      typeof value === typeof base[key] &&
      Array.isArray(value) === Array.isArray(base[key])
    )
      out[key] = value;
  }
  const presets = (out.presets as unknown[]).filter(
    (p) =>
      isObject(p) &&
      typeof p.id === 'string' &&
      typeof p.name === 'string' &&
      typeof p.nozzle === 'number' &&
      typeof p.bed === 'number',
  );
  return {
    ...(out as unknown as Settings),
    presets: presets as Settings['presets'],
    onboarded: true,
  };
}

/** Reads a backup file into the app state it restores. Throws BackupError if it isn't one. */
export function parseBackup(text: string): State {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new BackupError('invalid');
  }
  if (!isObject(data) || data.format !== FORMAT) throw new BackupError('invalid');
  if (typeof data.version !== 'number' || data.version > VERSION) throw new BackupError('newer');
  const printers = (Array.isArray(data.printers) ? data.printers : [])
    .map(readPrinter)
    .filter((p): p is Printer => p != null);
  const activeId =
    typeof data.activeId === 'string' && printers.some((p) => p.id === data.activeId)
      ? data.activeId
      : (printers[0]?.id ?? null);
  return { printers, activeId, settings: readSettings(data.settings) };
}
