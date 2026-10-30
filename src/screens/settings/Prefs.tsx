import { useEffect, useRef, useState } from 'react';
import { Bell, Download, Layers, Trash2, Upload } from 'lucide-react';
import { BackupError, backupFileName, backupJson, parseBackup } from '../../backup';
import { cacheUsage, pruneModels } from '../../gcode/cache';
import { formatBytes } from '../../format';
import { ConfirmSheet, Select, useToast } from '../../components/ui';
import { PrinterMonitor, saveTextFile } from '../../native';
import { useT, type MessageKey } from '../../i18n';
import { getState, replaceState, useSettings, type EtaMethod, type State } from '../../store';
import { clearStoredMeta, metaUsage } from '../../api/metaStore';

// Smaller settings sections: remaining time, notifications, storage and backup.

export const ETA_METHODS: EtaMethod[] = ['auto', 'slicer', 'printer', 'file', 'filament'];
export function EtaPref() {
  const t = useT();
  const { settings, updateSettings } = useSettings();
  return (
    <div className="field">
      <span>{t('settings.eta')}</span>
      <Select
        title={t('settings.eta')}
        value={settings.eta}
        onChange={(eta) => updateSettings({ eta })}
        options={ETA_METHODS.map((m) => ({ value: m, label: t(`eta.${m}` as MessageKey) }))}
      />
      <small className="muted">{t('settings.etaHint')}</small>
    </div>
  );
}

export function NotifyPref() {
  const t = useT();
  const { settings, updateSettings } = useSettings();
  const toast = useToast();
  return (
    <label className="toggle">
      <Bell size={18} />
      <span className="grow">
        <strong>{t('settings.notify')}</strong>
        <small className="muted">{t('settings.notifyHint')}</small>
      </span>
      <input
        type="checkbox"
        role="switch"
        className="switch"
        checked={settings.notify}
        aria-checked={settings.notify}
        onChange={async (e) => {
          const on = e.target.checked;
          if (on) {
            const { granted } = await PrinterMonitor.requestNotifications();
            if (!granted) toast(t('settings.notifyDenied'), true);
          } else {
            PrinterMonitor.stopMonitor();
          }
          updateSettings({ notify: on });
        }}
      />
    </label>
  );
}

export function FirstLayerPref() {
  const t = useT();
  const { settings, updateSettings } = useSettings();
  return (
    <label className="toggle">
      <Layers size={18} />
      <span className="grow">
        <strong>{t('settings.firstLayer')}</strong>
        <small className="muted">{t('settings.firstLayerHint')}</small>
      </span>
      <input
        type="checkbox"
        role="switch"
        className="switch"
        checked={settings.notifyFirstLayer}
        aria-checked={settings.notifyFirstLayer}
        disabled={!settings.notify}
        onChange={(e) => updateSettings({ notifyFirstLayer: e.target.checked })}
      />
    </label>
  );
}

const CACHE_DAYS = [7, 30, 0];

/** Space taken by saved G-code previews, with a button and an auto-delete period. */
export function StoragePrefs() {
  const t = useT();
  const toast = useToast();
  const { settings, updateSettings } = useSettings();
  const [usage, setUsage] = useState<{ count: number; bytes: number } | null>(null);
  const [meta, setMeta] = useState<{ count: number; bytes: number } | null>(null);
  const refresh = () => Promise.all([cacheUsage().then(setUsage), metaUsage().then(setMeta)]);
  useEffect(() => {
    refresh();
  }, []);
  return (
    <>
      <p className="muted small">{t('storage.hint')}</p>
      <div className="estimate-row">
        <span className="muted">{t('storage.previews')}</span>
        <span>
          {usage ? t('storage.usage', { n: usage.count, size: formatBytes(usage.bytes) }) : '…'}
        </span>
      </div>
      <div className="estimate-row">
        <span className="muted">{t('storage.fileData')}</span>
        <span>
          {meta ? t('storage.usage', { n: meta.count, size: formatBytes(meta.bytes) }) : '…'}
        </span>
      </div>
      <div className="field">
        <span>{t('storage.autoDelete')}</span>
        <Select
          title={t('storage.autoDelete')}
          value={String(settings.previewCacheDays)}
          onChange={(v) => updateSettings({ previewCacheDays: Number(v) })}
          options={CACHE_DAYS.map((d) => ({
            value: String(d),
            label: d === 0 ? t('storage.never') : d === 7 ? t('storage.week') : t('storage.month'),
          }))}
        />
      </div>
      <button
        className="btn"
        disabled={!usage?.count && !meta?.count}
        onClick={async () => {
          await Promise.all([pruneModels(0), clearStoredMeta()]);
          await refresh();
          toast(t('storage.cleared'));
        }}
      >
        <Trash2 size={18} /> {t('storage.clear')}
      </button>
    </>
  );
}

/** Export and import printers, presets and appearance as a JSON file. */
export function BackupPrefs() {
  const t = useT();
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<State | null>(null);

  const exportBackup = async () => {
    try {
      if (await saveTextFile(backupFileName(), backupJson(getState()))) toast(t('backup.exported'));
    } catch (e) {
      toast((e as Error).message, true);
    }
  };

  const onFile = async (file: File | undefined) => {
    if (inputRef.current) inputRef.current.value = '';
    if (!file) return;
    try {
      setPending(parseBackup(await file.text()));
    } catch (e) {
      const newer = e instanceof BackupError && e.message === 'newer';
      toast(newer ? t('backup.newer') : t('backup.invalid'), true);
    }
  };

  return (
    <>
      <p className="muted small">{t('backup.hint')}</p>
      <div className="row gap">
        <button className="btn grow" onClick={exportBackup}>
          <Download size={18} /> {t('backup.export')}
        </button>
        <button className="btn grow" onClick={() => inputRef.current?.click()}>
          <Upload size={18} /> {t('backup.import')}
        </button>
      </div>
      <input
        ref={inputRef}
        type="file"
        // No "accept": some Android file pickers grey out .json files. The content is checked.
        hidden
        onChange={(e) => onFile(e.target.files?.[0])}
      />
      <ConfirmSheet
        open={!!pending}
        title={t('backup.confirmTitle')}
        message={t('backup.confirmText', { n: pending?.printers.length ?? 0 })}
        confirmLabel={t('backup.restore')}
        onConfirm={() => {
          if (!pending) return;
          replaceState(pending);
          toast(t('backup.restored'));
        }}
        onClose={() => setPending(null)}
      />
    </>
  );
}
