import { useEffect, useState } from 'react';
import { Plug } from 'lucide-react';
import { listPowerDevices, setPower, type PowerDevice } from '../api/power';
import { useT } from '../i18n';
import { useSettings, type Printer } from '../store';
import { useCapabilities, useConnectionEvent } from '../usePrinterStatus';
import { isNative } from '../native';
import { ConfirmSheet, Select, useAction } from './ui';

/** Smart plugs (Moonraker [power] devices): on / off, and power off after a print on Android. */
export function PowerCard({ printer, printing }: { printer: Printer; printing: boolean }) {
  const t = useT();
  const run = useAction();
  const caps = useCapabilities();
  const { settings, updateSettings } = useSettings();
  const [devices, setDevices] = useState<PowerDevice[] | null>(null);
  const [turningOff, setTurningOff] = useState<PowerDevice | null>(null);
  const enabled = caps.has('power');

  const load = () =>
    listPowerDevices(printer)
      .then(setDevices)
      .catch(() => setDevices([]));
  useEffect(() => {
    if (enabled) load();
  }, [enabled, printer.id]);
  useConnectionEvent('notify_power_changed', (params) => {
    const dev = params?.[0] as PowerDevice | undefined;
    if (dev)
      setDevices((ds) => ds?.map((d) => (d.device === dev.device ? { ...d, ...dev } : d)) ?? ds);
  });

  if (!enabled || !devices?.length) return null;

  const toggle = async (d: PowerDevice, on: boolean) => {
    const ok = await run(() => setPower(printer, d.device, on));
    if (ok)
      setDevices((ds) =>
        ds!.map((x) => (x.device === d.device ? { ...x, status: on ? 'on' : 'off' } : x)),
      );
  };

  return (
    <section className="card">
      <h2 className="card-title">{t('power.title')}</h2>
      {devices.map((d) => {
        const locked = printing && d.locked_while_printing;
        return (
          <label key={d.device} className="toggle">
            <Plug size={18} />
            <span className="grow">
              <strong>{d.device}</strong>
              <small className="muted">
                {locked ? t('power.locked') : t(d.status === 'on' ? 'power.isOn' : 'power.isOff')}
              </small>
            </span>
            <input
              type="checkbox"
              role="switch"
              className="switch"
              checked={d.status === 'on'}
              disabled={locked || d.status === 'init'}
              onChange={(e) => (e.target.checked ? toggle(d, true) : setTurningOff(d))}
            />
          </label>
        );
      })}
      {isNative && (
        <div className="field">
          <span>{t('power.autoOff')}</span>
          <Select
            title={t('power.autoOff')}
            value={settings.powerOffDevice}
            onChange={(powerOffDevice) => updateSettings({ powerOffDevice })}
            options={[
              { value: '', label: t('power.autoOffNever') },
              ...devices.map((d) => ({ value: d.device, label: d.device })),
            ]}
          />
          <small className="muted">{t('power.autoOffHint')}</small>
        </div>
      )}
      <ConfirmSheet
        open={!!turningOff}
        title={t('power.offTitle', { name: turningOff?.device ?? '' })}
        message={t('power.offHint')}
        confirmLabel={t('power.off')}
        danger
        onConfirm={() => turningOff && toggle(turningOff, false)}
        onClose={() => setTurningOff(null)}
      />
    </section>
  );
}
