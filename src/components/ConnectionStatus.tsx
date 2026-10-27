import { useEffect, useState } from 'react';
import { CircleAlert, PlugZap, RefreshCw, RotateCcw, WifiOff } from 'lucide-react';
import { printerActions } from '../api/moonraker';
import { useT } from '../i18n';
import type { Printer } from '../store';
import { useConnection, useConnectionSnapshot } from '../usePrinterStatus';
import { PowerCard } from './PowerCard';
import { ConfirmSheet, useAction } from './ui';

/** Short drops shouldn't flash a banner. */
const BANNER_DELAY_MS = 2000;

/** "Reconnecting…" under the header while the printer can't be reached. */
export function ConnectionBanner() {
  const t = useT();
  const conn = useConnection();
  const { state } = useConnectionSnapshot();
  const [, rerender] = useState(0);
  const since = state.kind === 'reconnecting' ? state.since : null;

  useEffect(() => {
    if (since == null) return;
    const wait = since + BANNER_DELAY_MS - Date.now();
    if (wait <= 0) return;
    const timer = setTimeout(() => rerender((n) => n + 1), wait);
    return () => clearTimeout(timer);
  }, [since]);

  if (state.kind !== 'reconnecting' || Date.now() - state.since < BANNER_DELAY_MS) return null;
  return (
    <div className="connection-banner" role="status">
      <WifiOff size={18} />
      <span className="grow">
        <strong>{t('conn.reconnecting')}</strong>
        <small>{t('conn.attempt', { n: state.attempt })}</small>
      </span>
      <button className="btn small" onClick={() => conn?.retryNow()}>
        <RefreshCw size={16} /> {t('conn.retryNow')}
      </button>
    </div>
  );
}

/** Replaces Home and Control while Klipper is starting, shut down, in error or not running. */
export function KlippyStateScreen({ printer }: { printer: Printer }) {
  const t = useT();
  const run = useAction();
  const conn = useConnection();
  const { state } = useConnectionSnapshot();
  const [confirm, setConfirm] = useState<'firmware' | 'klipper' | null>(null);
  if (state.kind !== 'klippy') return null;

  if (state.klippyState === 'startup') {
    return (
      <div className="screen center">
        <div className="empty">
          <div className="loader" />
          <h2>{t('klippy.startup')}</h2>
          <p className="muted">{t('klippy.startupHint')}</p>
        </div>
      </div>
    );
  }

  const disconnected = state.klippyState === 'disconnected';
  const restart = async (kind: 'firmware' | 'klipper') => {
    const ok = await run(
      () =>
        kind === 'firmware'
          ? printerActions.firmwareRestart(printer)
          : printerActions.restartKlipper(printer),
      t('klippy.restarting'),
    );
    if (ok) conn?.retryNow();
  };

  return (
    <div className="screen center">
      <div className="empty klippy-state">
        {disconnected ? <PlugZap size={40} /> : <CircleAlert size={40} />}
        <h2>
          {disconnected
            ? t('klippy.disconnected')
            : state.klippyState === 'shutdown'
              ? t('klippy.shutdown')
              : t('klippy.error')}
        </h2>
        <p className="muted">{disconnected ? t('klippy.disconnectedHint') : t('klippy.hint')}</p>
        {state.message && <pre className="klippy-message">{state.message}</pre>}
        {/* A printer whose plug is off shows up as "Klipper disconnected": switch it on here. */}
        <PowerCard printer={printer} printing={false} />
        <div className="row gap wrap center-row">
          {!disconnected && (
            <button className="btn primary" onClick={() => setConfirm('firmware')}>
              <RotateCcw size={18} /> {t('home.firmwareRestart')}
            </button>
          )}
          <button
            className={`btn ${disconnected ? 'primary' : ''}`}
            onClick={() => setConfirm('klipper')}
          >
            <RefreshCw size={18} /> {t('klippy.restartKlipper')}
          </button>
        </div>
      </div>
      <ConfirmSheet
        open={confirm != null}
        title={confirm === 'firmware' ? t('home.firmwareRestart') : t('klippy.restartKlipper')}
        message={t('klippy.confirmHint')}
        confirmLabel={t('klippy.restart')}
        onConfirm={() => confirm && restart(confirm)}
        onClose={() => setConfirm(null)}
      />
    </div>
  );
}
