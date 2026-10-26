import type { FileMetadata, PrinterStatus } from './api/moonraker';
import type { EtaMethod } from './store';

export interface Eta {
  /** Seconds left, or null when there isn't enough data yet. */
  remaining: number | null;
  finishAt: Date | null;
  /** The method that produced `remaining`; 'auto' means a file + filament blend. */
  method: EtaMethod | null;
  slicerTotal: number | null;
}

// Extrapolates total time from elapsed time and a 0–1 progress value.
function fromProgress(elapsed: number, progress: number): number | null {
  if (!(progress > 0.01) || elapsed <= 0) return null;
  return Math.max(elapsed / progress - elapsed, 0);
}

export function computeEta(
  s: PrinterStatus,
  meta: FileMetadata | undefined,
  method: EtaMethod,
): Eta {
  const elapsed = s.printDuration;
  const slicerTotal = meta?.estimated_time ?? null;
  const byMethod = {
    slicer: slicerTotal != null ? Math.max(slicerTotal - elapsed, 0) : null,
    printer: fromProgress(elapsed, s.displayProgress),
    file: fromProgress(elapsed, s.progress),
    filament: meta?.filament_total
      ? fromProgress(elapsed, s.filamentUsed / meta.filament_total)
      : null,
  };

  let used: Eta['method'] = null;
  let remaining: number | null = null;
  if (method !== 'auto' && byMethod[method] != null) {
    used = method;
    remaining = byMethod[method];
  } else if (s.progress < 0.05 && byMethod.slicer != null) {
    // Progress-based guesses are noisy during the first layers.
    used = 'slicer';
    remaining = byMethod.slicer;
  } else {
    const blend = [byMethod.file, byMethod.filament].filter((v): v is number => v != null);
    if (blend.length) {
      used = blend.length === 2 ? 'auto' : byMethod.file != null ? 'file' : 'filament';
      remaining = blend.reduce((a, b) => a + b, 0) / blend.length;
    } else {
      const fallback = (['printer', 'slicer'] as const).find((k) => byMethod[k] != null);
      if (fallback) {
        used = fallback;
        remaining = byMethod[fallback];
      }
    }
  }

  return {
    remaining,
    finishAt: remaining != null ? new Date(Date.now() + remaining * 1000) : null,
    method: used,
    slicerTotal,
  };
}
