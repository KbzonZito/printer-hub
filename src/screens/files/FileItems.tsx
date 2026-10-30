import { Clock, FileBox, Folder, MoreVertical } from 'lucide-react';
import { thumbnailUrl, type GcodeDir, type GcodeFile } from '../../api/moonraker';
import { baseName, formatBytes, formatDate, formatDuration } from '../../format';
import { useLang, useT } from '../../i18n';
import type { Printer } from '../../store';
import { useMetadata, useVisible, parentOf } from './fileMeta';

// Rows (list) and cards (grid) of the file browser: files with thumbnail and time, and folders.

export function FileItem({
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

export function DirItem({
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
      onKeyDown={(e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
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
