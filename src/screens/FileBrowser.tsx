import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUpDown,
  Layers,
  ListPlus,
  ChevronRight,
  Clock,
  FileBox,
  Folder,
  FolderInput,
  FolderOpen,
  FolderPlus,
  History,
  LayoutGrid,
  List,
  MoreVertical,
  Pencil,
  Play,
  RefreshCw,
  Search,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  createDirectory,
  deleteDirectory,
  deleteFile,
  fetchMetadata,
  listDirectory,
  listFiles,
  moveItem,
  printerActions,
  thumbnailUrl,
  uploadFile,
  type FileMetadata,
  type GcodeDir,
  type GcodeFile,
} from '../api/moonraker';
import { GcodeViewer } from '../components/GcodeViewer';
import { PullToRefresh } from '../components/PullToRefresh';
import { useActiveSpool } from '../components/SpoolCard';
import { ConfirmSheet, Sheet, useAction } from '../components/ui';
import { useBackHandler } from '../backStack';
import { formatCost, printCost } from '../cost';
import { estimateFile, loadCalibration, type Calibration } from '../estimate';
import { baseName, formatBytes, formatClock, formatDate, formatDuration } from '../format';
import { useLang, useT, type MessageKey } from '../i18n';
import { useSettings, type FileSort, type Printer } from '../store';
import {
  useCapabilities,
  useConnectionEvent,
  usePrinterReady,
  usePrinterStatus,
} from '../usePrinterStatus';
import { enqueue } from '../api/queue';

const metaCache = new Map<string, FileMetadata>();
const metaKey = (p: Printer, f: GcodeFile) => `${p.id}:${f.path}:${f.modified}`;

type Item = { kind: 'dir'; dir: GcodeDir } | { kind: 'file'; file: GcodeFile };

const GCODE_NAME = /\.(gcode|g|gco)$/i;
const parentOf = (path: string) => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '');

function useMetadata(printer: Printer, file: GcodeFile, visible: boolean) {
  const key = metaKey(printer, file);
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

/** Metadata for the file open in the detail sheet. */
function useFileMeta(printer: Printer, file: GcodeFile | null) {
  const [meta, setMeta] = useState<FileMetadata>();
  useEffect(() => {
    if (!file) return;
    const key = metaKey(printer, file);
    const cached = metaCache.get(key);
    setMeta(cached);
    if (cached) return;
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
  }, [file]);
  return file ? meta : undefined;
}

function useVisible<T extends Element>() {
  const ref = useRef<T>(null);
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
  return [ref, visible] as const;
}

function useCalibration(printer: Printer) {
  const [cal, setCal] = useState<Calibration | null>(null);
  useEffect(() => {
    loadCalibration(printer)
      .then(setCal)
      .catch(() => {});
  }, [printer.id]);
  return cal;
}

function FileItem({
  printer,
  file,
  grid,
  showDir,
  onOpen,
}: {
  printer: Printer;
  file: GcodeFile;
  grid: boolean;
  showDir: boolean;
  onOpen: () => void;
}) {
  const [ref, visible] = useVisible<HTMLButtonElement>();
  const lang = useLang();
  const meta = useMetadata(printer, file, visible);
  const thumb = thumbnailUrl(printer, file.path, meta);
  const image = thumb ? (
    <img className="file-thumb" src={thumb} alt="" loading="lazy" />
  ) : (
    <div className="file-thumb placeholder">
      <FileBox size={grid ? 32 : 22} />
    </div>
  );
  const time = meta?.estimated_time ? formatDuration(meta.estimated_time) : null;
  const dir = showDir ? parentOf(file.path) : '';

  if (grid) {
    return (
      <button ref={ref} className="file-card" onClick={onOpen}>
        {image}
        <span className="file-name two-lines">{baseName(file.path)}</span>
        <span className="muted small">
          {time && <Clock size={12} />} {time ?? formatBytes(file.size)}
        </span>
      </button>
    );
  }
  return (
    <button ref={ref} className="file-row" onClick={onOpen}>
      {image}
      <div className="file-info">
        <span className="file-name">{baseName(file.path)}</span>
        <span className="muted small">
          {dir && `${dir} · `}
          {time ? `${time} · ` : ''}
          {formatBytes(file.size)} · {formatDate(file.modified, lang)}
        </span>
      </div>
    </button>
  );
}

function DirItem({
  dir,
  grid,
  onOpen,
  onMenu,
}: {
  dir: GcodeDir;
  grid: boolean;
  onOpen: () => void;
  onMenu: () => void;
}) {
  const lang = useLang();
  const t = useT();
  const menu = (
    <span
      role="button"
      tabIndex={0}
      className="dir-menu"
      aria-label={t('files.folderActions')}
      onClick={(e) => {
        e.stopPropagation();
        onMenu();
      }}
    >
      <MoreVertical size={18} />
    </span>
  );
  if (grid) {
    return (
      <button className="file-card folder" onClick={onOpen}>
        <div className="file-thumb placeholder">
          <Folder size={34} />
        </div>
        <span className="file-name two-lines">{dir.name}</span>
        {menu}
      </button>
    );
  }
  return (
    <button className="file-row folder" onClick={onOpen}>
      <div className="file-thumb placeholder">
        <Folder size={24} />
      </div>
      <div className="file-info grow">
        <span className="file-name">{dir.name}</span>
        <span className="muted small">{formatDate(dir.modified, lang)}</span>
      </div>
      {menu}
    </button>
  );
}

/** Sheet to browse folders and pick a destination. */
function FolderPicker({
  printer,
  open,
  exclude,
  onClose,
  onPick,
}: {
  printer: Printer;
  open: boolean;
  /** A folder being moved can't go inside itself. */
  exclude?: string;
  onClose: () => void;
  onPick: (dir: string) => void;
}) {
  const t = useT();
  const [dir, setDir] = useState('');
  const [dirs, setDirs] = useState<GcodeDir[] | null>(null);
  useEffect(() => {
    if (!open) return;
    setDirs(null);
    listDirectory(printer, dir)
      .then((r) => setDirs(r.dirs.filter((d) => d.path !== exclude)))
      .catch(() => setDirs([]));
  }, [open, dir]);
  useEffect(() => {
    if (open) setDir('');
  }, [open]);
  return (
    <Sheet open={open} onClose={onClose} title={t('files.moveTo')}>
      <Breadcrumbs dir={dir} onNavigate={setDir} />
      <div className="select-options folder-picker">
        {!dirs && <div className="loader" />}
        {dirs?.map((d) => (
          <button key={d.path} className="select-option" onClick={() => setDir(d.path)}>
            <Folder size={20} />
            <span className="grow">{d.name}</span>
            <ChevronRight size={18} />
          </button>
        ))}
        {dirs?.length === 0 && <p className="muted small center">{t('files.emptyFolder')}</p>}
      </div>
      <div className="row gap">
        <button className="btn grow" onClick={onClose}>
          {t('common.cancel')}
        </button>
        <button className="btn primary grow" onClick={() => onPick(dir)}>
          <FolderInput size={18} /> {t('files.moveHere')}
        </button>
      </div>
    </Sheet>
  );
}

function Breadcrumbs({ dir, onNavigate }: { dir: string; onNavigate: (dir: string) => void }) {
  const t = useT();
  const parts = dir ? dir.split('/') : [];
  return (
    <nav className="breadcrumbs">
      <button className={parts.length ? '' : 'current'} onClick={() => onNavigate('')}>
        <FolderOpen size={16} /> {t('files.tab.files')}
      </button>
      {parts.map((name, i) => (
        <span key={i} className="crumb">
          <ChevronRight size={14} />
          <button
            className={i === parts.length - 1 ? 'current' : ''}
            onClick={() => onNavigate(parts.slice(0, i + 1).join('/'))}
          >
            {name}
          </button>
        </span>
      ))}
    </nav>
  );
}

function NameSheet({
  open,
  title,
  initial,
  confirmLabel,
  onClose,
  onSubmit,
}: {
  open: boolean;
  title: string;
  initial: string;
  confirmLabel: string;
  onClose: () => void;
  onSubmit: (name: string) => void;
}) {
  const t = useT();
  const [name, setName] = useState(initial);
  useEffect(() => {
    if (open) setName(initial);
  }, [open, initial]);
  const valid = name.trim() !== '' && !name.includes('/');
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) onSubmit(name.trim());
        }}
      >
        <label className="field">
          <span>{t('files.name')}</span>
          <input
            className="input"
            value={name}
            autoFocus
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <div className="row gap">
          <button type="button" className="btn grow" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="submit" className="btn primary grow" disabled={!valid}>
            {confirmLabel}
          </button>
        </div>
      </form>
    </Sheet>
  );
}

function EstimateCard({
  file,
  meta,
  cal,
}: {
  file: GcodeFile;
  meta: FileMetadata | undefined;
  cal: Calibration | null;
}) {
  const t = useT();
  const lang = useLang();
  const est = estimateFile(file.path, meta, cal);
  const rows: { key: MessageKey; value: number | null; icon?: typeof Clock }[] = [
    { key: 'files.est.lastPrint', value: est.lastActual, icon: History },
    { key: 'files.est.calibrated', value: est.calibrated },
    { key: 'files.est.slicer', value: est.slicer },
    { key: 'files.est.byFilament', value: est.slicer ? null : est.byFilament },
  ];
  return (
    <div className="estimate">
      <div className="estimate-head">
        <Clock size={20} />
        <div className="grow">
          <span className="muted small">{t('files.estimate')}</span>
          <strong>{est.best ? formatDuration(est.best) : '—'}</strong>
        </div>
        {est.best && (
          <span className="muted small right">
            {t('files.est.finish', {
              time: formatClock(new Date(Date.now() + est.best * 1000), lang),
            })}
          </span>
        )}
      </div>
      {!est.best && <p className="muted small">{t('files.est.none')}</p>}
      {rows
        .filter((r) => r.value)
        .map((r) => (
          <div key={r.key} className="estimate-row">
            <span className="muted">{t(r.key)}</span>
            <strong>{formatDuration(r.value!)}</strong>
          </div>
        ))}
      {est.calibrated && cal?.ratio && (
        <p className="muted small">
          {t('files.est.calibratedHint', {
            n: String(cal.samples),
            pct: `${Math.round(cal.ratio * 100)}%`,
          })}
        </p>
      )}
    </div>
  );
}

function FileDetails({ file, meta }: { file: GcodeFile; meta: FileMetadata | undefined }) {
  const t = useT();
  const lang = useLang();
  const { settings } = useSettings();
  const cost = printCost(settings.presets, {
    type: meta?.filament_type,
    grams: meta?.filament_weight_total,
    lengthMm: meta?.filament_total,
  });
  const filament = meta?.filament_weight_total
    ? `${meta.filament_weight_total.toFixed(0)} g`
    : null;
  const length = meta?.filament_total ? `${(meta.filament_total / 1000).toFixed(1)} m` : null;
  const temps =
    meta?.first_layer_extr_temp || meta?.first_layer_bed_temp
      ? `${meta.first_layer_extr_temp ?? '—'}° / ${meta.first_layer_bed_temp ?? '—'}°`
      : null;
  const rows: [MessageKey, string | null][] = [
    [
      'files.material',
      [meta?.filament_type, meta?.filament_name].filter(Boolean).join(' · ') || null,
    ],
    ['home.filament', [length, filament].filter(Boolean).join(' · ') || null],
    ['files.cost', cost != null ? formatCost(cost, settings.currency, lang) : null],
    ['files.temps', temps],
    ['files.layer', meta?.layer_height ? `${meta.layer_height} mm` : null],
    ['files.height', meta?.object_height ? `${meta.object_height} mm` : null],
    ['files.slicer', meta?.slicer ?? null],
    ['files.size', formatBytes(file.size)],
    ['files.modified', formatDate(file.modified, lang)],
  ];
  return (
    <div className="details">
      {rows
        .filter(([, v]) => v)
        .map(([k, v]) => (
          <div key={k} className="estimate-row">
            <span className="muted">{t(k)}</span>
            <span>{v}</span>
          </div>
        ))}
    </div>
  );
}

const SORTS: FileSort[] = ['date', 'name', 'size'];

export function FileBrowser({
  printer,
  onPrintStarted,
}: {
  printer: Printer;
  onPrintStarted: () => void;
}) {
  const t = useT();
  const { status, refresh: refreshStatus } = usePrinterStatus();
  const ready = usePrinterReady();
  const caps = useCapabilities();
  const spool = useActiveSpool(printer);
  // The active spool has less filament than the file needs (grams).
  const [lowFilament, setLowFilament] = useState<{ need: number; have: number } | null>(null);
  const { settings, updateSettings } = useSettings();
  const run = useAction();
  const cal = useCalibration(printer);
  const [dir, setDir] = useState('');
  const [listing, setListing] = useState<{ dirs: GcodeDir[]; files: GcodeFile[] } | null>(null);
  const [allFiles, setAllFiles] = useState<GcodeFile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<GcodeFile | null>(null);
  const [dirMenu, setDirMenu] = useState<GcodeDir | null>(null);
  // Item being renamed, moved or deleted (sheets open one at a time).
  const [action, setAction] = useState<{ kind: 'rename' | 'move' | 'delete'; item: Item } | null>(
    null,
  );
  const [creating, setCreating] = useState(false);
  const [preview, setPreview] = useState<GcodeFile | null>(null);
  const [sortOpen, setSortOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    setError(null);
    setAllFiles(null);
    return listDirectory(printer, dir)
      .then(setListing)
      .catch((e) => setError((e as Error).message));
  }, [printer, dir]);
  // Files added, moved or deleted from elsewhere (the slicer, Fluidd…) show up by themselves.
  const reloadTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useConnectionEvent('notify_filelist_changed', () => {
    clearTimeout(reloadTimer.current);
    reloadTimer.current = setTimeout(load, 500);
  });
  useEffect(() => () => clearTimeout(reloadTimer.current), []);

  useEffect(() => {
    setListing(null);
    load();
  }, [load]);

  // Searching looks through every folder.
  useEffect(() => {
    if (!query || allFiles) return;
    listFiles(printer)
      .then(setAllFiles)
      .catch(() => {});
  }, [query, allFiles, printer]);

  // Back clears the search, then goes up one folder.
  useBackHandler(!!query || dir !== '', () => {
    if (query) setQuery('');
    else setDir(dir.includes('/') ? dir.slice(0, dir.lastIndexOf('/')) : '');
  });

  const busy = status?.state === 'printing' || status?.state === 'paused';
  const grid = settings.fileView === 'grid';

  const items = useMemo<Item[]>(() => {
    const dirFactor = settings.fileSortDesc ? -1 : 1;
    const cmp = (a: { name: string; modified: number; size: number }, b: typeof a) => {
      const by =
        settings.fileSort === 'name'
          ? a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
          : settings.fileSort === 'size'
            ? a.size - b.size
            : a.modified - b.modified;
      return by * dirFactor;
    };
    const fileKey = (f: GcodeFile) => ({ ...f, name: baseName(f.path) });
    if (query) {
      const q = query.toLowerCase();
      return (allFiles ?? [])
        .filter((f) => f.path.toLowerCase().includes(q))
        .sort((a, b) => cmp(fileKey(a), fileKey(b)))
        .map((file) => ({ kind: 'file', file }));
    }
    if (!listing) return [];
    return [
      ...[...listing.dirs].sort(cmp).map((d) => ({ kind: 'dir', dir: d }) as Item),
      ...[...listing.files]
        .sort((a, b) => cmp(fileKey(a), fileKey(b)))
        .map((file) => ({ kind: 'file', file }) as Item),
    ];
  }, [listing, allFiles, query, settings.fileSort, settings.fileSortDesc]);

  const selMeta = useFileMeta(printer, selected);
  const selThumb = selected ? thumbnailUrl(printer, selected.path, selMeta) : null;
  const itemPath = (item: Item) => (item.kind === 'dir' ? item.dir.path : item.file.path);
  // Full file name with its extension (baseName() drops it for display).
  const itemName = (item: Item) =>
    item.kind === 'dir' ? item.dir.name : item.file.path.slice(item.file.path.lastIndexOf('/') + 1);

  const onUpload = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    await run(
      () => uploadFile(printer, file, false, dir),
      t('files.uploaded', { name: file.name }),
    );
    setUploading(false);
    if (inputRef.current) inputRef.current.value = '';
    load();
  };

  const startPrint = async (file: GcodeFile) => {
    const ok = await run(() => printerActions.start(printer, file.path), t('files.started'));
    if (ok) {
      setSelected(null);
      refreshStatus();
      onPrintStarted();
    }
  };

  const openAction = (kind: 'rename' | 'move' | 'delete', item: Item) => {
    setSelected(null);
    setDirMenu(null);
    setAction({ kind, item });
  };

  const loading = !error && (query ? !allFiles : !listing);

  return (
    <PullToRefresh onRefresh={load}>
      <div className="row gap">
        <label className="search grow">
          <Search size={18} />
          <input
            placeholder={t('files.search')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
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

      <div className="files-toolbar">
        {query ? (
          <span className="muted small grow">{t('files.search')}</span>
        ) : (
          <Breadcrumbs dir={dir} onNavigate={setDir} />
        )}
        <button
          className="btn icon ghost"
          onClick={() => setSortOpen(true)}
          aria-label={t('files.sort')}
        >
          <ArrowUpDown size={18} />
        </button>
        <button
          className="btn icon ghost"
          onClick={() => updateSettings({ fileView: grid ? 'list' : 'grid' })}
          aria-label={grid ? t('files.viewList') : t('files.viewGrid')}
        >
          {grid ? <List size={18} /> : <LayoutGrid size={18} />}
        </button>
        <button
          className="btn icon ghost"
          onClick={() => setCreating(true)}
          aria-label={t('files.newFolder')}
        >
          <FolderPlus size={18} />
        </button>
        <button className="btn icon ghost" onClick={load} aria-label={t('files.reload')}>
          <RefreshCw size={18} />
        </button>
      </div>

      {error && (
        <div className="empty">
          <p className="muted">{error}</p>
          <button className="btn primary" onClick={load}>
            {t('common.retry')}
          </button>
        </div>
      )}
      {loading && (
        <div className="empty">
          <div className="loader" />
        </div>
      )}
      {!loading && !error && items.length === 0 && (
        <div className="empty">
          <FileBox size={36} />
          <p className="muted">
            {query ? t('files.noResults') : dir ? t('files.emptyFolder') : t('files.none')}
          </p>
        </div>
      )}
      <div className={grid ? 'file-grid' : 'file-list'} key={`${dir}|${query ? 'q' : ''}`}>
        {items.map((item) =>
          item.kind === 'dir' ? (
            <DirItem
              key={`d:${item.dir.path}`}
              dir={item.dir}
              grid={grid}
              onOpen={() => setDir(item.dir.path)}
              onMenu={() => setDirMenu(item.dir)}
            />
          ) : (
            <FileItem
              key={`f:${item.file.path}`}
              printer={printer}
              file={item.file}
              grid={grid}
              showDir={!!query}
              onOpen={() => setSelected(item.file)}
            />
          ),
        )}
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
            <EstimateCard file={selected} meta={selMeta} cal={cal} />
            <FileDetails file={selected} meta={selMeta} />
            <button
              className="btn"
              onClick={() => {
                setPreview(selected);
                setSelected(null);
              }}
            >
              <Layers size={18} /> {t('gcode.preview')}
            </button>
            <div className="row gap wrap">
              {caps.has('job_queue') && (
                <button
                  className="btn grow"
                  onClick={async () => {
                    const ok = await run(
                      () => enqueue(printer, [selected.path]),
                      t('queue.added', { name: baseName(selected.path) }),
                    );
                    if (ok) setSelected(null);
                  }}
                >
                  <ListPlus size={18} /> {t('queue.add')}
                </button>
              )}
              <button
                className="btn grow"
                onClick={() => openAction('move', { kind: 'file', file: selected })}
              >
                <FolderInput size={18} /> {t('files.move')}
              </button>
              <button
                className="btn grow"
                onClick={() => openAction('rename', { kind: 'file', file: selected })}
              >
                <Pencil size={18} /> {t('files.rename')}
              </button>
            </div>
            <div className="row gap">
              <button
                className="btn danger-outline icon"
                onClick={() => openAction('delete', { kind: 'file', file: selected })}
                aria-label={t('common.delete')}
              >
                <Trash2 size={18} />
              </button>
              <button
                className="btn primary grow"
                disabled={busy || !ready}
                onClick={() => {
                  const need = selMeta?.filament_weight_total ?? 0;
                  const have = spool.active?.remaining_weight;
                  if (have != null && need > have) setLowFilament({ need, have });
                  else startPrint(selected);
                }}
              >
                <Play size={18} /> {busy ? t('files.busy') : t('files.print')}
              </button>
            </div>
          </>
        )}
      </Sheet>

      {preview && <GcodeViewer printer={printer} file={preview} onClose={() => setPreview(null)} />}
      <ConfirmSheet
        open={!!lowFilament}
        title={t('spool.lowTitle')}
        message={
          lowFilament
            ? t('spool.lowText', {
                have: Math.round(lowFilament.have),
                need: Math.round(lowFilament.need),
              })
            : undefined
        }
        confirmLabel={t('spool.printAnyway')}
        onConfirm={() => selected && startPrint(selected)}
        onClose={() => setLowFilament(null)}
      />

      <Sheet open={!!dirMenu} onClose={() => setDirMenu(null)} title={dirMenu?.name}>
        {dirMenu && (
          <div className="select-options">
            <button
              className="select-option"
              onClick={() => openAction('move', { kind: 'dir', dir: dirMenu })}
            >
              <FolderInput size={20} /> {t('files.move')}
            </button>
            <button
              className="select-option"
              onClick={() => openAction('rename', { kind: 'dir', dir: dirMenu })}
            >
              <Pencil size={20} /> {t('files.rename')}
            </button>
            <button
              className="select-option danger-text"
              onClick={() => openAction('delete', { kind: 'dir', dir: dirMenu })}
            >
              <Trash2 size={20} /> {t('common.delete')}
            </button>
          </div>
        )}
      </Sheet>

      <Sheet open={sortOpen} onClose={() => setSortOpen(false)} title={t('files.sort')}>
        <div className="form">
          <div className="field">
            <span>{t('files.sortBy')}</span>
            <div className="segmented">
              {SORTS.map((s) => (
                <button
                  key={s}
                  className={settings.fileSort === s ? 'active' : ''}
                  onClick={() => updateSettings({ fileSort: s })}
                >
                  {t(`files.sort.${s}`)}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <span>{t('files.order')}</span>
            <div className="segmented">
              {[false, true].map((desc) => (
                <button
                  key={String(desc)}
                  className={settings.fileSortDesc === desc ? 'active' : ''}
                  onClick={() => updateSettings({ fileSortDesc: desc })}
                >
                  {desc ? t('files.desc') : t('files.asc')}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <span>{t('files.view')}</span>
            <div className="segmented">
              {(['list', 'grid'] as const).map((v) => (
                <button
                  key={v}
                  className={settings.fileView === v ? 'active' : ''}
                  onClick={() => updateSettings({ fileView: v })}
                >
                  {v === 'list' ? <List size={16} /> : <LayoutGrid size={16} />}
                  {v === 'list' ? t('files.viewList') : t('files.viewGrid')}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Sheet>

      <NameSheet
        open={creating}
        title={t('files.newFolder')}
        initial=""
        confirmLabel={t('files.create')}
        onClose={() => setCreating(false)}
        onSubmit={async (name) => {
          setCreating(false);
          const path = dir ? `${dir}/${name}` : name;
          if (await run(() => createDirectory(printer, path), t('files.folderCreated'))) load();
        }}
      />

      <NameSheet
        open={action?.kind === 'rename'}
        title={t('files.rename')}
        initial={action ? itemName(action.item) : ''}
        confirmLabel={t('common.save')}
        onClose={() => setAction(null)}
        onSubmit={async (name) => {
          if (!action) return;
          const from = itemPath(action.item);
          const parent = parentOf(from);
          setAction(null);
          if (name === itemName(action.item)) return;
          // Keep the G-code extension, or the file would vanish from the list.
          if (action.item.kind === 'file' && !GCODE_NAME.test(name)) {
            name += from.slice(from.lastIndexOf('.'));
          }
          const to = parent ? `${parent}/${name}` : name;
          if (await run(() => moveItem(printer, from, to), t('files.renamed'))) load();
        }}
      />

      <FolderPicker
        printer={printer}
        open={action?.kind === 'move'}
        exclude={action?.item.kind === 'dir' ? action.item.dir.path : undefined}
        onClose={() => setAction(null)}
        onPick={async (dest) => {
          if (!action) return;
          const from = itemPath(action.item);
          const name = itemName(action.item);
          setAction(null);
          if (parentOf(from) === dest) return;
          const to = dest ? `${dest}/${name}` : name;
          const ok = await run(
            () => moveItem(printer, from, to),
            t('files.moved', { dest: dest || t('files.tab.files') }),
          );
          if (ok) load();
        }}
      />

      <ConfirmSheet
        open={action?.kind === 'delete'}
        title={action?.item.kind === 'dir' ? t('files.deleteFolderTitle') : t('files.deleteTitle')}
        message={action ? itemName(action.item) : undefined}
        confirmLabel={t('common.delete')}
        danger
        onConfirm={async () => {
          if (!action) return;
          const item = action.item;
          const ok = await run(
            () =>
              item.kind === 'dir'
                ? deleteDirectory(printer, item.dir.path)
                : deleteFile(printer, item.file.path),
            item.kind === 'dir' ? t('files.folderDeleted') : t('files.deleted'),
          );
          if (ok) load();
        }}
        onClose={() => setAction(null)}
      />
    </PullToRefresh>
  );
}
