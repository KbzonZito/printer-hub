import { useState } from 'react';
import { useBackHandler } from '../backStack';
import { useT } from '../i18n';
import type { Printer } from '../store';
import { useCapabilities, usePrinterStatus } from '../usePrinterStatus';
import { FileBrowser } from './FileBrowser';
import { HistoryView } from './HistoryView';
import { QueueView } from './QueueView';
import { TimelapseView } from './TimelapseView';

export function FilesScreen({
  printer,
  onPrintStarted,
}: {
  printer: Printer;
  onPrintStarted: () => void;
}) {
  const t = useT();
  const { status } = usePrinterStatus();
  const [view, setView] = useState<'files' | 'history' | 'queue' | 'timelapse'>('files');
  const busy = status?.state === 'printing' || status?.state === 'paused';
  // Timelapses need the moonraker-timelapse plugin (the Creality Hi doesn't have it).
  const caps = useCapabilities();
  const views = [
    'files',
    'history',
    ...(caps.has('job_queue') ? (['queue'] as const) : []),
    ...(caps.has('timelapse') ? (['timelapse'] as const) : []),
  ] as const;
  const shown = views.includes(view as never) ? view : 'files';
  useBackHandler(shown !== 'files', () => setView('files'));

  return (
    <div className="screen wide">
      <div className="segmented">
        {views.map((v) => (
          <button key={v} className={shown === v ? 'active' : ''} onClick={() => setView(v)}>
            {t(`files.tab.${v}`)}
          </button>
        ))}
      </div>
      {shown === 'files' && <FileBrowser printer={printer} onPrintStarted={onPrintStarted} />}
      {shown === 'history' && (
        <HistoryView printer={printer} busy={busy} onPrintStarted={onPrintStarted} />
      )}
      {shown === 'queue' && <QueueView printer={printer} />}
      {shown === 'timelapse' && <TimelapseView printer={printer} />}
    </div>
  );
}
