import { useState } from 'react';
import { OctagonX } from 'lucide-react';
import { printerActions } from '../api/moonraker';
import { haptic } from '../haptics';
import { useT } from '../i18n';
import type { Printer } from '../store';
import { usePrinterReady } from '../usePrinterStatus';
import { ConfirmSheet, useAction } from './ui';

/** Always-visible emergency stop in the header, with a confirmation. */
export function EmergencyStop({ printer }: { printer: Printer }) {
  const t = useT();
  const run = useAction();
  const ready = usePrinterReady();
  const [confirm, setConfirm] = useState(false);
  return (
    <>
      <button
        className="estop-button"
        disabled={!ready}
        onClick={() => {
          haptic('tap');
          setConfirm(true);
        }}
        aria-label={t('home.estop')}
        title={t('home.estop')}
      >
        <OctagonX size={24} />
      </button>
      <ConfirmSheet
        open={confirm}
        title={t('home.estopTitle')}
        message={t('home.estopMsg')}
        confirmLabel={t('home.estopConfirm')}
        danger
        onConfirm={() => {
          haptic('error');
          run(() => printerActions.emergencyStop(printer), t('home.estopSent'));
        }}
        onClose={() => setConfirm(false)}
      />
    </>
  );
}
