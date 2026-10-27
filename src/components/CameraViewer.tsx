import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { StatusBar } from '@capacitor/status-bar';
import { Camera, RefreshCw, Thermometer, X, ZoomOut } from 'lucide-react';
import { useBackHandler } from '../backStack';
import { useT, type MessageKey } from '../i18n';
import { isNative, shareImage } from '../native';
import { useStore, type CameraMode, type Printer } from '../store';
import { usePrinterStatus } from '../usePrinterStatus';
import { CameraView, type CameraHandle } from './CameraView';
import { Select, useAction } from './ui';
import { ZoomPan } from './ZoomPan';

const MODES: { id: CameraMode; label: string }[] = [
  { id: 'auto', label: 'Auto' },
  { id: 'webrtc', label: 'WebRTC' },
  { id: 'mjpeg', label: 'MJPEG' },
  { id: 'snapshot', label: 'Snapshot' },
];

/**
 * Full-screen camera: pinch / double-tap zoom, capture and share, camera mode and reconnect,
 * with the print status on top. Rotate the phone for landscape.
 */
export function CameraViewer({ printer, onClose }: { printer: Printer; onClose: () => void }) {
  const t = useT();
  const run = useAction();
  const { status } = usePrinterStatus();
  const { savePrinter } = useStore();
  const camera = useRef<CameraHandle>(null);
  const [retry, setRetry] = useState(0);
  const [capturing, setCapturing] = useState(false);
  useBackHandler(true, onClose);

  // Hide the Android status bar while the camera fills the screen.
  useEffect(() => {
    if (!isNative) return;
    StatusBar.hide().catch(() => {});
    return () => {
      StatusBar.show().catch(() => {});
    };
  }, []);

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

  return createPortal(
    <div className="camera-viewer" role="dialog" aria-modal="true" aria-label={t('tab.camera')}>
      <ZoomPan
        overlay={(scale, reset) =>
          scale > 1.01 && (
            <button className="zoom-chip" onClick={reset} aria-label={t('camera.resetZoom')}>
              <ZoomOut size={16} /> {scale.toFixed(1)}×
            </button>
          )
        }
      >
        <CameraView printer={printer} retryKey={retry} ref={camera} className="camera-fill" />
      </ZoomPan>

      <div className="viewer-top">
        <button className="viewer-btn" onClick={onClose} aria-label={t('common.close')}>
          <X size={22} />
        </button>
        <span className="grow" />
        <button
          className="viewer-btn"
          onClick={() => setRetry((n) => n + 1)}
          aria-label={t('camera.reconnect')}
        >
          <RefreshCw size={20} />
        </button>
        <button
          className="viewer-btn"
          onClick={capture}
          disabled={capturing}
          aria-label={t('camera.capture')}
        >
          {capturing ? <div className="loader small" /> : <Camera size={20} />}
        </button>
      </div>

      <div className="viewer-bottom">
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
        <div className="viewer-mode">
          <Select
            title={t('camera.mode')}
            value={printer.cameraMode}
            onChange={(cameraMode) => savePrinter({ ...printer, cameraMode })}
            options={MODES.map((m) => ({ value: m.id, label: m.label }))}
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}
