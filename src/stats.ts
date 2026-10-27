import type { HistoryJob } from './api/moonraker';

// Print statistics from Moonraker's history, grouped by week or month.

export type Period = 'week' | 'month';

export interface Bucket {
  /** Start of the week (Monday) or month, in ms. */
  start: number;
  jobs: number;
  completed: number;
  /** Seconds printing. */
  hours: number;
  /** Filament in mm. */
  filament: number;
}

function bucketStart(ms: number, period: Period) {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  if (period === 'month') d.setDate(1);
  else d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // back to Monday
  return d.getTime();
}

function previous(start: number, period: Period) {
  const d = new Date(start);
  if (period === 'month') d.setMonth(d.getMonth() - 1);
  else d.setDate(d.getDate() - 7);
  return d.getTime();
}

/** The last `count` weeks or months, oldest first, including empty ones. */
export function groupJobs(jobs: HistoryJob[], period: Period, count: number, now = Date.now()) {
  const starts = [bucketStart(now, period)];
  while (starts.length < count) starts.unshift(previous(starts[0], period));
  const buckets: Bucket[] = starts.map((start) => ({
    start,
    jobs: 0,
    completed: 0,
    hours: 0,
    filament: 0,
  }));
  const index = new Map(starts.map((s, i) => [s, i]));
  for (const job of jobs) {
    const b = buckets[index.get(bucketStart(job.start_time * 1000, period)) ?? -1];
    if (!b) continue;
    b.jobs++;
    if (job.status === 'completed') b.completed++;
    b.hours += job.print_duration / 3600;
    b.filament += job.filament_used;
  }
  return buckets;
}

export function summarize(buckets: Bucket[]) {
  const total = buckets.reduce(
    (acc, b) => ({
      jobs: acc.jobs + b.jobs,
      completed: acc.completed + b.completed,
      hours: acc.hours + b.hours,
      filament: acc.filament + b.filament,
    }),
    { jobs: 0, completed: 0, hours: 0, filament: 0 },
  );
  return { ...total, successRate: total.jobs ? total.completed / total.jobs : null };
}
