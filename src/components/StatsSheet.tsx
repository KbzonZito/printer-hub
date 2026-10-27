import { useEffect, useMemo, useState } from 'react';
import { fetchHistory, type HistoryJob } from '../api/moonraker';
import { formatDuration } from '../format';
import { useLang, useT } from '../i18n';
import { groupJobs, summarize, type Bucket, type Period } from '../stats';
import type { Printer } from '../store';
import { Sheet } from './ui';

type Metric = 'hours' | 'filament' | 'jobs';

const COUNT: Record<Period, number> = { week: 12, month: 12 };

function Bars({ buckets, metric, period }: { buckets: Bucket[]; metric: Metric; period: Period }) {
  const lang = useLang();
  const max = Math.max(...buckets.map((b) => b[metric]), metric === 'jobs' ? 1 : 0.001);
  const label = (b: Bucket) =>
    new Date(b.start).toLocaleDateString(
      lang,
      period === 'month' ? { month: 'short' } : { day: 'numeric', month: 'numeric' },
    );
  const value = (b: Bucket) =>
    metric === 'hours'
      ? `${b.hours.toFixed(1)} h`
      : metric === 'filament'
        ? `${(b.filament / 1000).toFixed(1)} m`
        : String(b.jobs);
  return (
    <div
      className="bars"
      role="img"
      aria-label={buckets.map((b) => `${label(b)}: ${value(b)}`).join(', ')}
    >
      {buckets.map((b) => (
        <div key={b.start} className="bar-col">
          <div className="bar-track">
            <div
              className={`bar ${b === buckets[buckets.length - 1] ? 'current' : ''}`}
              style={{ height: `${(b[metric] / max) * 100}%` }}
              title={value(b)}
            />
          </div>
          <span className="bar-label">{label(b)}</span>
        </div>
      ))}
    </div>
  );
}

/** Hours, filament and prints per week or month, with the success rate. */
export function StatsSheet({
  printer,
  open,
  onClose,
}: {
  printer: Printer;
  open: boolean;
  onClose: () => void;
}) {
  const t = useT();
  const [jobs, setJobs] = useState<HistoryJob[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period>('week');
  const [metric, setMetric] = useState<Metric>('hours');

  useEffect(() => {
    if (!open) return;
    setError(null);
    // A year covers 12 months; Moonraker keeps the history in its own database.
    fetchHistory(printer, 2000, Date.now() / 1000 - 370 * 86400)
      .then(setJobs)
      .catch((e) => setError((e as Error).message));
  }, [open, printer.id]);

  const buckets = useMemo(
    () => (jobs ? groupJobs(jobs, period, COUNT[period]) : []),
    [jobs, period],
  );
  const total = summarize(buckets);

  return (
    <Sheet open={open} onClose={onClose} title={t('stats.title')}>
      <div className="segmented">
        {(['week', 'month'] as const).map((p) => (
          <button key={p} className={period === p ? 'active' : ''} onClick={() => setPeriod(p)}>
            {t(p === 'week' ? 'stats.weeks' : 'stats.months')}
          </button>
        ))}
      </div>
      {error && <p className="muted">{error}</p>}
      {!jobs && !error && <div className="loader" />}
      {jobs && (
        <>
          <div className="stats four">
            <div>
              <span className="muted small">{t('history.jobs')}</span>
              <strong>{total.jobs}</strong>
            </div>
            <div>
              <span className="muted small">{t('history.printTime')}</span>
              <strong>{formatDuration(total.hours * 3600)}</strong>
            </div>
            <div>
              <span className="muted small">{t('home.filament')}</span>
              <strong>{(total.filament / 1000).toFixed(1)} m</strong>
            </div>
            <div>
              <span className="muted small">{t('history.successRate')}</span>
              <strong>
                {total.successRate == null ? '—' : `${Math.round(total.successRate * 100)}%`}
              </strong>
            </div>
          </div>
          <div className="segmented mini">
            {(['hours', 'filament', 'jobs'] as const).map((m) => (
              <button key={m} className={metric === m ? 'active' : ''} onClick={() => setMetric(m)}>
                {t(`stats.${m}`)}
              </button>
            ))}
          </div>
          <Bars buckets={buckets} metric={metric} period={period} />
          <p className="muted small">
            {t(period === 'week' ? 'stats.lastWeeks' : 'stats.lastMonths', { n: COUNT[period] })}
          </p>
        </>
      )}
    </Sheet>
  );
}
