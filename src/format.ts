import type { Lang } from './store';

export function formatDuration(seconds: number | null): string {
  if (seconds == null || !isFinite(seconds) || seconds <= 0) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h} h ${m.toString().padStart(2, '0')} min`;
  if (m > 0) return `${m} min`;
  return `${Math.round(seconds)} s`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

export function formatDate(unixSeconds: number, lang: Lang): string {
  return new Date(unixSeconds * 1000).toLocaleDateString(lang, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Clock time, prefixed with the weekday when it isn't today. */
export function formatClock(date: Date | null, lang: Lang): string {
  if (!date) return '—';
  const time = date.toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' });
  if (date.toDateString() === new Date().toDateString()) return time;
  return `${date.toLocaleDateString(lang, { weekday: 'short' })} ${time}`;
}

export function baseName(path: string): string {
  return path.split('/').pop()!.replace(/\.(gcode|g|gco)$/i, '');
}
