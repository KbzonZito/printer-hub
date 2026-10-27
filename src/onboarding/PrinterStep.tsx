import { useEffect, useRef, useState } from 'react';
import {
  Camera,
  Check,
  CircleAlert,
  Keyboard,
  Monitor,
  Printer as PrinterIcon,
  Radar,
  RefreshCw,
  Wifi,
} from 'lucide-react';
import { fetchVersions, listWebcams, testConnection } from '../api/moonraker';
import { localSubnet, scanNetwork, type Found } from '../discovery';
import { useT } from '../i18n';
import { newPrinter, useStore, type Printer } from '../store';
import type { StepProps } from './Wizard';

type View = 'choose' | 'scan' | 'manual' | 'confirm';

const cleanHost = (host: string) =>
  host
    .trim()
    .replace(/^https?:\/\//, '')
    .replace(/[/:].*$/, '');

/** Scans for printers or takes an IP, checks the connection and saves the printer. */
export function PrinterStep({ next, onBack, onSkip }: StepProps & { onSkip?: () => void }) {
  const t = useT();
  const { savePrinter, selectPrinter } = useStore();
  const [view, setView] = useState<View>('choose');
  const [host, setHost] = useState('');
  const [port, setPort] = useState(7125);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Printer | null>(null);
  const [details, setDetails] = useState<{ server: string; camera: string | null } | null>(null);

  useEffect(() => setError(null), [view]);

  // "Back" from scanning, typing the IP or the result returns to the two options first.
  useEffect(() => {
    onBack(() => {
      if (view === 'choose') return false;
      setView('choose');
      return true;
    });
    return () => onBack(null);
  }, [view]);

  const connect = async (h: string, p: number) => {
    const target = { ...newPrinter(), host: cleanHost(h), port: p };
    if (!target.host) return;
    setConnecting(true);
    setError(null);
    try {
      const server = await testConnection(target);
      const [versions, webcams] = await Promise.all([
        fetchVersions(target).catch(() => null),
        listWebcams(target).catch(() => []),
      ]);
      setDraft({ ...target, name: versions?.hostname || t('wizard.printer.defaultName') });
      setDetails({ server, camera: webcams[0]?.name ?? null });
      setView('confirm');
    } catch {
      setError(t('wizard.printer.failed', { host: target.host }));
    } finally {
      setConnecting(false);
    }
  };

  const save = () => {
    if (!draft) return;
    savePrinter(draft);
    selectPrinter(draft.id);
    next();
  };

  return (
    <div className="wizard-page">
      {view === 'choose' && (
        <>
          <div className="wizard-icon">
            <PrinterIcon size={32} />
          </div>
          <h2>{t('wizard.printer.title')}</h2>
          <p className="muted">{t('wizard.printer.text')}</p>
          <button className="choice" onClick={() => setView('scan')}>
            <Radar size={24} />
            <span className="grow">
              <strong>{t('wizard.printer.scan')}</strong>
              <small className="muted">{t('wizard.printer.scanHint')}</small>
            </span>
          </button>
          <button className="choice" onClick={() => setView('manual')}>
            <Keyboard size={24} />
            <span className="grow">
              <strong>{t('wizard.printer.manual')}</strong>
              <small className="muted">{t('wizard.printer.manualHint')}</small>
            </span>
          </button>
          {onSkip && (
            <button className="btn ghost" onClick={onSkip}>
              {t('wizard.printer.skip')}
            </button>
          )}
        </>
      )}

      {view === 'scan' && (
        <ScanView
          connecting={connecting ? host : null}
          onPick={(f) => {
            setHost(f.host);
            setPort(7125);
            connect(f.host, 7125);
          }}
          onManual={() => setView('manual')}
        />
      )}

      {view === 'manual' && (
        <form
          className="form"
          onSubmit={(e) => {
            e.preventDefault();
            connect(host, port);
          }}
        >
          <h2>{t('wizard.printer.manual')}</h2>
          <div className="help-card">
            <Monitor size={22} />
            <div>
              <strong>{t('wizard.printer.whereIp')}</strong>
              <ol>
                <li>{t('wizard.printer.ipStep1')}</li>
                <li>{t('wizard.printer.ipStep2')}</li>
                <li>{t('wizard.printer.ipStep3')}</li>
              </ol>
            </div>
          </div>
          <div className="row gap">
            <label className="grow">
              <span>{t('form.host')}</span>
              <input
                className="input"
                placeholder="192.168.1.50"
                inputMode="decimal"
                autoCapitalize="off"
                autoFocus
                value={host}
                onChange={(e) => setHost(e.target.value)}
              />
            </label>
            <label style={{ width: 96 }}>
              <span>{t('form.port')}</span>
              <input
                className="input"
                type="number"
                value={port}
                onChange={(e) => setPort(Number(e.target.value) || 7125)}
              />
            </label>
          </div>
          <button className="btn primary" type="submit" disabled={!host.trim() || connecting}>
            {connecting ? <div className="loader small" /> : <Wifi size={18} />}
            {connecting ? t('wizard.printer.connecting') : t('wizard.printer.connect')}
          </button>
        </form>
      )}

      {error && (
        <div className="banner error">
          <CircleAlert size={18} /> {error}
        </div>
      )}
      {error && <p className="muted small">{t('wizard.printer.failedHint')}</p>}

      {view === 'confirm' && draft && details && (
        <>
          <div className="wizard-icon ok">
            <Check size={32} />
          </div>
          <h2>{t('wizard.printer.found')}</h2>
          <div className="summary">
            <div className="estimate-row">
              <span className="muted">{t('form.host')}</span>
              <span>
                {draft.host}:{draft.port}
              </span>
            </div>
            <div className="estimate-row">
              <span className="muted">Moonraker</span>
              <span>{details.server.replace(/^Moonraker /, '')}</span>
            </div>
            <div className="estimate-row">
              <span className="muted">
                <Camera size={14} /> {t('form.camera')}
              </span>
              <span>{details.camera ?? t('wizard.printer.cameraAuto')}</span>
            </div>
          </div>
          <label className="field">
            <span>{t('wizard.printer.name')}</span>
            <input
              className="input"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </label>
          <button className="btn primary" onClick={save} disabled={!draft.name.trim()}>
            <Check size={18} /> {t('wizard.printer.save')}
          </button>
          <button className="btn ghost" onClick={() => setView('choose')}>
            {t('wizard.printer.other')}
          </button>
        </>
      )}
    </div>
  );
}

function ScanView({
  connecting,
  onPick,
  onManual,
}: {
  connecting: string | null;
  onPick: (f: Found) => void;
  onManual: () => void;
}) {
  const t = useT();
  const [run, setRun] = useState(0);
  const [pct, setPct] = useState(0);
  const [subnet, setSubnet] = useState('');
  const [found, setFound] = useState<Found[]>([]);
  const cancelled = useRef(false);
  const scanning = pct < 100;

  useEffect(() => {
    cancelled.current = false;
    setPct(0);
    setFound([]);
    (async () => {
      const net = await localSubnet();
      setSubnet(net);
      await scanNetwork(
        net,
        (f) => setFound((x) => [...x, f]),
        (fr) => setPct(Math.round(fr * 100)),
        () => cancelled.current,
      );
      if (!cancelled.current) setPct(100);
    })();
    return () => {
      cancelled.current = true;
    };
  }, [run]);

  return (
    <>
      <h2>{t('wizard.printer.scan')}</h2>
      <div className="scan-progress">
        <div className={`radar ${scanning ? 'spinning' : ''}`}>
          <Radar size={28} />
        </div>
        <div className="grow">
          <strong>
            {scanning
              ? t('discovery.scanning', { pct })
              : t('wizard.printer.scanDone', { n: found.length })}
          </strong>
          {subnet && (
            <small className="muted">
              {subnet}.1 – {subnet}.254
            </small>
          )}
          <div className="bar">
            <span style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>
      <div className="found-list">
        {found.map((f) => (
          <button
            key={f.host}
            className="found"
            disabled={connecting != null}
            onClick={() => onPick(f)}
          >
            <PrinterIcon size={18} />
            <strong>{f.name}</strong>
            {connecting === f.host ? (
              <div className="loader small" />
            ) : (
              <span className="muted small">{f.host}</span>
            )}
          </button>
        ))}
      </div>
      {!scanning && found.length === 0 && (
        <p className="muted small">{t('discovery.none', { subnet })}</p>
      )}
      {!scanning && (
        <button className="btn" onClick={() => setRun((r) => r + 1)}>
          <RefreshCw size={18} /> {t('wizard.printer.rescan')}
        </button>
      )}
      <button className="btn ghost" onClick={onManual}>
        <Keyboard size={18} /> {t('wizard.printer.manual')}
      </button>
    </>
  );
}
