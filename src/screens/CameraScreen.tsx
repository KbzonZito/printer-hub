import { useState } from 'react';
import { RefreshCw, Thermometer } from 'lucide-react';
import { CameraView } from '../components/CameraView';
import { useT, type MessageKey } from '../i18n';
import type { CameraMode, Printer } from '../store';
import { usePrinterStatus } from '../usePrinterStatus';

const MODES: { id: CameraMode; label: string }[] = [
  { id: 'auto', label: 'Auto' },
  { id: 'webrtc', label: 'WebRTC' },
  { id: 'mjpeg', label: 'MJPEG' },
  { id: 'snapshot', label: 'Snapshot' },
];

export function CameraScreen({
  printer,
  onModeChange,
}: {
  printer: Printer;
  onModeChange: (mode: CameraMode) => void;
}) {
  const t = useT();
  const { status } = usePrinterStatus();
  const [retry, setRetry] = useState(0);

  return (
    <div className="screen wide camera-screen">
      <div className="camera-full">
        <CameraView printer={printer} retryKey={retry} />
        {status && (
          <div className="camera-overlay">
            <span className={`pill ${status.state}`}>
              {t(`state.${status.state}` as MessageKey)}
            </span>
            {status.state === 'printing' && <span>{Math.round(status.progress * 100)}%</span>}
            <span className="overlay-temp">
              <Thermometer size={14} /> {t('home.nozzle')} {status.extruder.temperature.toFixed(0)}°
            </span>
            <span className="overlay-temp">
              <Thermometer size={14} /> {t('home.bed')} {status.bed.temperature.toFixed(0)}°
            </span>
          </div>
        )}
      </div>
      <div className="row gap center-v">
        <div className="segmented grow">
          {MODES.map((m) => (
            <button
              key={m.id}
              className={printer.cameraMode === m.id ? 'active' : ''}
              onClick={() => onModeChange(m.id)}
            >
              {m.label}
            </button>
          ))}
        </div>
        <button
          className="btn icon"
          onClick={() => setRetry((n) => n + 1)}
          aria-label={t('camera.reconnect')}
        >
          <RefreshCw size={18} />
        </button>
      </div>
      <p className="muted small">{t('camera.hint')}</p>
    </div>
  );
}
