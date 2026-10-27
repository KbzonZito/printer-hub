import { useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ChevronsDown,
  ChevronsUp,
  Home,
  Power,
  Send,
  SlidersHorizontal,
} from 'lucide-react';
import { gcodeStore, listMacros, printerActions, type GcodeLine } from '../api/moonraker';
import { TuneSheet } from '../components/TuneSheet';
import { useAction } from '../components/ui';
import { useT } from '../i18n';
import type { Printer } from '../store';
import {
  useConnectionEvent,
  useConnectionSnapshot,
  usePrinterReady,
  usePrinterStatus,
} from '../usePrinterStatus';

const STEPS = [0.1, 1, 10, 50];
const EXTRUDE_LENGTHS = [5, 10, 50];
const MIN_EXTRUDE_TEMP = 170;

function Console({ printer }: { printer: Printer }) {
  const t = useT();
  const run = useAction();
  const [lines, setLines] = useState<GcodeLine[]>([]);
  const [cmd, setCmd] = useState('');
  const logRef = useRef<HTMLDivElement>(null);

  const { mode } = useConnectionSnapshot();
  const polling = mode === 'polling';

  const load = () =>
    gcodeStore(printer, 60)
      .then(setLines)
      .catch(() => {});
  // The last lines once; then responses arrive as notifications (or by polling as a fallback).
  useEffect(() => {
    load();
    if (!polling) return;
    const id = setInterval(load, 2500);
    return () => clearInterval(id);
  }, [printer.id, polling]);
  const add = (line: GcodeLine) => setLines((ls) => [...ls.slice(-199), line]);
  useConnectionEvent('notify_gcode_response', ([message]) =>
    add({ message: String(message), time: Date.now() / 1000, type: 'response' }),
  );

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [lines.length]);

  return (
    <section className="card console">
      <h2 className="card-title">{t('control.console')}</h2>
      <div className="console-log" ref={logRef}>
        {lines.length === 0 && <span className="muted small">{t('control.consoleEmpty')}</span>}
        {lines.map((l, i) => (
          <div key={i} className={`console-line ${l.type}`}>
            {l.type === 'command' ? '> ' : ''}
            {l.message}
          </div>
        ))}
      </div>
      <form
        className="row gap"
        onSubmit={async (e) => {
          e.preventDefault();
          const script = cmd.trim();
          if (!script) return;
          setCmd('');
          add({ message: script, time: Date.now() / 1000, type: 'command' });
          await run(() => printerActions.gcode(printer, script));
          if (polling) load();
        }}
      >
        <input
          className="input grow mono"
          placeholder="G28, M104 S200…"
          autoCapitalize="characters"
          autoCorrect="off"
          value={cmd}
          onChange={(e) => setCmd(e.target.value)}
        />
        <button className="btn icon primary" type="submit" aria-label={t('control.send')}>
          <Send size={18} />
        </button>
      </form>
    </section>
  );
}

export function ControlScreen({ printer }: { printer: Printer }) {
  const t = useT();
  const run = useAction();
  const { status, refresh } = usePrinterStatus();
  const ready = usePrinterReady();
  const [step, setStep] = useState(10);
  const [extrudeLen, setExtrudeLen] = useState(10);
  const [macros, setMacros] = useState<string[]>([]);
  const [tune, setTune] = useState(false);

  useEffect(() => {
    listMacros(printer)
      .then(setMacros)
      .catch(() => {});
  }, [printer.id]);

  const act = async (fn: () => Promise<unknown>, msg?: string) => {
    await run(fn, msg);
    refresh();
  };

  if (!status)
    return (
      <div className="screen center">
        <div className="loader" />
      </div>
    );

  const printing = status.state === 'printing' || status.state === 'paused';
  const homed = (axis: string) => status.homedAxes.includes(axis.toLowerCase());
  const jog = (axis: 'X' | 'Y' | 'Z', dir: number) =>
    act(() => printerActions.jog(printer, axis, dir * step));
  const cold = status.extruder.temperature < MIN_EXTRUDE_TEMP;
  const [px, py, pz] = status.position;

  return (
    <div className="screen wide">
      {/* Nothing moves or heats while the printer can't be reached. */}
      <fieldset className="control-grid" disabled={!ready}>
        <section className="card">
          <div className="card-title-row">
            <h2 className="card-title">{t('control.move')}</h2>
            <span className="muted small mono">
              X{px.toFixed(1)} Y{py.toFixed(1)} Z{pz.toFixed(2)}
            </span>
          </div>
          {printing && <div className="banner warn">{t('control.printingLocked')}</div>}
          {!printing && !homed('xyz') && <div className="banner warn">{t('control.notHomed')}</div>}
          <fieldset className="jog" disabled={printing}>
            <div className="jog-pad">
              <span />
              <button className="btn" onClick={() => jog('Y', 1)} aria-label="Y+">
                <ArrowUp size={20} />
                <small>Y+</small>
              </button>
              <span />
              <button className="btn" onClick={() => jog('X', -1)} aria-label="X-">
                <ArrowLeft size={20} />
                <small>X-</small>
              </button>
              <button
                className="btn primary"
                onClick={() => act(() => printerActions.home(printer), t('home.homing'))}
                aria-label={t('control.homeAll')}
              >
                <Home size={20} />
              </button>
              <button className="btn" onClick={() => jog('X', 1)} aria-label="X+">
                <ArrowRight size={20} />
                <small>X+</small>
              </button>
              <span />
              <button className="btn" onClick={() => jog('Y', -1)} aria-label="Y-">
                <ArrowDown size={20} />
                <small>Y-</small>
              </button>
              <span />
            </div>
            <div className="jog-z">
              <button className="btn" onClick={() => jog('Z', 1)} aria-label="Z+">
                <ChevronsUp size={20} />
                <small>Z+</small>
              </button>
              <button className="btn" onClick={() => jog('Z', -1)} aria-label="Z-">
                <ChevronsDown size={20} />
                <small>Z-</small>
              </button>
            </div>
          </fieldset>
          <div className="segmented">
            {STEPS.map((s) => (
              <button key={s} className={s === step ? 'active' : ''} onClick={() => setStep(s)}>
                {s} mm
              </button>
            ))}
          </div>
          <div className="row gap wrap">
            {['X', 'Y', 'Z'].map((a) => (
              <button
                key={a}
                className={`btn grow ${homed(a) ? '' : 'warn-outline'}`}
                disabled={printing}
                onClick={() => act(() => printerActions.home(printer, a), t('home.homing'))}
              >
                <Home size={16} /> {a}
              </button>
            ))}
            <button
              className="btn grow"
              disabled={printing}
              onClick={() =>
                act(() => printerActions.motorsOff(printer), t('control.motorsOffDone'))
              }
            >
              <Power size={16} /> {t('control.motorsOff')}
            </button>
          </div>
        </section>

        <div className="control-side">
          <section className="card">
            <h2 className="card-title">{t('control.extruder')}</h2>
            {cold && (
              <div className="banner warn">
                {t('control.coldExtruder', { temp: MIN_EXTRUDE_TEMP })}
              </div>
            )}
            <div className="segmented">
              {EXTRUDE_LENGTHS.map((l) => (
                <button
                  key={l}
                  className={l === extrudeLen ? 'active' : ''}
                  onClick={() => setExtrudeLen(l)}
                >
                  {l} mm
                </button>
              ))}
            </div>
            <div className="row gap">
              <button
                className="btn grow"
                disabled={cold || printing}
                onClick={() => act(() => printerActions.extrude(printer, -extrudeLen))}
              >
                <ArrowUp size={16} /> {t('control.retract')}
              </button>
              <button
                className="btn grow primary"
                disabled={cold || printing}
                onClick={() => act(() => printerActions.extrude(printer, extrudeLen))}
              >
                <ArrowDown size={16} /> {t('control.extrude')}
              </button>
            </div>
          </section>

          {printing && (
            <button className="btn" onClick={() => setTune(true)}>
              <SlidersHorizontal size={18} /> {t('tune.title')}
            </button>
          )}

          <section className="card">
            <h2 className="card-title">{t('control.macros')}</h2>
            <div className="chips">
              {!macros.includes('BED_MESH_CALIBRATE') && (
                <button
                  className="chip"
                  disabled={printing}
                  onClick={() =>
                    act(
                      () => printerActions.gcode(printer, 'BED_MESH_CALIBRATE'),
                      t('control.running'),
                    )
                  }
                >
                  BED_MESH_CALIBRATE
                </button>
              )}
              {macros.map((m) => (
                <button
                  key={m}
                  className="chip"
                  onClick={() => act(() => printerActions.gcode(printer, m), t('control.running'))}
                >
                  {m}
                </button>
              ))}
            </div>
          </section>
        </div>
      </fieldset>

      <Console printer={printer} />

      <TuneSheet open={tune} onClose={() => setTune(false)} printer={printer} status={status} />
    </div>
  );
}
