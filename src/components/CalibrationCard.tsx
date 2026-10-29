import { useEffect, useRef, useState } from 'react';
import { Activity, Check, ChevronRight, Flame, MoveVertical, Thermometer } from 'lucide-react';
import { gcodeStore, post, queryObjects } from '../api/moonraker';
import {
  lastError,
  parsePid,
  parseShaper,
  parseZOffset,
  type PidResult,
  type ShaperResult,
} from '../calibration';
import { useT, type MessageKey } from '../i18n';
import { useSettings, type Printer } from '../store';
import { useConnectionEvent, useConnectionSnapshot } from '../usePrinterStatus';
import { Sheet, useAction } from './ui';

type Kind = 'pidNozzle' | 'pidBed' | 'zOffset' | 'shaper';
type Step = 'intro' | 'running' | 'adjust' | 'result' | 'error';
type Result =
  | { kind: 'pid'; pid: PidResult }
  | { kind: 'shaper'; shapers: ShaperResult[] }
  | { kind: 'z'; key: string; value: number };

/** Long calibrations (PID, input shaper) can take several minutes. */
const LONG_TIMEOUT = 20 * 60 * 1000;
const Z_STEPS = [-1, -0.1, -0.025, 0.025, 0.1, 1];

function gcode(p: Printer, script: string) {
  return post(p, `/printer/gcode/script?script=${encodeURIComponent(script)}`, LONG_TIMEOUT);
}

/** Responses printed since `since` (s), read back from Moonraker after a command finishes. */
async function responsesSince(p: Printer, since: number) {
  const lines = await gcodeStore(p, 200);
  return lines.filter((l) => l.type === 'response' && l.time >= since - 1).map((l) => l.message);
}

interface ManualProbe {
  is_active?: boolean;
  z_position?: number | null;
  z_position_lower?: number | null;
  z_position_upper?: number | null;
}

function CalibrationWizard({
  printer,
  kind,
  onClose,
}: {
  printer: Printer;
  kind: Kind;
  onClose: () => void;
}) {
  const t = useT();
  const run = useAction();
  const { settings } = useSettings();
  const { names } = useConnectionSnapshot();
  const isPid = kind === 'pidNozzle' || kind === 'pidBed';
  const preset = settings.presets[0];
  const [temp, setTemp] = useState(
    String(kind === 'pidBed' ? (preset?.bed ?? 60) : (preset?.nozzle ?? 210)),
  );
  const [step, setStep] = useState<Step>('intro');
  const [log, setLog] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const [probe, setProbe] = useState<ManualProbe | null>(null);
  const [busy, setBusy] = useState(false);
  // Closing hides the sheet first and unmounts after its exit animation.
  const [shown, setShown] = useState(true);
  const stepRef = useRef(step);
  stepRef.current = step;

  // Live log while a command runs (in polling mode it's read back at the end instead).
  useConnectionEvent('notify_gcode_response', ([message]) => {
    if (stepRef.current === 'running' || stepRef.current === 'adjust')
      setLog((l) => [...l.slice(-5), String(message)]);
  });

  const fail = (message: string) => {
    setError(message);
    setStep('error');
  };

  const readProbe = async () => {
    const status = (await queryObjects(printer, {
      manual_probe: ['is_active', 'z_position', 'z_position_lower', 'z_position_upper'],
    })) as Record<string, ManualProbe>;
    setProbe(status.manual_probe ?? null);
    return status.manual_probe;
  };

  const start = async () => {
    const since = Date.now() / 1000;
    setLog([]);
    setStep('running');
    try {
      if (isPid) {
        const heater = kind === 'pidBed' ? 'heater_bed' : 'extruder';
        await gcode(printer, `PID_CALIBRATE HEATER=${heater} TARGET=${Number(temp)}`);
        const pid = parsePid(await responsesSince(printer, since));
        if (!pid) return fail(t('calib.noResult'));
        setResult({ kind: 'pid', pid });
        setStep('result');
      } else if (kind === 'shaper') {
        await gcode(printer, 'G28\nSHAPER_CALIBRATE');
        const shapers = parseShaper(await responsesSince(printer, since));
        if (!shapers.length) return fail(t('calib.noResult'));
        setResult({ kind: 'shaper', shapers });
        setStep('result');
      } else {
        await gcode(printer, `G28\n${names?.probe ? 'PROBE_CALIBRATE' : 'Z_ENDSTOP_CALIBRATE'}`);
        const mp = await readProbe();
        if (!mp?.is_active) {
          const lines = await responsesSince(printer, since);
          return fail(lastError(lines) ?? t('calib.noResult'));
        }
        setStep('adjust');
      }
    } catch (e) {
      fail((e as Error).message);
    }
  };

  const testZ = async (delta: number) => {
    setBusy(true);
    await run(() => gcode(printer, `TESTZ Z=${delta}`));
    await readProbe().catch(() => {});
    setBusy(false);
  };

  const accept = async () => {
    const since = Date.now() / 1000;
    setBusy(true);
    try {
      await gcode(printer, 'ACCEPT');
      const z = parseZOffset(await responsesSince(printer, since));
      if (!z) return fail(t('calib.noResult'));
      setResult({ kind: 'z', ...z });
      setStep('result');
    } catch (e) {
      fail((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // Leaving the paper test without accepting must not leave Klipper waiting for TESTZ.
  const close = () => {
    if (stepRef.current === 'adjust') gcode(printer, 'ABORT').catch(() => {});
    stepRef.current = 'intro';
    setShown(false);
    setTimeout(onClose, 300);
  };

  const save = async () => {
    const ok = await run(() => gcode(printer, 'SAVE_CONFIG'), t('calib.saved'));
    if (ok) close();
  };
  useEffect(
    () => () => {
      if (stepRef.current === 'adjust') gcode(printer, 'ABORT').catch(() => {});
    },
    [],
  );

  const tempOk = Number(temp) > 30 && Number(temp) <= (kind === 'pidBed' ? 120 : 300);

  return (
    <Sheet
      open={shown}
      onClose={step === 'running' ? () => {} : close}
      title={t(`calib.${kind}` as MessageKey)}
    >
      {step === 'intro' && (
        <>
          <p className="muted">{t(`calib.${kind}Intro` as MessageKey)}</p>
          <ul className="calib-warnings small">
            <li>
              {t(
                isPid ? 'calib.warnHeat' : kind === 'shaper' ? 'calib.warnShake' : 'calib.warnMove',
              )}
            </li>
            <li>{t('calib.warnStay')}</li>
            <li>{t('calib.warnSave')}</li>
          </ul>
          {isPid && (
            <label className="field">
              <span>{t('calib.target')}</span>
              <input
                className="input"
                type="number"
                inputMode="numeric"
                value={temp}
                onChange={(e) => setTemp(e.target.value)}
              />
            </label>
          )}
          <div className="row gap">
            <button className="btn grow" onClick={close}>
              {t('common.cancel')}
            </button>
            <button className="btn primary grow" disabled={isPid && !tempOk} onClick={start}>
              {t('calib.start')}
            </button>
          </div>
        </>
      )}

      {step === 'running' && (
        <div className="calib-running">
          <div className="loader" />
          <p>
            {t(
              isPid
                ? 'calib.runningPid'
                : kind === 'shaper'
                  ? 'calib.runningShaper'
                  : 'calib.runningZ',
            )}
          </p>
          {log.length > 0 && <pre className="calib-log mono">{log.join('\n')}</pre>}
        </div>
      )}

      {step === 'adjust' && (
        <>
          <p className="muted">{t('calib.paper')}</p>
          <div className="calib-z">
            <small className="muted">Z</small>
            <strong>{probe?.z_position != null ? probe.z_position.toFixed(3) : '—'}</strong>
          </div>
          <div className="calib-z-steps">
            {Z_STEPS.map((d) => (
              <button key={d} className="btn" disabled={busy} onClick={() => testZ(d)}>
                {d > 0 ? `+${d}` : d}
              </button>
            ))}
          </div>
          <small className="muted center">{t('calib.zHint')}</small>
          <div className="row gap">
            <button className="btn grow" onClick={close} disabled={busy}>
              {t('common.cancel')}
            </button>
            <button className="btn primary grow" onClick={accept} disabled={busy}>
              <Check size={18} /> {t('calib.accept')}
            </button>
          </div>
        </>
      )}

      {step === 'result' && result && (
        <>
          <p className="muted">{t('calib.resultText')}</p>
          <div className="details">
            {result.kind === 'pid' &&
              (['kp', 'ki', 'kd'] as const).map((k) => (
                <div key={k} className="estimate-row">
                  <span className="muted">{k === 'kp' ? 'Kp' : k === 'ki' ? 'Ki' : 'Kd'}</span>
                  <span>{result.pid[k].toFixed(3)}</span>
                </div>
              ))}
            {result.kind === 'shaper' &&
              result.shapers.map((s) => (
                <div key={s.axis} className="estimate-row">
                  <span className="muted">{s.axis.toUpperCase()}</span>
                  <span>
                    {s.type} · {s.freq} Hz
                  </span>
                </div>
              ))}
            {result.kind === 'z' && (
              <div className="estimate-row">
                <span className="muted">{result.key}</span>
                <span>{result.value.toFixed(3)} mm</span>
              </div>
            )}
          </div>
          <div className="row gap">
            <button className="btn grow" onClick={close}>
              {t('calib.dontSave')}
            </button>
            <button className="btn primary grow" onClick={save}>
              {t('calib.save')}
            </button>
          </div>
        </>
      )}

      {step === 'error' && (
        <>
          <p className="danger-text">{error}</p>
          <div className="row gap">
            <button className="btn grow" onClick={close}>
              {t('common.close')}
            </button>
            <button className="btn primary grow" onClick={() => setStep('intro')}>
              {t('common.retry')}
            </button>
          </div>
        </>
      )}
    </Sheet>
  );
}

/** Guided calibrations in Control, each with its own confirmation and SAVE_CONFIG at the end. */
export function CalibrationCard({ printer, printing }: { printer: Printer; printing: boolean }) {
  const t = useT();
  const { names } = useConnectionSnapshot();
  const [open, setOpen] = useState<Kind | null>(null);
  const items: { kind: Kind; icon: typeof Flame }[] = [
    { kind: 'pidNozzle', icon: Flame },
    { kind: 'pidBed', icon: Thermometer },
    { kind: 'zOffset', icon: MoveVertical },
    ...(names?.shaper ? [{ kind: 'shaper' as const, icon: Activity }] : []),
  ];
  return (
    <section className="card">
      <h2 className="card-title">{t('calib.title')}</h2>
      {printing && <p className="muted small">{t('calib.printing')}</p>}
      <div className="select-options">
        {items.map(({ kind, icon: Icon }) => (
          <button
            key={kind}
            className="select-option"
            disabled={printing}
            onClick={() => setOpen(kind)}
          >
            <Icon size={20} />
            <span className="grow">
              <strong>{t(`calib.${kind}` as MessageKey)}</strong>
              <small className="muted">{t(`calib.${kind}Short` as MessageKey)}</small>
            </span>
            <ChevronRight size={18} />
          </button>
        ))}
      </div>
      {open && <CalibrationWizard printer={printer} kind={open} onClose={() => setOpen(null)} />}
    </section>
  );
}
