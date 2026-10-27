import { useRef, useState } from 'react';
import { Camera, RefreshCw, Thermometer, ZoomOut } from 'lucide-react';
import { CameraView, type CameraHandle } from '../components/CameraView';
import { useAction } from '../components/ui';
import { ZoomPan } from '../components/ZoomPan';
import { useT, type MessageKey } from '../i18n';
import { shareImage } from '../native';
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
  const camera = useRef<CameraHandle>(null);
  const run = useAction();
  const [capturing, setCapturing] = useState(false);

  const capture = async () => {
    setCapturing(true);
    await run(async () => {
      const image = await camera.current?.capture();
      if (!image) throw new Error(t('camera.unavailable'));
      const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
      await shareImage(image, `${printer.name.replace(/[^\w-]+/g, '_')}-${stamp}.jpg`);
    });
    setCapturing(false);
  };

  return (
    <div className="screen wide camera-screen">
      <div className="camera-full">
        <ZoomPan
          overlay={(scale, reset) =>
            scale > 1.01 && (
              <button className="zoom-chip" onClick={reset} aria-label={t('camera.resetZoom')}>
                <ZoomOut size={16} /> {scale.toFixed(1)}×
              </button>
            )
          }
        >
          <CameraView printer={printer} retryKey={retry} ref={camera} />
        </ZoomPan>
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
          onClick={capture}
          disabled={capturing}
          aria-label={t('camera.capture')}
        >
          {capturing ? <div className="loader small" /> : <Camera size={18} />}
        </button>
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
