import { useEffect, useState } from 'react';
import { ChevronRight, Folder, FolderInput, FolderOpen } from 'lucide-react';
import { listDirectory, type GcodeDir } from '../../api/moonraker';
import { Sheet } from '../../components/ui';
import { useT } from '../../i18n';
import type { Printer } from '../../store';

// Sheets and navigation of the file browser: folder picker (move), breadcrumbs and the name
// sheet (new folder, rename).

export function FolderPicker({
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

export function Breadcrumbs({
  dir,
  onNavigate,
}: {
  dir: string;
  onNavigate: (dir: string) => void;
}) {
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

export function NameSheet({
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
