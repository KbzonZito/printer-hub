import { useState } from 'react';
import { useT } from '../i18n';
import type { Printer } from '../store';
import { usePrinterStatus } from '../usePrinterStatus';
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

  return (
    <div className="screen wide">
      <div className="segmented">
        {(['files', 'history', 'timelapse'] as const).map((v) => (
          <button key={v} className={view === v ? 'active' : ''} onClick={() => setView(v)}>
            {t(`files.tab.${v}`)}
          </button>
        ))}
      </div>
      {view === 'files' && <FileBrowser printer={printer} onPrintStarted={onPrintStarted} />}
      {view === 'history' && (
        <HistoryView printer={printer} busy={busy} onPrintStarted={onPrintStarted} />
      )}
      {view === 'timelapse' && <TimelapseView printer={printer} />}
    </div>
  );
}
