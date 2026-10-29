import { useEffect, useState } from 'react';
import { Check, Flame, Thermometer, WifiOff } from 'lucide-react';
import { fetchObjectList, queryObjects, type PrinterStatus } from '../api/moonraker';
import { CameraView } from '../components/CameraView';
import {
  namesFromObjects,
  parseStatus,
  subscription,
  type ObjectNames,
} from '../connection/statusModel';
import { formatDuration } from '../format';
import { useT, type MessageKey } from '../i18n';
import { useStore, type Printer } from '../store';

const POLL_MS = 5000;
const names = new Map<string, ObjectNames>();

/** Light status for a printer that isn't the active one: an HTTP query every few seconds. */
function usePrinterSummary(printer: Printer) {
  const [status, setStatus] = useState<PrinterStatus | null>(null);
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        let n = names.get(printer.id);
        if (!n) {
          n = namesFromObjects(await fetchObjectList(printer));
          names.set(printer.id, n);
        }
        const raw = await queryObjects(printer, subscription(n));
        if (!cancelled) {
          setStatus(parseStatus(raw, n));
          setOffline(false);
        }
      } catch {
        if (!cancelled) setOffline(true);
      }
    };
    poll();
    const id = setInterval(() => !document.hidden && poll(), POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [printer.id, printer.host, printer.port]);
  return { status, offline };
}

function PrinterCard({
  printer,
  active,
  onOpen,
}: {
  printer: Printer;
  active: boolean;
  onOpen: () => void;
}) {
  const t = useT();
  const { status, offline } = usePrinterSummary(printer);
  const printing = status?.state === 'printing' || status?.state === 'paused';
  const remaining =
    status && printing && status.progress > 0.01
      ? status.printDuration / status.progress - status.printDuration
      : null;
  const state = offline
    ? t('common.disconnected')
    : status
      ? status.klippyState !== 'ready'
        ? `Klipper: ${status.klippyState}`
        : t(`state.${status.state}` as MessageKey)
      : '…';

  return (
    <button className={`card printer-card ${active ? 'active' : ''}`} onClick={onOpen}>
      <div className="printer-card-camera">
        {offline ? (
          <div className="camera camera-placeholder">
            <WifiOff size={28} />
          </div>
        ) : (
          <CameraView printer={printer} />
        )}
        {printing && status && (
          <span className="printer-card-pct">{Math.round(status.progress * 100)}%</span>
        )}
      </div>
      <div className="printer-card-body">
        <div className="printer-card-head">
          <strong className="grow">{printer.name}</strong>
          {active && <Check size={18} className="accent" aria-label={t('printers.current')} />}
        </div>
        <span className={`pill ${offline ? '' : (status?.state ?? '')}`}>{state}</span>
        {printing && status && (
          <>
            <div className="progress-bar" aria-hidden="true">
              <span style={{ width: `${status.progress * 100}%` }} />
            </div>
            <small className="muted ellipsis">
              {status.filename.replace(/\.(gcode|g|gco)$/i, '')}
              {remaining != null && ` · ${t('printers.left', { time: formatDuration(remaining) })}`}
            </small>
          </>
        )}
        {status && !offline && (
          <small className="muted row-inline">
            <Flame size={14} /> {status.extruder.temperature.toFixed(0)}°
            <Thermometer size={14} /> {status.bed.temperature.toFixed(0)}°
          </small>
        )}
        {!status && !offline && <small className="muted">{printer.host}</small>}
      </div>
    </button>
  );
}

/** Every printer at a glance; tapping one makes it the active printer. */
export function AllPrinters({ onOpen }: { onOpen: () => void }) {
  const { printers, active, selectPrinter } = useStore();
  return (
    <div className="screen wide">
      <div className="printer-grid">
        {printers.map((p) => (
          <PrinterCard
            key={p.id}
            printer={p}
            active={p.id === active?.id}
            onOpen={() => {
              selectPrinter(p.id);
              onOpen();
            }}
          />
        ))}
      </div>
    </div>
  );
}
