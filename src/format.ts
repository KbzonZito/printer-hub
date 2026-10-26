import type { PrintState } from './api/moonraker';

export function formatDuration(seconds: number): string {
  if (!isFinite(seconds) || seconds <= 0) return '—';
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

export function formatDate(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleDateString('es', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function baseName(path: string): string {
  return path.split('/').pop()!.replace(/\.(gcode|g|gco)$/i, '');
}

export const stateLabel: Record<PrintState, string> = {
  standby: 'En espera',
  printing: 'Imprimiendo',
  paused: 'En pausa',
  complete: 'Completado',
  cancelled: 'Cancelado',
  error: 'Error',
};
