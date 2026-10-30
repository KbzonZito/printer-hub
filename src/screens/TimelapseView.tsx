import { useState } from 'react';
import { Download, Film } from 'lucide-react';
import { listTimelapses, timelapseUrl, type TimelapseFile } from '../api/moonraker';
import { PullToRefresh } from '../components/PullToRefresh';
import { Empty, LoadError, Loading } from '../components/states';
import { Sheet } from '../components/ui';
import { formatBytes, formatDate } from '../format';
import { useLang, useT } from '../i18n';
import type { Printer } from '../store';
import { useLoader } from '../useLoader';

export function TimelapseView({ printer }: { printer: Printer }) {
  const t = useT();
  const lang = useLang();
  const {
    data: videos,
    error,
    loading,
    reload,
  } = useLoader(() => listTimelapses(printer), [printer.id]);
  const [playing, setPlaying] = useState<TimelapseFile | null>(null);

  return (
    <PullToRefresh onRefresh={reload}>
      {error && <LoadError message={error} onRetry={reload} />}
      {loading && <Loading />}
      {videos?.length === 0 && <Empty icon={Film}>{t('timelapse.empty')}</Empty>}
      <div className="file-list">
        {videos?.map((v) => (
          <button key={v.path} className="file-row" onClick={() => setPlaying(v)}>
            <div className="file-thumb placeholder">
              <Film size={22} />
            </div>
            <div className="file-info">
              <span className="file-name">{v.path.replace(/\.\w+$/, '')}</span>
              <span className="muted small">
                {formatBytes(v.size)} · {formatDate(v.modified, lang)}
              </span>
            </div>
          </button>
        ))}
      </div>
      <Sheet open={!!playing} onClose={() => setPlaying(null)} title={playing?.path}>
        {playing && (
          <>
            <video
              className="timelapse-video"
              src={timelapseUrl(printer, playing.path)}
              controls
              autoPlay
              playsInline
            />
            <a
              className="btn"
              href={timelapseUrl(printer, playing.path)}
              target="_blank"
              rel="noreferrer"
              download
            >
              <Download size={18} /> {t('timelapse.download')}
            </a>
          </>
        )}
      </Sheet>
    </PullToRefresh>
  );
}
