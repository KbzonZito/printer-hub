import { describe, expect, it } from 'vitest';
import type { PrinterStatus } from './api/moonraker';
import { parseStatus } from './connection/statusModel';
import { computeEta } from './eta';

const NAMES = { chamber: null, lightPin: null, fan: null, fanScale: 1 };

/** A print `elapsed` seconds in, with file / display progress and filament used (mm). */
function printing(elapsed: number, file: number, display = file, filament = 0): PrinterStatus {
  return parseStatus(
    {
      print_stats: { state: 'printing', print_duration: elapsed, filament_used: filament },
      virtual_sdcard: { progress: file },
      display_status: { progress: display },
    },
    NAMES,
  );
}

describe('remaining time', () => {
  it('uses the slicer during the first layers, when progress is noisy', () => {
    const eta = computeEta(printing(120, 0.02), { estimated_time: 3600 }, 'auto');
    expect(eta.method).toBe('slicer');
    expect(eta.remaining).toBe(3480);
  });

  it('blends file progress and filament later on', () => {
    // Halfway by file position (1 h left), 60 % of the filament (40 min left): 50 min.
    const eta = computeEta(printing(3600, 0.5, 0.5, 600), { filament_total: 1000 }, 'auto');
    expect(eta.method).toBe('auto');
    expect(eta.remaining).toBeCloseTo((3600 + 2400) / 2);
  });

  it('honours the method chosen in Settings', () => {
    const s = printing(1800, 0.25, 0.5);
    expect(computeEta(s, undefined, 'printer')).toMatchObject({
      method: 'printer',
      remaining: 1800,
    });
    expect(computeEta(s, undefined, 'file')).toMatchObject({ method: 'file', remaining: 5400 });
    expect(computeEta(s, { estimated_time: 2000 }, 'slicer').remaining).toBe(200);
  });

  it('falls back when the chosen method has no data', () => {
    // No slicer time: "slicer" falls back to the automatic choice.
    expect(computeEta(printing(1800, 0.5), undefined, 'slicer').method).toBe('file');
  });

  it('never goes negative, and says when it cannot tell', () => {
    expect(computeEta(printing(5000, 0.9), { estimated_time: 3600 }, 'slicer').remaining).toBe(0);
    const none = computeEta(printing(0, 0), undefined, 'auto');
    expect(none).toMatchObject({ remaining: null, finishAt: null, method: null });
  });

  it('gives the finish time from now', () => {
    const before = Date.now();
    const eta = computeEta(printing(1800, 0.5), undefined, 'file');
    expect(eta.finishAt!.getTime() - before).toBeGreaterThanOrEqual(1800 * 1000 - 50);
  });
});
