import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, ListOrdered, Pause, Play, Trash2, X } from 'lucide-react';
import {
  dequeue,
  fetchQueue,
  pauseQueue,
  replaceQueue,
  startQueue,
  type QueueStatus,
} from '../api/queue';
import { PullToRefresh } from '../components/PullToRefresh';
import { ConfirmSheet, useAction } from '../components/ui';
import { baseName } from '../format';
import { useT } from '../i18n';
import type { Printer } from '../store';
import { useConnectionEvent } from '../usePrinterStatus';

/** Moonraker's print queue: the next file starts by itself when the printer is free. */
export function QueueView({ printer }: { printer: Printer }) {
  const t = useT();
  const run = useAction();
  const [queue, setQueue] = useState<QueueStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);

  const load = () =>
    fetchQueue(printer)
      .then((q) => {
        setQueue(q);
        setError(null);
      })
      .catch((e) => setError((e as Error).message));
  useEffect(() => {
    load();
  }, [printer.id]);
  useConnectionEvent('notify_job_queue_changed', () => void load());

  const update = (fn: () => Promise<QueueStatus>) =>
    run(async () => {
      setQueue(await fn());
    });

  const jobs = queue?.queued_jobs ?? [];
  const running = queue?.queue_state !== 'paused';
  const move = (from: number, to: number) => {
    const names = jobs.map((j) => j.filename);
    names.splice(to, 0, ...names.splice(from, 1));
    update(() => replaceQueue(printer, names));
  };

  return (
    <PullToRefresh onRefresh={load}>
      {error && <p className="muted">{error}</p>}
      {!queue && !error && (
        <div className="empty">
          <div className="loader" />
        </div>
      )}
      {queue && (
        <div className="card queue-head">
          <span className="grow">
            <strong>{running ? t('queue.running') : t('queue.paused')}</strong>
            <small className="muted">
              {running ? t('queue.runningHint') : t('queue.pausedHint')}
            </small>
          </span>
          <button
            className={`btn ${running ? '' : 'primary'}`}
            disabled={!running && jobs.length === 0}
            onClick={() => update(() => (running ? pauseQueue(printer) : startQueue(printer)))}
          >
            {running ? <Pause size={18} /> : <Play size={18} />}
            {running ? t('queue.pause') : t('queue.start')}
          </button>
        </div>
      )}
      {queue && jobs.length === 0 && (
        <div className="empty">
          <ListOrdered size={36} />
          <p className="muted">{t('queue.empty')}</p>
        </div>
      )}
      <div className="file-list">
        {jobs.map((job, i) => (
          <div key={job.job_id} className="file-row queue-row">
            <span className="queue-pos">{i + 1}</span>
            <div className="file-info">
              <span className="file-name">{baseName(job.filename)}</span>
              {job.filename.includes('/') && (
                <span className="muted small">
                  {job.filename.slice(0, job.filename.lastIndexOf('/'))}
                </span>
              )}
            </div>
            <button
              className="btn icon ghost"
              disabled={i === 0}
              onClick={() => move(i, i - 1)}
              aria-label={t('queue.up')}
            >
              <ArrowUp size={18} />
            </button>
            <button
              className="btn icon ghost"
              disabled={i === jobs.length - 1}
              onClick={() => move(i, i + 1)}
              aria-label={t('queue.down')}
            >
              <ArrowDown size={18} />
            </button>
            <button
              className="btn icon ghost"
              onClick={() => update(() => dequeue(printer, [job.job_id]))}
              aria-label={t('queue.remove')}
            >
              <X size={18} />
            </button>
          </div>
        ))}
      </div>
      {jobs.length > 1 && (
        <button className="btn danger-outline" onClick={() => setClearing(true)}>
          <Trash2 size={18} /> {t('queue.clear')}
        </button>
      )}
      <ConfirmSheet
        open={clearing}
        title={t('queue.clearTitle')}
        confirmLabel={t('queue.clear')}
        danger
        onConfirm={() => update(() => replaceQueue(printer, []))}
        onClose={() => setClearing(false)}
      />
    </PullToRefresh>
  );
}
