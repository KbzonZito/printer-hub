import { useEffect, useState } from 'react';
import {
  Fan,
  Flame,
  Home,
  Layers,
  Lightbulb,
  Maximize2,
  OctagonX,
  Pause,
  Play,
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
import { ConfirmSheet, Sheet, useAction } from '../components/ui';
import { baseName, formatDuration, stateLabel } from '../format';
import type { Printer } from '../store';
import { usePrinterStatus } from '../usePrinterStatus';

const PRESETS = {
  extruder: [
    { label: 'Apagar', value: 0 },
    { label: 'PLA', value: 210 },
    { label: 'PETG', value: 240 },
    { label: 'ABS', value: 250 },
  ],
  heater_bed: [
    { label: 'Apagar', value: 0 },
    { label: 'PLA', value: 60 },
    { label: 'PETG', value: 75 },
    { label: 'ABS', value: 100 },
  ],
};

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
        <div className="tile-sub">{heating ? `→ ${heater.target.toFixed(0)}°C` : 'Apagado'}</div>
      )}
    </button>
  );
}

export function Dashboard({ printer, onOpenCamera }: { printer: Printer; onOpenCamera: () => void }) {
  const { status, error, refresh } = usePrinterStatus();
  const run = useAction();
  const [meta, setMeta] = useState<{ file: string; data: FileMetadata } | null>(null);
  const [tempSheet, setTempSheet] = useState<'extruder' | 'heater_bed' | null>(null);
  const [customTemp, setCustomTemp] = useState('');
  const [confirm, setConfirm] = useState<'cancel' | 'estop' | null>(null);

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
            <h2>Sin conexión</h2>
            <p className="muted">
              {error}. Revisa la IP de {printer.host} y que el puerto {printer.port} (Moonraker)
              esté accesible.
            </p>
            <button className="btn primary" onClick={refresh}>
              Reintentar
            </button>
          </div>
        ) : (
          <div className="empty">
            <div className="loader" />
            <p className="muted">Conectando con {printer.name}…</p>
          </div>
        )}
      </div>
    );
  }

  const active = status.state === 'printing' || status.state === 'paused';
  const jobMeta = meta?.file === status.filename ? meta.data : undefined;
  const thumb = status.filename ? thumbnailUrl(printer, status.filename, jobMeta) : null;
  const remaining =
    status.progress > 0.01
      ? status.printDuration / status.progress - status.printDuration
      : (jobMeta?.estimated_time ?? 0) - status.printDuration;
  const klippyDown = status.klippyState !== 'ready';

  return (
    <div className="screen">
      {error && <div className="banner warn">Conexión inestable: {error}</div>}
      {klippyDown && (
        <div className="banner error">
          Klipper: {status.klippyState}
          {status.message ? ` — ${status.message}` : ''}
          <button className="btn small" onClick={() => act(() => printerActions.firmwareRestart(printer))}>
            Reiniciar firmware
          </button>
        </div>
      )}

      <div className="card camera-card" onClick={onOpenCamera}>
        <CameraView printer={printer} />
        <span className="camera-expand">
          <Maximize2 size={16} />
        </span>
      </div>

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
            <span className={`pill ${status.state}`}>{stateLabel[status.state] ?? status.state}</span>
            <h2 className="job-name">{status.filename ? baseName(status.filename) : 'Sin trabajo'}</h2>
            {status.currentLayer != null && status.totalLayer != null && (
              <span className="muted small">
                Capa {status.currentLayer} / {status.totalLayer}
              </span>
            )}
          </div>
          {status.filename && <ProgressRing value={status.progress} />}
        </div>
        {active && (
          <div className="stats">
            <div>
              <span className="muted small">Transcurrido</span>
              <strong>{formatDuration(status.printDuration)}</strong>
            </div>
            <div>
              <span className="muted small">Restante</span>
              <strong>{formatDuration(remaining)}</strong>
            </div>
            <div>
              <span className="muted small">Filamento</span>
              <strong>{(status.filamentUsed / 1000).toFixed(2)} m</strong>
            </div>
          </div>
        )}
        {active && (
          <div className="row gap">
            {status.state === 'printing' ? (
              <button className="btn grow" onClick={() => act(() => printerActions.pause(printer), 'Pausando…')}>
                <Pause size={18} /> Pausar
              </button>
            ) : (
              <button
                className="btn primary grow"
                onClick={() => act(() => printerActions.resume(printer), 'Reanudando…')}
              >
                <Play size={18} /> Reanudar
              </button>
            )}
            <button className="btn danger-outline grow" onClick={() => setConfirm('cancel')}>
              <Square size={16} /> Cancelar
            </button>
          </div>
        )}
      </section>

      <div className="tiles">
        <TempTile
          icon={<Flame size={16} />}
          label="Boquilla"
          heater={status.extruder}
          onClick={() => setTempSheet('extruder')}
        />
        <TempTile
          icon={<Thermometer size={16} />}
          label="Cama"
          heater={status.bed}
          onClick={() => setTempSheet('heater_bed')}
        />
        {status.chamber && (
          <TempTile icon={<Thermometer size={16} />} label="Recinto" heater={status.chamber} />
        )}
        <div className="tile">
          <div className="tile-label">
            <Fan size={16} />
            Ventilador
          </div>
          <div className="tile-value">
            {Math.round(status.fanSpeed * 100)}
            <small>%</small>
          </div>
        </div>
      </div>

      <div className="row gap wrap">
        {status.light && (
          <button
            className={`btn grow ${status.light.on ? 'primary' : ''}`}
            onClick={() => act(() => printerActions.setLight(printer, status.light!.pin, !status.light!.on))}
          >
            <Lightbulb size={18} /> Luz
          </button>
        )}
        {!active && (
          <button className="btn grow" onClick={() => act(() => printerActions.gcode(printer, 'G28'), 'Haciendo home…')}>
            <Home size={18} /> Home
          </button>
        )}
        <button className="btn danger grow" onClick={() => setConfirm('estop')}>
          <OctagonX size={18} /> Paro de emergencia
        </button>
      </div>

      <Sheet
        open={!!tempSheet}
        onClose={() => setTempSheet(null)}
        title={tempSheet === 'extruder' ? 'Temperatura de boquilla' : 'Temperatura de cama'}
      >
        <div className="presets">
          {tempSheet &&
            PRESETS[tempSheet].map((p) => (
              <button
                key={p.label}
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
            if (tempSheet && Number.isFinite(v)) {
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
            placeholder="Personalizada °C"
            value={customTemp}
            onChange={(e) => setCustomTemp(e.target.value)}
          />
          <button className="btn primary" type="submit">
            Aplicar
          </button>
        </form>
      </Sheet>

      <ConfirmSheet
        open={confirm === 'cancel'}
        title="¿Cancelar impresión?"
        message="El trabajo actual se detendrá y no se puede reanudar."
        confirmLabel="Cancelar impresión"
        danger
        onConfirm={() => act(() => printerActions.cancel(printer), 'Cancelando…')}
        onClose={() => setConfirm(null)}
      />
      <ConfirmSheet
        open={confirm === 'estop'}
        title="¿Paro de emergencia?"
        message="Detiene Klipper de inmediato. Tendrás que reiniciar el firmware después."
        confirmLabel="Detener ahora"
        danger
        onConfirm={() => act(() => printerActions.emergencyStop(printer), 'Paro de emergencia enviado')}
        onClose={() => setConfirm(null)}
      />
    </div>
  );
}
