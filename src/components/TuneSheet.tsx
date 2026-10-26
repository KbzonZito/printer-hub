import { Minus, Plus } from 'lucide-react';
import { printerActions, type PrinterStatus } from '../api/moonraker';
import { useT } from '../i18n';
import type { Printer } from '../store';
import { usePrinterStatus } from '../usePrinterStatus';
import { Sheet, useAction } from './ui';

function Stepper({
  label,
  value,
  onStep,
  steps,
  onReset,
}: {
  label: string;
  value: string;
  onStep: (delta: number) => void;
  steps: number[];
  onReset?: () => void;
}) {
  return (
    <div className="stepper">
      <div className="stepper-head">
        <span className="muted small">{label}</span>
        <button className="stepper-value" onClick={onReset} disabled={!onReset}>
          {value}
        </button>
      </div>
      <div className="stepper-buttons">
        {[...steps].reverse().map((s) => (
          <button key={-s} className="btn" onClick={() => onStep(-s)}>
            <Minus size={14} />
            {s}
          </button>
        ))}
        {steps.map((s) => (
          <button key={s} className="btn" onClick={() => onStep(s)}>
            <Plus size={14} />
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Live adjustments while printing: speed, flow, Z offset (babystep) and part fan. */
export function TuneSheet({
  open,
  onClose,
  printer,
  status,
}: {
  open: boolean;
  onClose: () => void;
  printer: Printer;
  status: PrinterStatus;
}) {
  const t = useT();
  const run = useAction();
  const { refresh } = usePrinterStatus();
  const act = async (fn: () => Promise<unknown>) => {
    await run(fn);
    refresh();
  };
  const speed = Math.round(status.speedFactor * 100);
  const flow = Math.round(status.extrudeFactor * 100);
  const fan = Math.round(status.fanSpeed * 100);

  return (
    <Sheet open={open} onClose={onClose} title={t('tune.title')}>
      <div className="tune">
        <Stepper
          label={t('tune.speed')}
          value={`${speed}%`}
          steps={[5, 25]}
          onStep={(d) => act(() => printerActions.setSpeedFactor(printer, Math.max(10, speed + d)))}
          onReset={() => act(() => printerActions.setSpeedFactor(printer, 100))}
        />
        <Stepper
          label={t('tune.flow')}
          value={`${flow}%`}
          steps={[1, 5]}
          onStep={(d) => act(() => printerActions.setFlowFactor(printer, Math.max(50, flow + d)))}
          onReset={() => act(() => printerActions.setFlowFactor(printer, 100))}
        />
        <Stepper
          label={t('tune.zOffset')}
          value={`${status.zOffset >= 0 ? '+' : ''}${status.zOffset.toFixed(3)} mm`}
          steps={[0.01, 0.05]}
          onStep={(d) => act(() => printerActions.adjustZOffset(printer, d))}
        />
        <Stepper
          label={t('home.fan')}
          value={`${fan}%`}
          steps={[10, 25]}
          onStep={(d) =>
            act(() => printerActions.setFan(printer, Math.min(100, Math.max(0, fan + d))))
          }
        />
        <p className="muted small">{t('tune.hint')}</p>
      </div>
    </Sheet>
  );
}
