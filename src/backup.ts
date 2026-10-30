import { isObject, sanitizePrinter, sanitizeSettings, type Printer, type State } from './store';

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
    .map(sanitizePrinter)
    .filter((p): p is Printer => p != null);
  const activeId =
    typeof data.activeId === 'string' && printers.some((p) => p.id === data.activeId)
      ? data.activeId
      : (printers[0]?.id ?? null);
  return { printers, activeId, settings: { ...sanitizeSettings(data.settings), onboarded: true } };
}
