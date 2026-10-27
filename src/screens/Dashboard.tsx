import { useEffect, useState } from 'react';
import {
  Fan,
  Flame,
  Home,
  Layers,
  Lightbulb,
  Maximize2,
  Pause,
  Play,
  SlidersHorizontal,
  Square,
  Thermometer,
  WifiOff,
} from 'lucide-react';
import {
  fetchMetadata,
  printerActions,
  thumbnailUrl,
  type FileMetadata,
  type Heater,
} from '../api/moonraker';
import { CameraView } from '../components/CameraView';
import { CameraViewer } from '../components/CameraViewer';
import { SpoolCard } from '../components/SpoolCard';
import { TempChart } from '../components/TempChart';
import { TuneSheet } from '../components/TuneSheet';
import { ConfirmSheet, Sheet, useAction } from '../components/ui';
import { computeEta } from '../eta';
import { baseName, formatClock, formatDuration } from '../format';
import { useT, type MessageKey } from '../i18n';
import { useSettings, type Printer } from '../store';
import { useConnection, usePrinterReady, usePrinterStatus } from '../usePrinterStatus';
import { haptic } from '../haptics';

function ProgressRing({ value }: { value: number }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  return (
    <svg className="ring" viewBox="0 0 80 80" width="80" height="80">
      <circle cx="40" cy="40" r={r} className="ring-track" />
      <circle
        cx="40"
        cy="40"
        r={r}
        className="ring-value"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - value)}
      />
      <text x="40" y="45" textAnchor="middle">
        {Math.round(value * 100)}%
      </text>
    </svg>
  );
}

function TempTile({
  icon,
  label,
  heater,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  heater: Heater;
  onClick?: () => void;
}) {
  const t = useT();
  const heating = heater.target > 0;
  return (
    <button className={`tile ${heating ? 'heating' : ''}`} onClick={onClick} disabled={!onClick}>
      <div className="tile-label">
        {icon}
        {label}
      </div>
      <div className="tile-value">
        {heater.temperature.toFixed(0)}
        <small>°C</small>
      </div>
      {onClick && (
        <div className="tile-sub">
          {heating ? `→ ${heater.target.toFixed(0)}°C` : t('home.off')}
        </div>
      )}
    </button>
  );
}

export function Dashboard({ printer }: { printer: Printer }) {
  const t = useT();
  const { settings } = useSettings();
  const { status, error, refresh, tempHistory } = usePrinterStatus();
  const conn = useConnection();
  const ready = usePrinterReady();
  const run = useAction();
  const [meta, setMeta] = useState<{ file: string; data: FileMetadata } | null>(null);
  const [tempSheet, setTempSheet] = useState<'extruder' | 'heater_bed' | null>(null);
  const [customTemp, setCustomTemp] = useState('');
  const [preheat, setPreheat] = useState(false);
  const [confirm, setConfirm] = useState<'cancel' | null>(null);
  const [viewer, setViewer] = useState(false);
  const [tune, setTune] = useState(false);

  const filename = status?.filename;
  useEffect(() => {
    if (!filename || meta?.file === filename) return;
    fetchMetadata(printer, filename)
      .then((data) => setMeta({ file: filename, data }))
      .catch(() => {});
  }, [filename, printer]);

  const act = async (fn: () => Promise<unknown>, msg?: string) => {
    await run(fn, msg);
    refresh();
  };

  if (!status) {
    return (
      <div className="screen center">
        {error ? (
          <div className="empty">
            <WifiOff size={36} />
            <h2>{t('home.offline')}</h2>
            <p className="muted">
              {t('home.offlineHint', { error, host: printer.host, port: printer.port })}
            </p>
            <button className="btn primary" onClick={() => conn?.retryNow()}>
              {t('common.retry')}
            </button>
          </div>
        ) : (
          <div className="empty">
            <div className="loader" />
            <p className="muted">{t('home.connecting', { name: printer.name })}</p>
          </div>
        )}
      </div>
    );
  }

  const active = status.state === 'printing' || status.state === 'paused';
  const jobMeta = meta?.file === status.filename ? meta.data : undefined;
  const thumb = status.filename ? thumbnailUrl(printer, status.filename, jobMeta) : null;
  const eta = computeEta(status, jobMeta, settings.eta);

  return (
    <div className="screen wide">
      {/* Actions are disabled while reconnecting (Klipper problems get their own screen). */}
      <fieldset className="dash" disabled={!ready}>
        <div className="dash-main">
          {/* Not a <button>: it must open even while the fieldset is disabled (printer offline). */}
          <div
            role="button"
            tabIndex={0}
            className="card camera-card"
            onClick={() => setViewer(true)}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setViewer(true)}
            aria-label={t('camera.fullscreen')}
          >
            {/* One stream at a time: the Creality camera may not serve two. */}
            {viewer ? <div className="camera" /> : <CameraView printer={printer} />}
            <span className="camera-expand">
              <Maximize2 size={18} />
            </span>
          </div>
          <TempChart history={tempHistory} />
        </div>

        <div className="dash-side">
          <section className="card job">
            <div className="job-head">
              {thumb ? (
                <img className="job-thumb" src={thumb} alt="" />
              ) : (
                <div className="job-thumb placeholder">
                  <Layers size={26} />
                </div>
              )}
              <div className="job-info">
                <span className={`pill ${status.state}`}>
                  {t(`state.${status.state}` as MessageKey) ?? status.state}
                </span>
                <h2 className="job-name">
                  {status.filename ? baseName(status.filename) : t('home.noJob')}
                </h2>
                {status.currentLayer != null && status.totalLayer != null && (
                  <span className="muted small">
                    {t('home.layer', { current: status.currentLayer, total: status.totalLayer })}
                  </span>
                )}
              </div>
              {status.filename && <ProgressRing value={status.progress} />}
            </div>
            {active && (
              <>
                <div className="stats four">
                  <div>
                    <span className="muted small">{t('home.elapsed')}</span>
                    <strong>{formatDuration(status.printDuration)}</strong>
                  </div>
                  <div>
                    <span className="muted small">{t('home.remaining')}</span>
                    <strong>{formatDuration(eta.remaining)}</strong>
                  </div>
                  <div>
                    <span className="muted small">{t('home.finish')}</span>
                    <strong>{formatClock(eta.finishAt, settings.lang)}</strong>
                  </div>
                  <div>
                    <span className="muted small">{t('home.filament')}</span>
                    <strong>{(status.filamentUsed / 1000).toFixed(2)} m</strong>
                  </div>
                </div>
                <p className="eta-note muted small">
                  {eta.method && t('home.etaVia', { method: t(`eta.${eta.method}` as MessageKey) })}
                  {eta.slicerTotal != null &&
                    ` · ${t('home.slicerTotal', { time: formatDuration(eta.slicerTotal) })}`}
                </p>
                <div className="row gap">
                  {status.state === 'printing' ? (
                    <button
                      className="btn grow"
                      onClick={() => {
                        haptic('tap');
                        act(() => printerActions.pause(printer), t('home.pausing'));
                      }}
                    >
                      <Pause size={18} /> {t('home.pause')}
                    </button>
                  ) : (
                    <button
                      className="btn primary grow"
                      onClick={() => {
                        haptic('tap');
                        act(() => printerActions.resume(printer), t('home.resuming'));
                      }}
                    >
                      <Play size={18} /> {t('home.resume')}
                    </button>
                  )}
                  <button
                    className="btn icon"
                    onClick={() => setTune(true)}
                    aria-label={t('home.tune')}
                  >
                    <SlidersHorizontal size={18} />
                  </button>
                  <button className="btn danger-outline grow" onClick={() => setConfirm('cancel')}>
                    <Square size={16} /> {t('home.cancel')}
                  </button>
                </div>
              </>
            )}
          </section>

          <div className="tiles">
            <TempTile
              icon={<Flame size={16} />}
              label={t('home.nozzle')}
              heater={status.extruder}
              onClick={() => setTempSheet('extruder')}
            />
            <TempTile
              icon={<Thermometer size={16} />}
              label={t('home.bed')}
              heater={status.bed}
              onClick={() => setTempSheet('heater_bed')}
            />
            {status.chamber && (
              <TempTile
                icon={<Thermometer size={16} />}
                label={t('home.chamber')}
                heater={status.chamber}
              />
            )}
            <div className="tile">
              <div className="tile-label">
                <Fan size={16} />
                {t('home.fan')}
              </div>
              <div className="tile-value">
                {Math.round(status.fanSpeed * 100)}
                <small>%</small>
              </div>
            </div>
          </div>

          <SpoolCard printer={printer} />

          <div className="row gap wrap">
            {status.light && (
              <button
                className={`btn grow ${status.light.on ? 'primary' : ''}`}
                onClick={() =>
                  act(() => printerActions.setLight(printer, status.light!.pin, !status.light!.on))
                }
              >
                <Lightbulb size={18} /> {t('home.light')}
              </button>
            )}
            {!active && (
              <button className="btn grow" onClick={() => setPreheat(true)}>
                <Flame size={18} /> {t('home.preheat')}
              </button>
            )}
            {!active && (
              <button
                className="btn grow"
                onClick={() => act(() => printerActions.gcode(printer, 'G28'), t('home.homing'))}
              >
                <Home size={18} /> {t('home.home')}
              </button>
            )}
          </div>
        </div>
      </fieldset>

      <Sheet
        open={!!tempSheet}
        onClose={() => setTempSheet(null)}
        title={tempSheet === 'extruder' ? t('home.nozzleTemp') : t('home.bedTemp')}
      >
        <div className="presets">
          {tempSheet &&
            [
              { id: 'off', label: t('home.turnOff'), value: 0 },
              ...settings.presets.map((p) => ({
                id: p.id,
                label: p.name,
                value: tempSheet === 'extruder' ? p.nozzle : p.bed,
              })),
            ].map((p) => (
              <button
                key={p.id}
                className="btn"
                onClick={() => {
                  act(() => printerActions.setTemp(printer, tempSheet, p.value));
                  setTempSheet(null);
                }}
              >
                <strong>{p.label}</strong>
                {p.value > 0 && <span className="muted small">{p.value}°C</span>}
              </button>
            ))}
        </div>
        <form
          className="row gap"
          onSubmit={(e) => {
            e.preventDefault();
            const v = Number(customTemp);
            if (tempSheet && customTemp !== '' && Number.isFinite(v)) {
              act(() => printerActions.setTemp(printer, tempSheet, v));
              setTempSheet(null);
              setCustomTemp('');
            }
          }}
        >
          <input
            className="input grow"
            type="number"
            inputMode="numeric"
            placeholder={t('home.customTemp')}
            value={customTemp}
            onChange={(e) => setCustomTemp(e.target.value)}
          />
          <button className="btn primary" type="submit">
            {t('common.apply')}
          </button>
        </form>
      </Sheet>

      <Sheet open={preheat} onClose={() => setPreheat(false)} title={t('home.preheat')}>
        <div className="presets">
          <button
            className="btn"
            onClick={() => {
              setPreheat(false);
              act(async () => {
                await printerActions.setTemp(printer, 'extruder', 0);
                await printerActions.setTemp(printer, 'heater_bed', 0);
              }, t('home.cooling'));
            }}
          >
            <strong>{t('home.cooldown')}</strong>
            <span className="muted small">0° / 0°</span>
          </button>
          {settings.presets.map((p) => (
            <button
              key={p.id}
              className="btn"
              onClick={() => {
                setPreheat(false);
                act(
                  async () => {
                    await printerActions.setTemp(printer, 'extruder', p.nozzle);
                    await printerActions.setTemp(printer, 'heater_bed', p.bed);
                  },
                  t('home.preheating', { name: p.name }),
                );
              }}
            >
              <strong>{p.name}</strong>
              <span className="muted small">
                {p.nozzle}° / {p.bed}°
              </span>
            </button>
          ))}
        </div>
      </Sheet>

      <TuneSheet open={tune} onClose={() => setTune(false)} printer={printer} status={status} />
      {viewer && <CameraViewer printer={printer} onClose={() => setViewer(false)} />}
      <ConfirmSheet
        open={confirm === 'cancel'}
        title={t('home.cancelTitle')}
        message={t('home.cancelMsg')}
        confirmLabel={t('home.cancelConfirm')}
        danger
        onConfirm={() => {
          haptic('warning');
          act(() => printerActions.cancel(printer), t('home.canceling'));
        }}
        onClose={() => setConfirm(null)}
      />
    </div>
  );
}
