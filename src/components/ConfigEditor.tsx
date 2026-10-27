import { useEffect, useState } from 'react';
import { ChevronRight, FileCog, Lock, RotateCcw, Save } from 'lucide-react';
import {
  canWrite,
  listConfigFiles,
  readConfigFile,
  saveConfigFile,
  type ConfigFile,
} from '../api/config';
import { printerActions } from '../api/moonraker';
import { formatDate } from '../format';
import { useLang, useT } from '../i18n';
import type { Printer } from '../store';
import { ConfirmSheet, Sheet, useAction } from './ui';

/** Opens one config file, edits it and saves it, optionally restarting the firmware. */
function EditorSheet({
  printer,
  file,
  printing,
  onClose,
}: {
  printer: Printer;
  file: ConfigFile | null;
  printing: boolean;
  onClose: () => void;
}) {
  const t = useT();
  const run = useAction();
  const [original, setOriginal] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<'save' | 'discard' | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!file) return;
    setOriginal(null);
    setError(null);
    readConfigFile(printer, file.path)
      .then((s) => {
        setOriginal(s);
        setText(s);
      })
      .catch((e) => setError((e as Error).message));
  }, [file?.path]);

  const dirty = original != null && text !== original;
  const writable = file ? canWrite(file) : false;
  const close = () => (dirty ? setConfirm('discard') : onClose());

  const save = async (restart: boolean) => {
    if (!file) return;
    setSaving(true);
    const ok = await run(
      async () => {
        await saveConfigFile(printer, file.path, text);
        if (restart) await printerActions.firmwareRestart(printer);
      },
      restart ? t('config.savedRestart') : t('config.saved'),
    );
    setSaving(false);
    if (ok) {
      setOriginal(text);
      onClose();
    }
  };

  return (
    <Sheet open={!!file} onClose={close} title={file?.path}>
      {error && <p className="muted">{error}</p>}
      {original == null && !error && <div className="loader" />}
      {original != null && (
        <>
          {!writable && (
            <p className="muted small row-inline">
              <Lock size={14} /> {t('config.readOnly')}
            </p>
          )}
          <textarea
            className="config-text mono"
            value={text}
            readOnly={!writable}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            onChange={(e) => setText(e.target.value)}
            aria-label={file?.path}
          />
          <div className="row gap">
            <button className="btn grow" onClick={close}>
              {t('common.cancel')}
            </button>
            {writable && (
              <button
                className="btn primary grow"
                disabled={!dirty || saving}
                onClick={() => setConfirm('save')}
              >
                {saving ? <div className="loader small" /> : <Save size={18} />} {t('common.save')}
              </button>
            )}
          </div>
        </>
      )}
      <Sheet
        open={confirm === 'save'}
        onClose={() => setConfirm(null)}
        title={t('config.saveTitle', { name: file?.path ?? '' })}
      >
        <p className="muted">{t('config.saveHint')}</p>
        <div className="select-options">
          <button
            className="select-option"
            disabled={printing}
            onClick={() => {
              setConfirm(null);
              save(true);
            }}
          >
            <RotateCcw size={20} />
            <span className="grow">
              <strong>{t('config.saveRestart')}</strong>
              <small className="muted">
                {printing ? t('config.restartPrinting') : t('config.saveRestartHint')}
              </small>
            </span>
          </button>
          <button
            className="select-option"
            onClick={() => {
              setConfirm(null);
              save(false);
            }}
          >
            <Save size={20} />
            <span className="grow">
              <strong>{t('config.saveOnly')}</strong>
              <small className="muted">{t('config.saveOnlyHint')}</small>
            </span>
          </button>
        </div>
      </Sheet>
      <ConfirmSheet
        open={confirm === 'discard'}
        title={t('config.discardTitle')}
        confirmLabel={t('config.discard')}
        danger
        onConfirm={onClose}
        onClose={() => setConfirm(null)}
      />
    </Sheet>
  );
}

/** List of Klipper config files, for the Control screen. */
export function ConfigCard({ printer, printing }: { printer: Printer; printing: boolean }) {
  const t = useT();
  const lang = useLang();
  const [files, setFiles] = useState<ConfigFile[] | null>(null);
  const [open, setOpen] = useState<ConfigFile | null>(null);

  useEffect(() => {
    listConfigFiles(printer)
      .then(setFiles)
      .catch(() => setFiles([]));
  }, [printer.id]);

  if (!files?.length) return null;
  return (
    <section className="card">
      <h2 className="card-title">{t('config.title')}</h2>
      <p className="muted small">{t('config.hint')}</p>
      <div className="select-options">
        {files.map((f) => (
          <button key={f.path} className="select-option" onClick={() => setOpen(f)}>
            {canWrite(f) ? <FileCog size={20} /> : <Lock size={20} />}
            <span className="grow">
              <strong>{f.path}</strong>
              <small className="muted">{formatDate(f.modified, lang)}</small>
            </span>
            <ChevronRight size={18} />
          </button>
        ))}
      </div>
      <EditorSheet
        printer={printer}
        file={open}
        printing={printing}
        onClose={() => setOpen(null)}
      />
    </section>
  );
}
