import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUpDown,
  Layers,
  ListPlus,
  FileBox,
  FolderInput,
  FolderPlus,
  LayoutGrid,
  List,
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
  listDirectory,
  listFiles,
  moveItem,
  printerActions,
  thumbnailUrl,
  uploadFile,
  type GcodeDir,
  type GcodeFile,
} from '../api/moonraker';
import { PullToRefresh } from '../components/PullToRefresh';
import { Empty, LoadError, Loading } from '../components/states';
import { useActiveSpool } from '../components/SpoolCard';
import { ConfirmSheet, Sheet, useAction } from '../components/ui';
import { useBackHandler } from '../backStack';
import { useIncremental } from '../useIncremental';
import { baseName } from '../format';
import { useT } from '../i18n';
import { useSettings, type FileSort, type Printer } from '../store';
import {
  useCapabilities,
  useConnectionEvent,
  usePrinterReady,
  usePrinterStatus,
} from '../usePrinterStatus';
import { enqueue } from '../api/queue';
import { useCalibration, useFileMeta, GCODE_NAME, parentOf, type Item } from './files/fileMeta';
import { FileItem, DirItem } from './files/FileItems';
import { FolderPicker, Breadcrumbs, NameSheet } from './files/FileSheets';
import { EstimateCard, FileDetails } from './files/FileDetails';
import { lazyNamed } from '../lazy';
// Full-screen viewers load when first opened.
const GcodeViewer = lazyNamed(() => import('../components/GcodeViewer'), 'GcodeViewer');

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

  // The folder on screen. A listing that arrives for another one (a slow response, or a reload
  // scheduled just before moving to another folder) is ignored instead of replacing it.
  const currentDir = useRef(dir);
  currentDir.current = dir;
  const load = useCallback(() => {
    setError(null);
    setAllFiles(null);
    const requested = dir;
    return listDirectory(printer, requested)
      .then((l) => requested === currentDir.current && setListing(l))
      .catch((e) => requested === currentDir.current && setError((e as Error).message));
  }, [printer, dir]);
  const latestLoad = useRef(load);
  latestLoad.current = load;
  // Files added, moved or deleted from elsewhere (the slicer, Fluidd…) show up by themselves.
  const reloadTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useConnectionEvent('notify_filelist_changed', () => {
    clearTimeout(reloadTimer.current);
    // latestLoad: the folder on screen when the timer fires, not when the event arrived.
    reloadTimer.current = setTimeout(() => latestLoad.current(), 500);
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

  // Back to the first rows in another folder or search.
  const { shown, more, sentinel } = useIncremental(items, `${dir}|${query}`);

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

      {error && <LoadError message={error} onRetry={load} />}
      {loading && <Loading />}
      {!loading && !error && items.length === 0 && (
        <Empty icon={FileBox}>
          {query ? t('files.noResults') : dir ? t('files.emptyFolder') : t('files.none')}
        </Empty>
      )}
      <div className={grid ? 'file-grid' : 'file-list'} key={`${dir}|${query ? 'q' : ''}`}>
        {shown.map((item) =>
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
      {more && <div ref={sentinel} className="list-more" aria-hidden="true" />}

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

      <Suspense fallback={null}>
        {preview && (
          <GcodeViewer printer={printer} file={preview} onClose={() => setPreview(null)} />
        )}
      </Suspense>
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
