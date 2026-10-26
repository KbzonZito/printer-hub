import { useCallback, useEffect, useRef, useState } from 'react';
import { Clock, FileBox, Play, RefreshCw, Search, Trash2, Upload } from 'lucide-react';
import {
  deleteFile,
  fetchMetadata,
  listFiles,
  printerActions,
  thumbnailUrl,
  uploadFile,
  type FileMetadata,
  type GcodeFile,
} from '../api/moonraker';
import { ConfirmSheet, Sheet, useAction } from '../components/ui';
import { baseName, formatBytes, formatDate, formatDuration } from '../format';
import { useLang, useT } from '../i18n';
import type { Printer } from '../store';
import { usePrinterStatus } from '../usePrinterStatus';

const metaCache = new Map<string, FileMetadata>();

function useMetadata(printer: Printer, file: GcodeFile, visible: boolean) {
  const key = `${printer.id}:${file.path}:${file.modified}`;
  const [meta, setMeta] = useState(metaCache.get(key));
  useEffect(() => {
    if (!visible || meta) return;
    let cancelled = false;
    fetchMetadata(printer, file.path)
      .then((m) => {
        metaCache.set(key, m);
        if (!cancelled) setMeta(m);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [key, visible]);
  return meta;
}

function FileRow({ printer, file, onOpen }: { printer: Printer; file: GcodeFile; onOpen: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setVisible(true), {
      rootMargin: '200px',
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const lang = useLang();
  const meta = useMetadata(printer, file, visible);
  const thumb = thumbnailUrl(printer, file.path, meta);

  return (
    <button ref={ref} className="file-row" onClick={onOpen}>
      {thumb ? (
        <img className="file-thumb" src={thumb} alt="" loading="lazy" />
      ) : (
        <div className="file-thumb placeholder">
          <FileBox size={22} />
        </div>
      )}
      <div className="file-info">
        <span className="file-name">{baseName(file.path)}</span>
        <span className="muted small">
          {meta?.estimated_time ? `${formatDuration(meta.estimated_time)} · ` : ''}
          {formatBytes(file.size)} · {formatDate(file.modified, lang)}
        </span>
      </div>
    </button>
  );
}

export function FilesScreen({ printer, onPrintStarted }: { printer: Printer; onPrintStarted: () => void }) {
  const t = useT();
  const { status, refresh: refreshStatus } = usePrinterStatus();
  const run = useAction();
  const [files, setFiles] = useState<GcodeFile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<GcodeFile | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    setError(null);
    listFiles(printer)
      .then(setFiles)
      .catch((e) => setError((e as Error).message));
  }, [printer]);

  useEffect(load, [load]);

  const busy = status?.state === 'printing' || status?.state === 'paused';
  const filtered = files?.filter((f) => f.path.toLowerCase().includes(query.toLowerCase())) ?? [];
  const selMeta = selected
    ? metaCache.get(`${printer.id}:${selected.path}:${selected.modified}`)
    : undefined;
  const selThumb = selected ? thumbnailUrl(printer, selected.path, selMeta) : null;

  const onUpload = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    await run(() => uploadFile(printer, file), t('files.uploaded', { name: file.name }));
    setUploading(false);
    if (inputRef.current) inputRef.current.value = '';
    load();
  };

  return (
    <div className="screen wide">
      <div className="row gap">
        <label className="search grow">
          <Search size={18} />
          <input
            placeholder={t('files.search')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <button className="btn icon" onClick={load} aria-label={t('files.reload')}>
          <RefreshCw size={18} />
        </button>
        <button
          className="btn icon primary"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          aria-label={t('files.upload')}
        >
          {uploading ? <div className="loader small" /> : <Upload size={18} />}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".gcode,.g,.gco"
          hidden
          onChange={(e) => onUpload(e.target.files?.[0])}
        />
      </div>

      {error && (
        <div className="empty">
          <p className="muted">{error}</p>
          <button className="btn primary" onClick={load}>
            {t('common.retry')}
          </button>
        </div>
      )}
      {!files && !error && (
        <div className="empty">
          <div className="loader" />
        </div>
      )}
      {files && filtered.length === 0 && (
        <div className="empty">
          <FileBox size={36} />
          <p className="muted">{query ? t('files.noResults') : t('files.none')}</p>
        </div>
      )}
      <div className="file-list">
        {filtered.map((f) => (
          <FileRow key={f.path} printer={printer} file={f} onOpen={() => setSelected(f)} />
        ))}
      </div>

      <Sheet open={!!selected} onClose={() => setSelected(null)}>
        {selected && (
          <>
            {selThumb ? (
              <img className="detail-thumb" src={selThumb} alt="" />
            ) : (
              <div className="detail-thumb placeholder">
                <FileBox size={40} />
              </div>
            )}
            <h2 className="sheet-title">{baseName(selected.path)}</h2>
            <div className="stats">
              <div>
                <span className="muted small">
                  <Clock size={12} /> {t('files.time')}
                </span>
                <strong>{formatDuration(selMeta?.estimated_time ?? 0)}</strong>
              </div>
              <div>
                <span className="muted small">{t('home.filament')}</span>
                <strong>
                  {selMeta?.filament_weight_total
                    ? `${selMeta.filament_weight_total.toFixed(0)} g`
                    : selMeta?.filament_total
                      ? `${(selMeta.filament_total / 1000).toFixed(1)} m`
                      : '—'}
                </strong>
              </div>
              <div>
                <span className="muted small">{t('files.layer')}</span>
                <strong>{selMeta?.layer_height ? `${selMeta.layer_height} mm` : '—'}</strong>
              </div>
            </div>
            <div className="row gap">
              <button className="btn danger-outline icon" onClick={() => setConfirmDelete(true)} aria-label={t('common.delete')}>
                <Trash2 size={18} />
              </button>
              <button
                className="btn primary grow"
                disabled={busy}
                onClick={async () => {
                  const ok = await run(() => printerActions.start(printer, selected.path), t('files.started'));
                  if (ok) {
                    setSelected(null);
                    refreshStatus();
                    onPrintStarted();
                  }
                }}
              >
                <Play size={18} /> {busy ? t('files.busy') : t('files.print')}
              </button>
            </div>
          </>
        )}
      </Sheet>

      <ConfirmSheet
        open={confirmDelete}
        title={t('files.deleteTitle')}
        message={selected ? baseName(selected.path) : undefined}
        confirmLabel={t('common.delete')}
        danger
        onConfirm={async () => {
          if (!selected) return;
          const ok = await run(() => deleteFile(printer, selected.path), t('files.deleted'));
          if (ok) {
            setSelected(null);
            load();
          }
        }}
        onClose={() => setConfirmDelete(false)}
      />
    </div>
  );
}
