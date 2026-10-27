import { useState } from 'react';
import { useT } from '../i18n';
import type { Printer } from '../store';
import { useCapabilities, usePrinterStatus } from '../usePrinterStatus';
import { FileBrowser } from './FileBrowser';
import { HistoryView } from './HistoryView';
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
  const [view, setView] = useState<'files' | 'history' | 'timelapse'>('files');
  const busy = status?.state === 'printing' || status?.state === 'paused';
  // Timelapses need the moonraker-timelapse plugin (the Creality Hi doesn't have it).
  const caps = useCapabilities();
  const views = caps.has('timelapse')
    ? (['files', 'history', 'timelapse'] as const)
    : (['files', 'history'] as const);
  const shown = views.includes(view as never) ? view : 'files';

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
      {shown === 'timelapse' && <TimelapseView printer={printer} />}
    </div>
  );
}
