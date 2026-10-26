import { useState } from 'react';
import {
  Bell,
  Check,
  Monitor,
  Moon,
  Pencil,
  Plus,
  Printer as PrinterIcon,
  Radar,
  Sun,
  Trash2,
} from 'lucide-react';
import { testConnection } from '../api/moonraker';
import { ConfirmSheet, Sheet, useToast } from '../components/ui';
import { localSubnet, scanNetwork, type Found } from '../discovery';
import { isNative, PrinterMonitor } from '../native';
import { useT, type MessageKey } from '../i18n';
import {
  newPrinter,
  useSettings,
  useStore,
  type CameraMode,
  type EtaMethod,
  type Printer,
  type Theme,
} from '../store';

const CAMERA_MODES: CameraMode[] = ['auto', 'webrtc', 'mjpeg', 'snapshot'];
const ETA_METHODS: EtaMethod[] = ['auto', 'slicer', 'printer', 'file', 'filament'];
const THEMES: { id: Theme; key: MessageKey; icon: typeof Sun }[] = [
  { id: 'system', key: 'settings.themeSystem', icon: Monitor },
  { id: 'light', key: 'settings.themeLight', icon: Sun },
  { id: 'dark', key: 'settings.themeDark', icon: Moon },
];

export function PrinterForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: Printer;
  onSave: (p: Printer) => void;
  onCancel?: () => void;
}) {
  const t = useT();
  const [p, setP] = useState(initial);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [scan, setScan] = useState<{ pct: number; subnet: string; found: Found[] } | null>(null);
  const scanning = scan != null && scan.pct < 100;
  const set = <K extends keyof Printer>(k: K, v: Printer[K]) => setP((x) => ({ ...x, [k]: v }));
  const clean = {
    ...p,
    host: p.host
      .trim()
      .replace(/^https?:\/\//, '')
      .replace(/[/:].*$/, ''),
  };

  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault();
        if (clean.host) onSave(clean);
      }}
    >
      <label>
        <span>{t('form.name')}</span>
        <input className="input" value={p.name} onChange={(e) => set('name', e.target.value)} />
      </label>
      <div className="row gap">
        <label className="grow">
          <span>{t('form.host')}</span>
          <input
            className="input"
            placeholder="192.168.1.50"
            inputMode="url"
            autoCapitalize="off"
            value={p.host}
            onChange={(e) => set('host', e.target.value)}
            required
          />
        </label>
        <label style={{ width: 96 }}>
          <span>{t('form.port')}</span>
          <input
            className="input"
            type="number"
            value={p.port}
            onChange={(e) => set('port', Number(e.target.value) || 7125)}
          />
        </label>
      </div>
      <button
        type="button"
        className="btn"
        disabled={scanning}
        onClick={async () => {
          const subnet = await localSubnet();
          setScan({ pct: 0, subnet, found: [] });
          await scanNetwork(
            subnet,
            (f) => setScan((s) => s && { ...s, found: [...s.found, f] }),
            (fr) => setScan((s) => s && { ...s, pct: Math.round(fr * 100) }),
            () => false,
          );
          setScan((s) => s && { ...s, pct: 100 });
        }}
      >
        {scanning ? <div className="loader small" /> : <Radar size={18} />}
        {scanning ? t('discovery.scanning', { pct: scan.pct }) : t('discovery.scan')}
      </button>
      {scan && scan.found.length > 0 && (
        <div className="found-list">
          <span className="muted small">{t('discovery.pick')}</span>
          {scan.found.map((f) => (
            <button
              type="button"
              key={f.host}
              className={`found ${p.host === f.host ? 'selected' : ''}`}
              onClick={() => setP((x) => ({ ...x, host: f.host }))}
            >
              <PrinterIcon size={18} />
              <strong>{f.name}</strong>
              <span className="muted small">{f.host}</span>
            </button>
          ))}
        </div>
      )}
      {scan && !scanning && scan.found.length === 0 && (
        <p className="muted small">{t('discovery.none', { subnet: scan.subnet })}</p>
      )}
      <label>
        <span>{t('form.camera')}</span>
        <select
          className="input"
          value={p.cameraMode}
          onChange={(e) => set('cameraMode', e.target.value as CameraMode)}
        >
          {CAMERA_MODES.map((m) => (
            <option key={m} value={m}>
              {t(`form.cam.${m}` as MessageKey)}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>{t('form.cameraUrl')}</span>
        <input
          className="input"
          placeholder="http://192.168.1.50:8080/?action=stream"
          autoCapitalize="off"
          value={p.cameraUrl}
          onChange={(e) => set('cameraUrl', e.target.value)}
        />
      </label>

      {result && <div className={`banner ${result.ok ? 'ok' : 'error'}`}>{result.text}</div>}

      <div className="row gap">
        <button
          type="button"
          className="btn grow"
          disabled={!clean.host || testing}
          onClick={async () => {
            setTesting(true);
            setResult(null);
            try {
              setResult({ ok: true, text: await testConnection(clean) });
            } catch (err) {
              setResult({ ok: false, text: (err as Error).message });
            }
            setTesting(false);
          }}
        >
          {testing ? <div className="loader small" /> : t('form.test')}
        </button>
        {onCancel && (
          <button type="button" className="btn ghost" onClick={onCancel}>
            {t('common.cancel')}
          </button>
        )}
        <button type="submit" className="btn primary grow" disabled={!clean.host}>
          {t('common.save')}
        </button>
      </div>
    </form>
  );
}

/** Language, theme and ETA preferences; also shown during onboarding. */
export function AppPreferences({ compact }: { compact?: boolean }) {
  const t = useT();
  const { settings, updateSettings } = useSettings();
  const toast = useToast();
  return (
    <div className="form">
      <div className="field">
        <span>{t('settings.language')}</span>
        <div className="segmented">
          {(['es', 'en'] as const).map((l) => (
            <button
              type="button"
              key={l}
              className={settings.lang === l ? 'active' : ''}
              onClick={() => updateSettings({ lang: l })}
            >
              {l === 'es' ? 'Español' : 'English'}
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <span>{t('settings.theme')}</span>
        <div className="segmented">
          {THEMES.map(({ id, key, icon: Icon }) => (
            <button
              type="button"
              key={id}
              className={settings.theme === id ? 'active' : ''}
              onClick={() => updateSettings({ theme: id })}
            >
              <Icon size={15} /> {t(key)}
            </button>
          ))}
        </div>
      </div>
      {!compact && (
        <label>
          <span>{t('settings.eta')}</span>
          <select
            className="input"
            value={settings.eta}
            onChange={(e) => updateSettings({ eta: e.target.value as EtaMethod })}
          >
            {ETA_METHODS.map((m) => (
              <option key={m} value={m}>
                {t(`eta.${m}` as MessageKey)}
              </option>
            ))}
          </select>
          <small className="muted">{t('settings.etaHint')}</small>
        </label>
      )}
      {!compact && isNative && (
        <label className="toggle">
          <Bell size={18} />
          <span className="grow">
            <strong>{t('settings.notify')}</strong>
            <small className="muted">{t('settings.notifyHint')}</small>
          </span>
          <input
            type="checkbox"
            checked={settings.notify}
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
      )}
    </div>
  );
}

export function SettingsScreen() {
  const t = useT();
  const { printers, active, savePrinter, removePrinter, selectPrinter } = useStore();
  const [editing, setEditing] = useState<Printer | null>(null);
  const [deleting, setDeleting] = useState<Printer | null>(null);
  const toast = useToast();

  return (
    <div className="screen settings">
      <section className="settings-group">
        <h2 className="section-title">{t('settings.printers')}</h2>
        <div className="list">
          {printers.map((p) => (
            <div key={p.id} className={`list-item ${active?.id === p.id ? 'selected' : ''}`}>
              <button className="list-main" onClick={() => selectPrinter(p.id)}>
                <PrinterIcon size={20} />
                <div>
                  <strong>{p.name}</strong>
                  <span className="muted small">
                    {p.host}:{p.port}
                  </span>
                </div>
                {active?.id === p.id && <Check size={18} className="accent" />}
              </button>
              <button
                className="btn icon ghost"
                onClick={() => setEditing(p)}
                aria-label={t('settings.edit')}
              >
                <Pencil size={16} />
              </button>
              <button
                className="btn icon ghost"
                onClick={() => setDeleting(p)}
                aria-label={t('common.delete')}
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
        <button className="btn" onClick={() => setEditing(newPrinter())}>
          <Plus size={18} /> {t('settings.add')}
        </button>
      </section>

      <section className="settings-group">
        <h2 className="section-title">{t('settings.app')}</h2>
        <AppPreferences />
      </section>

      <section className="settings-group">
        <h2 className="section-title">{t('settings.about')}</h2>
        <p className="muted small">{t('settings.aboutText')}</p>
      </section>

      <Sheet open={!!editing} onClose={() => setEditing(null)} title={t('settings.printer')}>
        {editing && (
          <PrinterForm
            key={editing.id}
            initial={editing}
            onCancel={() => setEditing(null)}
            onSave={(p) => {
              savePrinter(p);
              setEditing(null);
              toast(t('common.saved'));
            }}
          />
        )}
      </Sheet>
      <ConfirmSheet
        open={!!deleting}
        title={t('settings.deleteTitle', { name: deleting?.name ?? '' })}
        confirmLabel={t('common.delete')}
        danger
        onConfirm={() => deleting && removePrinter(deleting.id)}
        onClose={() => setDeleting(null)}
      />
    </div>
  );
}
