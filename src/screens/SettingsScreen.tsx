import { useEffect, useState } from 'react';
import { App as CapApp } from '@capacitor/app';
import {
  Bell,
  Bug,
  Check,
  Clock,
  Heart,
  Info,
  Palette,
  Monitor,
  Moon,
  Pencil,
  Plus,
  Printer as PrinterIcon,
  Radar,
  RotateCcw,
  Share2,
  Smartphone,
  Sun,
  Thermometer,
  Trash2,
} from 'lucide-react';
import { fetchVersions, testConnection, type SystemVersions } from '../api/moonraker';
import { ConfirmSheet, Section, Select, Sheet, useToast } from '../components/ui';
import { localSubnet, scanNetwork, type Found } from '../discovery';
import { isNative, openExternal, PrinterMonitor, shareText } from '../native';
import {
  DEFAULT_SEED,
  PALETTE_STYLES,
  previewColors,
  SEED_PRESETS,
  useSeedColor,
  useSystemColor,
} from '../palette';
import { useT, type MessageKey } from '../i18n';
import {
  DEFAULT_PRESETS,
  newId,
  newPrinter,
  useSettings,
  useStore,
  type CameraMode,
  type EtaMethod,
  type Printer,
  type TempPreset,
  type Theme,
} from '../store';

const REPO_URL = 'https://github.com/KbzonZito/printer-hub';
const AUTHOR_URL = 'https://github.com/KbzonZito';

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
      <div className="field">
        <span>{t('form.camera')}</span>
        <Select
          title={t('form.camera')}
          value={p.cameraMode}
          onChange={(v) => set('cameraMode', v)}
          options={CAMERA_MODES.map((m) => ({ value: m, label: t(`form.cam.${m}` as MessageKey) }))}
        />
      </div>
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
function PaletteDots({ colors }: { colors: string[] }) {
  return (
    <span className="palette-dots">
      {colors.map((c, i) => (
        <span key={i} style={{ background: c }} />
      ))}
    </span>
  );
}

function ColorPicker() {
  const t = useT();
  const { settings, updateSettings } = useSettings();
  const system = useSystemColor();
  const seed = useSeedColor(settings);
  const dark =
    settings.theme === 'dark' ||
    (settings.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  const selected = settings.color === 'device' && !system ? DEFAULT_SEED : settings.color;
  const swatches = [...(system ? ['device'] : []), ...SEED_PRESETS];
  return (
    <>
      <div className="field">
        <span>{t('settings.color')}</span>
        <div className="swatches" role="radiogroup">
          {swatches.map((c) => {
            const color = c === 'device' ? system! : c;
            return (
              <button
                type="button"
                key={c}
                role="radio"
                aria-checked={selected === c}
                aria-label={c === 'device' ? t('settings.colorDevice') : c}
                title={c === 'device' ? t('settings.colorDevice') : undefined}
                className={`swatch ${selected === c ? 'active' : ''}`}
                onClick={() => updateSettings({ color: c })}
              >
                <PaletteDots colors={previewColors(color, settings.paletteStyle, dark)} />
                {selected === c ? <Check size={18} /> : c === 'device' && <Smartphone size={16} />}
              </button>
            );
          })}
        </div>
      </div>
      <div className="field">
        <span>{t('settings.paletteStyle')}</span>
        <Select
          title={t('settings.paletteStyle')}
          value={settings.paletteStyle}
          onChange={(paletteStyle) => updateSettings({ paletteStyle })}
          options={PALETTE_STYLES.map((s) => ({
            value: s,
            label: t(`palette.${s}` as MessageKey),
            extra: <PaletteDots colors={previewColors(seed, s, dark)} />,
          }))}
        />
      </div>
    </>
  );
}

/** Language, theme and colors; also shown during onboarding. */
export function AppearancePrefs() {
  const t = useT();
  const { settings, updateSettings } = useSettings();
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
      <ColorPicker />
    </div>
  );
}

function PresetSheet({
  preset,
  onClose,
  onSave,
}: {
  preset: TempPreset | null;
  onClose: () => void;
  onSave: (p: TempPreset) => void;
}) {
  const t = useT();
  const [form, setForm] = useState({ name: '', nozzle: '', bed: '' });
  useEffect(() => {
    if (preset)
      setForm({ name: preset.name, nozzle: String(preset.nozzle), bed: String(preset.bed) });
  }, [preset]);
  const nozzle = Number(form.nozzle);
  const bed = Number(form.bed);
  const valid =
    form.name.trim() !== '' &&
    form.nozzle !== '' &&
    form.bed !== '' &&
    nozzle >= 0 &&
    nozzle <= 350 &&
    bed >= 0 &&
    bed <= 150;
  return (
    <Sheet open={!!preset} onClose={onClose} title={t('settings.preset')}>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          if (preset && valid) onSave({ id: preset.id, name: form.name.trim(), nozzle, bed });
        }}
      >
        <label className="field">
          <span>{t('settings.presetName')}</span>
          <input
            className="input"
            value={form.name}
            placeholder="PLA"
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </label>
        <div className="row gap">
          <label className="field grow">
            <span>{t('settings.nozzleTemp')}</span>
            <input
              className="input"
              type="number"
              inputMode="numeric"
              value={form.nozzle}
              onChange={(e) => setForm({ ...form, nozzle: e.target.value })}
            />
          </label>
          <label className="field grow">
            <span>{t('settings.bedTemp')}</span>
            <input
              className="input"
              type="number"
              inputMode="numeric"
              value={form.bed}
              onChange={(e) => setForm({ ...form, bed: e.target.value })}
            />
          </label>
        </div>
        <div className="row gap">
          <button type="button" className="btn grow" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="submit" className="btn primary grow" disabled={!valid}>
            {t('common.save')}
          </button>
        </div>
      </form>
    </Sheet>
  );
}

function PresetsEditor() {
  const t = useT();
  const { settings, updateSettings } = useSettings();
  const [editing, setEditing] = useState<TempPreset | null>(null);
  const [deleting, setDeleting] = useState<TempPreset | null>(null);
  const presets = settings.presets;
  return (
    <div className="field">
      <small className="muted">{t('settings.presetsHint')}</small>
      {presets.map((p) => (
        <div key={p.id} className="preset-row">
          <span className="grow">
            <strong>{p.name}</strong>
            <small className="muted">
              {t('home.nozzle')} {p.nozzle}° · {t('home.bed')} {p.bed}°
            </small>
          </span>
          <button
            type="button"
            className="btn icon ghost"
            onClick={() => setEditing(p)}
            aria-label={t('settings.edit')}
          >
            <Pencil size={16} />
          </button>
          <button
            type="button"
            className="btn icon ghost"
            onClick={() => setDeleting(p)}
            aria-label={t('common.delete')}
          >
            <Trash2 size={16} />
          </button>
        </div>
      ))}
      <div className="row gap">
        <button
          type="button"
          className="btn grow"
          onClick={() => setEditing({ id: newId(), name: '', nozzle: 210, bed: 60 })}
        >
          <Plus size={18} /> {t('settings.addPreset')}
        </button>
        <button
          type="button"
          className="btn icon"
          onClick={() => updateSettings({ presets: DEFAULT_PRESETS })}
          aria-label={t('settings.resetPresets')}
          title={t('settings.resetPresets')}
        >
          <RotateCcw size={18} />
        </button>
      </div>
      <PresetSheet
        preset={editing}
        onClose={() => setEditing(null)}
        onSave={(p) => {
          const exists = presets.some((x) => x.id === p.id);
          updateSettings({
            presets: exists ? presets.map((x) => (x.id === p.id ? p : x)) : [...presets, p],
          });
          setEditing(null);
        }}
      />
      <ConfirmSheet
        open={!!deleting}
        title={t('settings.deletePreset', { name: deleting?.name ?? '' })}
        confirmLabel={t('common.delete')}
        danger
        onConfirm={() =>
          deleting && updateSettings({ presets: presets.filter((x) => x.id !== deleting.id) })
        }
        onClose={() => setDeleting(null)}
      />
    </div>
  );
}

function EtaPref() {
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

function NotifyPref() {
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

// Lucide no longer ships brand logos.
function GithubIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.52-1.33-1.28-1.69-1.28-1.69-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.42-2.7 5.39-5.26 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5Z" />
    </svg>
  );
}

function useAppVersion() {
  const [version, setVersion] = useState(__APP_VERSION__);
  useEffect(() => {
    if (!isNative) return;
    CapApp.getInfo()
      .then((i) => setVersion(i.version))
      .catch(() => {});
  }, []);
  return version;
}

function About({ printer }: { printer: Printer | null }) {
  const t = useT();
  const version = useAppVersion();
  const [versions, setVersions] = useState<SystemVersions | null>(null);
  useEffect(() => {
    if (!printer) return;
    fetchVersions(printer)
      .then(setVersions)
      .catch(() => {});
  }, [printer?.id]);
  return (
    <div className="about">
      <h3>Printer Hub v{version}</h3>
      <p className="muted small">{t('about.tagline')}</p>
      <div className="about-images">
        <img src="./icon.svg" alt="" />
        <img
          src={`${AUTHOR_URL}.png?size=160`}
          alt="KbzonZito"
          onError={(e) => (e.currentTarget.style.display = 'none')}
        />
      </div>
      <span className="made-by">
        {t('about.madeWith')} <Heart size={16} /> {t('about.by')}
        <button type="button" onClick={() => openExternal(AUTHOR_URL)}>
          KbzonZito
        </button>
      </span>
      <button type="button" className="btn primary" onClick={() => openExternal(REPO_URL)}>
        <GithubIcon /> {t('about.star')}
      </button>
      <div className="row gap">
        <button
          type="button"
          className="btn grow"
          onClick={() => openExternal(`${REPO_URL}/issues/new`)}
        >
          <Bug size={18} /> {t('about.issue')}
        </button>
        <button
          type="button"
          className="btn grow"
          onClick={() => shareText(t('about.shareText', { url: REPO_URL }))}
        >
          <Share2 size={18} /> {t('about.share')}
        </button>
      </div>
      {printer && (
        <div className="about-meta">
          <strong>{t('about.printer')}</strong>
          <div className="estimate-row">
            <span className="muted">Host</span>
            <span>{versions?.hostname ?? printer.host}</span>
          </div>
          {versions?.klipper && (
            <div className="estimate-row">
              <span className="muted">Klipper</span>
              <span>{versions.klipper.split('-')[0]}</span>
            </div>
          )}
          {versions?.moonraker && (
            <div className="estimate-row">
              <span className="muted">Moonraker</span>
              <span>{versions.moonraker.split('-')[0]}</span>
            </div>
          )}
        </div>
      )}
      <p className="muted small">{t('settings.aboutText')}</p>
      <div className="about-links">
        <button type="button" onClick={() => openExternal(REPO_URL)}>
          {t('about.source')}
        </button>
        <span>·</span>
        <button type="button" onClick={() => openExternal(`${REPO_URL}/releases`)}>
          {t('about.releases')}
        </button>
        <span>·</span>
        <button type="button" onClick={() => openExternal(`${REPO_URL}#readme`)}>
          {t('about.help')}
        </button>
      </div>
    </div>
  );
}

export function SettingsScreen() {
  const t = useT();
  const { settings } = useSettings();
  const { printers, active, savePrinter, removePrinter, selectPrinter } = useStore();
  const [editing, setEditing] = useState<Printer | null>(null);
  const [deleting, setDeleting] = useState<Printer | null>(null);
  const toast = useToast();
  const themeKey = THEMES.find((x) => x.id === settings.theme)!.key;

  return (
    <div className="screen settings settings-sections">
      <Section
        id="printers"
        icon={PrinterIcon}
        title={t('settings.printers')}
        summary={active ? `${active.name} · ${active.host}` : undefined}
        defaultOpen
      >
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
      </Section>

      <Section
        id="appearance"
        icon={Palette}
        title={t('settings.appearance')}
        summary={`${settings.lang === 'es' ? 'Español' : 'English'} · ${t(themeKey)} · ${t(
          `palette.${settings.paletteStyle}` as MessageKey,
        )}`}
      >
        <AppearancePrefs />
      </Section>

      <Section
        id="temps"
        icon={Thermometer}
        title={t('settings.presets')}
        summary={settings.presets.map((p) => p.name).join(' · ')}
      >
        <PresetsEditor />
      </Section>

      <Section
        id="eta"
        icon={Clock}
        title={t('settings.etaTitle')}
        summary={t(`eta.${settings.eta}` as MessageKey)}
      >
        <EtaPref />
      </Section>

      {isNative && (
        <Section
          id="notify"
          icon={Bell}
          title={t('settings.notifications')}
          summary={settings.notify ? t('settings.on') : t('settings.off')}
        >
          <NotifyPref />
        </Section>
      )}

      <Section id="about" icon={Info} title={t('settings.about')} summary="KbzonZito">
        <About printer={active} />
      </Section>

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
