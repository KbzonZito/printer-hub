import type { Printer } from '../store';
import { del, get, post } from './moonraker';

// Moonraker's job queue: https://moonraker.readthedocs.io/en/latest/web_api/#job-queue-apis

export interface QueuedJob {
  job_id: string;
  filename: string;
  time_added: number;
  time_in_queue: number;
}

export interface QueueStatus {
  queued_jobs: QueuedJob[];
  /** "ready" starts the next job when the printer is free; "paused" waits. */
  queue_state: 'ready' | 'paused' | 'loading' | 'starting';
}

const list = (names: string[]) => names.map(encodeURIComponent).join(',');

export const fetchQueue = (p: Printer) => get<QueueStatus>(p, '/server/job_queue/status');

export const enqueue = (p: Printer, filenames: string[]) =>
  post<QueueStatus>(p, `/server/job_queue/job?filenames=${list(filenames)}`);

/** Replaces the whole queue (used to reorder it). */
export const replaceQueue = (p: Printer, filenames: string[]) =>
  filenames.length
    ? post<QueueStatus>(p, `/server/job_queue/job?filenames=${list(filenames)}&reset=true`)
    : del<QueueStatus>(p, '/server/job_queue/job?all=true');

export const dequeue = (p: Printer, jobIds: string[]) =>
  del<QueueStatus>(p, `/server/job_queue/job?job_ids=${jobIds.join(',')}`);

export const startQueue = (p: Printer) => post<QueueStatus>(p, '/server/job_queue/start');
export const pauseQueue = (p: Printer) => post<QueueStatus>(p, '/server/job_queue/pause');
