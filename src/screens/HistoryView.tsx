import { useEffect, useState } from 'react';
import { ChartColumn, CheckCircle2, CircleSlash, FileBox, RotateCcw, XCircle } from 'lucide-react';
import {
  fetchHistory,
  fetchHistoryTotals,
  printerActions,
  thumbnailUrl,
  type HistoryJob,
  type HistoryTotals,
} from '../api/moonraker';
import { PullToRefresh } from '../components/PullToRefresh';
import { StatsSheet } from '../components/StatsSheet';
import { Sheet, useAction } from '../components/ui';
import { baseName, formatDate, formatDuration } from '../format';
import { useLang, useT, type MessageKey } from '../i18n';
import { useConnectionEvent } from '../usePrinterStatus';
import { useSettings, type Printer } from '../store';
import { formatCost, printCost } from '../cost';

function StatusIcon({ status }: { status: string }) {
  if (status === 'completed') return <CheckCircle2 size={16} className="ok-text" />;
  if (status === 'cancelled') return <CircleSlash size={16} className="muted" />;
  return <XCircle size={16} className="danger-text" />;
}

export function HistoryView({
  printer,
  busy,
  onPrintStarted,
}: {
  printer: Printer;
  busy: boolean;
  onPrintStarted: () => void;
}) {
  const t = useT();
  const lang = useLang();
  const run = useAction();
  const [jobs, setJobs] = useState<HistoryJob[] | null>(null);
  const [totals, setTotals] = useState<HistoryTotals | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<HistoryJob | null>(null);
  const [statsOpen, setStatsOpen] = useState(false);
  const { settings } = useSettings();
  const cost =
    selected &&
    printCost(settings.presets, {
      type: selected.metadata?.filament_type,
      lengthMm: selected.filament_used,
    });

  const load = () =>
    Promise.all([
      fetchHistory(printer)
        .then((j) => {
          setJobs(j);
          setError(null);
        })
        .catch((e) => setError((e as Error).message)),
      fetchHistoryTotals(printer)
        .then(setTotals)
        .catch(() => {}),
    ]);
  useEffect(() => {
    load();
  }, [printer.id]);
  // A print that starts or finishes updates the list by itself.
  useConnectionEvent('notify_history_changed', () => void load());

  const done = jobs?.filter((j) => j.status === 'completed').length ?? 0;
  const statusLabel = (s: string) =>
    ['completed', 'cancelled', 'error', 'klippy_shutdown', 'in_progress'].includes(s)
      ? t(`history.${s}` as MessageKey)
      : s;

  return (
    <PullToRefresh onRefresh={load}>
      <StatsSheet printer={printer} open={statsOpen} onClose={() => setStatsOpen(false)} />
      {totals && (
        <div className="stats four">
          <div>
            <span className="muted small">{t('history.jobs')}</span>
            <strong>{totals.total_jobs}</strong>
          </div>
          <div>
            <span className="muted small">{t('history.printTime')}</span>
            <strong>{formatDuration(totals.total_print_time)}</strong>
          </div>
          <div>
            <span className="muted small">{t('home.filament')}</span>
            <strong>{(totals.total_filament_used / 1000).toFixed(1)} m</strong>
          </div>
          <div>
            <span className="muted small">{t('history.successRate')}</span>
            <strong>{jobs?.length ? `${Math.round((done / jobs.length) * 100)}%` : '—'}</strong>
          </div>
        </div>
      )}
      {totals && totals.total_jobs > 0 && (
        <button className="btn" onClick={() => setStatsOpen(true)}>
          <ChartColumn size={18} /> {t('stats.open')}
        </button>
      )}

      {error && <p className="muted">{error}</p>}
      {!jobs && !error && (
        <div className="empty">
          <div className="loader" />
        </div>
      )}
      {jobs?.length === 0 && (
        <div className="empty">
          <FileBox size={36} />
          <p className="muted">{t('history.empty')}</p>
        </div>
      )}

      <div className="file-list">
        {jobs?.map((j) => {
          const thumb = thumbnailUrl(printer, j.filename, j.metadata);
          return (
            <button key={j.job_id} className="file-row" onClick={() => setSelected(j)}>
              {thumb ? (
                <img className="file-thumb" src={thumb} alt="" loading="lazy" />
              ) : (
                <div className="file-thumb placeholder">
                  <FileBox size={22} />
                </div>
              )}
              <div className="file-info">
                <span className="file-name">{baseName(j.filename)}</span>
                <span className="muted small row-inline">
                  <StatusIcon status={j.status} />
                  {formatDuration(j.print_duration)} · {formatDate(j.start_time, lang)}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      <Sheet
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected ? baseName(selected.filename) : ''}
      >
        {selected && (
          <>
            <div className={`stats ${cost != null ? 'four' : ''}`}>
              <div>
                <span className="muted small">{t('history.result')}</span>
                <strong className="row-inline">
                  <StatusIcon status={selected.status} /> {statusLabel(selected.status)}
                </strong>
              </div>
              <div>
                <span className="muted small">{t('history.printTime')}</span>
                <strong>{formatDuration(selected.print_duration)}</strong>
              </div>
              <div>
                <span className="muted small">{t('home.filament')}</span>
                <strong>{(selected.filament_used / 1000).toFixed(2)} m</strong>
              </div>
              {cost != null && (
                <div>
                  <span className="muted small">{t('files.cost')}</span>
                  <strong>{formatCost(cost, settings.currency, lang)}</strong>
                </div>
              )}
            </div>
            <p className="muted small">
              {formatDate(selected.start_time, lang)}
              {selected.metadata?.estimated_time
                ? ` · ${t('home.slicerTotal', { time: formatDuration(selected.metadata.estimated_time) })}`
                : ''}
            </p>
            <button
              className="btn primary"
              disabled={busy || selected.exists === false}
              onClick={async () => {
                const ok = await run(
                  () => printerActions.start(printer, selected.filename),
                  t('files.started'),
                );
                if (ok) {
                  setSelected(null);
                  onPrintStarted();
                }
              }}
            >
              <RotateCcw size={18} />
              {selected.exists === false
                ? t('history.fileGone')
                : busy
                  ? t('files.busy')
                  : t('history.reprint')}
            </button>
          </>
        )}
      </Sheet>
    </PullToRefresh>
  );
}
