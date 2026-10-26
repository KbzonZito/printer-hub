import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { CameraView } from '../components/CameraView';
import type { CameraMode, Printer } from '../store';
import { usePrinterStatus } from '../usePrinterStatus';
import { stateLabel } from '../format';

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
  const { status } = usePrinterStatus();
  const [retry, setRetry] = useState(0);

  return (
    <div className="screen camera-screen">
      <div className="camera-full">
        <CameraView printer={printer} retryKey={retry} />
        {status && (
          <div className="camera-overlay">
            <span className={`pill ${status.state}`}>{stateLabel[status.state]}</span>
            {status.state === 'printing' && <span>{Math.round(status.progress * 100)}%</span>}
            <span>🔥 {status.extruder.temperature.toFixed(0)}°</span>
            <span>▭ {status.bed.temperature.toFixed(0)}°</span>
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
        <button className="btn icon" onClick={() => setRetry((n) => n + 1)} aria-label="Reconectar">
          <RefreshCw size={18} />
        </button>
      </div>
      <p className="muted small">
        Gira el teléfono para verla en horizontal. "Auto" prueba WebRTC de Creality (puerto 8000), las
        cámaras de Moonraker y MJPEG en el puerto 8080.
      </p>
    </div>
  );
}
