import { describe, expect, it, vi } from 'vitest';
import type { HistoryJob } from './api/moonraker';

const job = (filename: string, duration: number, estimated?: number, filament = 0): HistoryJob => ({
  job_id: filename + duration,
  filename,
  status: 'completed',
  start_time: 0,
  end_time: null,
  print_duration: duration,
  total_duration: duration,
  filament_used: filament,
  metadata: estimated ? { estimated_time: estimated } : undefined,
});

const jobs = [
  job('a.gcode', 3600, 3000, 36000), // took 1.2× the slicer, 10 mm/s
  job('b.gcode', 1800, 2000, 18000), // 0.9×, 10 mm/s
  job('c.gcode', 6000, 5000, 60000), // 1.2×, 10 mm/s
  job('short.gcode', 120, 100), // too short to count
];

vi.mock('./api/moonraker', () => ({ fetchHistory: vi.fn(async () => jobs) }));
const { estimateFile, loadCalibration } = await import('./estimate');
const printer = {
  id: 'p1',
  name: 'P',
  host: 'h',
  port: 7125,
  cameraMode: 'auto',
  cameraUrl: '',
} as const;

describe('file time estimates', () => {
  it('learns how this printer compares with the slicer (median), ignoring short prints', async () => {
    const cal = await loadCalibration({ ...printer });
    expect(cal.ratio).toBeCloseTo(1.2);
    expect(cal.rate).toBeCloseTo(10);
    expect(cal.samples).toBe(3);
  });

  it('prefers the last real time, then the calibrated slicer time, then the slicer, then filament', async () => {
    const cal = await loadCalibration({ ...printer });
    expect(estimateFile('a.gcode', { estimated_time: 3000 }, cal).best).toBe(3600);
    expect(estimateFile('new.gcode', { estimated_time: 1000 }, cal).best).toBeCloseTo(1200);
    expect(estimateFile('new.gcode', { estimated_time: 1000 }, null).best).toBe(1000);
    expect(estimateFile('new.gcode', { filament_total: 5000 }, cal).best).toBeCloseTo(500);
    expect(estimateFile('new.gcode', {}, cal).best).toBeNull();
  });
});
