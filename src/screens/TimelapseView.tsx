import { useEffect, useState } from 'react';
import { Download, Film } from 'lucide-react';
import { listTimelapses, timelapseUrl, type TimelapseFile } from '../api/moonraker';
import { PullToRefresh } from '../components/PullToRefresh';
import { Sheet } from '../components/ui';
import { formatBytes, formatDate } from '../format';
import { useLang, useT } from '../i18n';
import type { Printer } from '../store';

export function TimelapseView({ printer }: { printer: Printer }) {
  const t = useT();
  const lang = useLang();
  const [videos, setVideos] = useState<TimelapseFile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState<TimelapseFile | null>(null);

  const load = () =>
    listTimelapses(printer)
      .then((v) => {
        setVideos(v);
        setError(null);
      })
      .catch((e) => setError((e as Error).message));
  useEffect(() => {
    load();
  }, [printer.id]);

  return (
    <PullToRefresh onRefresh={load}>
      {error && <p className="muted">{error}</p>}
      {!videos && !error && (
        <div className="empty">
          <div className="loader" />
        </div>
      )}
      {videos?.length === 0 && (
        <div className="empty">
          <Film size={36} />
          <p className="muted">{t('timelapse.empty')}</p>
        </div>
      )}
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
