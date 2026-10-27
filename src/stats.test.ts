import { describe, expect, it } from 'vitest';
import type { HistoryJob } from './api/moonraker';
import { groupJobs, summarize } from './stats';

const job = (date: string, status: string, hours: number, mm: number): HistoryJob => ({
  job_id: date,
  filename: 'a.gcode',
  status,
  start_time: new Date(date).getTime() / 1000,
  end_time: null,
  print_duration: hours * 3600,
  total_duration: hours * 3600,
  filament_used: mm,
});

// Wednesday 15 October 2026, local time.
const now = new Date(2026, 9, 15, 12).getTime();

describe('stats', () => {
  const jobs = [
    job('2026-10-13T10:00:00', 'completed', 2, 1000), // this week (Mon 12)
    job('2026-10-12T08:00:00', 'cancelled', 1, 300), // this week, Monday
    job('2026-10-11T20:00:00', 'completed', 3, 2000), // previous week (Sunday)
    job('2026-09-02T10:00:00', 'error', 0.5, 50), // September
    job('2025-01-01T10:00:00', 'completed', 9, 9000), // out of range
  ];

  it('groups by week, oldest first, with empty weeks', () => {
    const weeks = groupJobs(jobs, 'week', 4, now);
    expect(weeks).toHaveLength(4);
    expect(new Date(weeks[3].start).getDay()).toBe(1);
    expect(weeks[3]).toMatchObject({ jobs: 2, completed: 1, hours: 3, filament: 1300 });
    expect(weeks[2]).toMatchObject({ jobs: 1, completed: 1, hours: 3 });
    expect(weeks[0].jobs).toBe(0);
  });

  it('groups by month', () => {
    const months = groupJobs(jobs, 'month', 3, now);
    expect(months.map((m) => m.jobs)).toEqual([0, 1, 3]);
  });

  it('summarizes the period', () => {
    const s = summarize(groupJobs(jobs, 'month', 12, now));
    expect(s.jobs).toBe(4);
    expect(s.successRate).toBeCloseTo(0.5);
    expect(s.hours).toBeCloseTo(6.5);
  });
});
