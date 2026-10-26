import { fetchHistory, type FileMetadata, type HistoryJob } from './api/moonraker';
import type { Printer } from './store';

// Print time estimates for a file before printing it, refined with this printer's own
// history: how its real print times compare with slicer estimates, and how fast it
// usually extrudes filament.

export interface Calibration {
  /** Median of actual / slicer time over completed prints. */
  ratio: number | null;
  /** Typical filament extruded per second of printing (mm/s). */
  rate: number | null;
  samples: number;
  jobs: HistoryJob[];
}

const cache = new Map<string, Promise<Calibration>>();

function median(values: number[]) {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function loadCalibration(p: Printer): Promise<Calibration> {
  let pending = cache.get(p.id);
  if (!pending) {
    pending = fetchHistory(p, 100).then((jobs) => {
      const done = jobs.filter((j) => j.status === 'completed' && j.print_duration > 300);
      const ratios = done
        .filter((j) => j.metadata?.estimated_time)
        .map((j) => j.print_duration / j.metadata!.estimated_time!)
        .filter((r) => r > 0.3 && r < 3);
      const rates = done
        .filter((j) => j.filament_used > 0)
        .map((j) => j.filament_used / j.print_duration);
      return { ratio: median(ratios), rate: median(rates), samples: ratios.length, jobs };
    });
    pending.catch(() => cache.delete(p.id));
    cache.set(p.id, pending);
  }
  return pending;
}

export interface FileEstimate {
  slicer: number | null;
  /** Slicer time corrected with this printer's history. */
  calibrated: number | null;
  /** From filament length and the usual extrusion rate, when the slicer gave no time. */
  byFilament: number | null;
  /** Real duration the last time this exact file finished. */
  lastActual: number | null;
  /** The figure to show first. */
  best: number | null;
}

export function estimateFile(
  path: string,
  meta: FileMetadata | undefined,
  cal: Calibration | null,
) {
  const slicer = meta?.estimated_time || null;
  const calibrated = slicer && cal?.ratio ? slicer * cal.ratio : null;
  const byFilament = meta?.filament_total && cal?.rate ? meta.filament_total / cal.rate : null;
  const last = cal?.jobs.find((j) => j.filename === path && j.status === 'completed');
  const lastActual = last?.print_duration ?? null;
  return {
    slicer,
    calibrated,
    byFilament,
    lastActual,
    best: lastActual ?? calibrated ?? slicer ?? byFilament,
  } satisfies FileEstimate;
}
