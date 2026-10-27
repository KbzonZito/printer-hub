import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';
import { CameraOff, Loader2 } from 'lucide-react';
import { connectCrealityWebrtc, crealityWebrtcUrl } from '../api/crealityWebrtc';
import { listWebcams, resolveWebcamUrl } from '../api/moonraker';
import { useT } from '../i18n';
import type { CameraMode, Printer } from '../store';

type Source =
  | { kind: 'webrtc'; url: string }
  | { kind: 'mjpeg'; url: string }
  | { kind: 'snapshot'; url: string };

type View =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'webrtc'; stream: MediaStream }
  | { kind: 'mjpeg'; url: string }
  | { kind: 'snapshot'; url: string };

// Remembers which source worked so "auto" doesn't re-probe on every mount.
const workingSource = new Map<string, Source>();

async function candidates(p: Printer, mode: CameraMode): Promise<Source[]> {
  const custom = p.cameraUrl.trim();
  if (mode === 'webrtc') return [{ kind: 'webrtc', url: custom || crealityWebrtcUrl(p.host) }];
  if (mode === 'snapshot')
    return [{ kind: 'snapshot', url: custom || `http://${p.host}:8080/?action=snapshot` }];
  if (mode === 'mjpeg' || custom)
    return [{ kind: 'mjpeg', url: custom || `http://${p.host}:8080/?action=stream` }];

  const list: Source[] = [{ kind: 'webrtc', url: crealityWebrtcUrl(p.host) }];
  try {
    for (const cam of await listWebcams(p)) {
      if (cam.stream_url && !/webrtc/i.test(cam.service))
        list.push({ kind: 'mjpeg', url: resolveWebcamUrl(p, cam.stream_url) });
    }
  } catch {
    /* Moonraker webcam API unavailable */
  }
  list.push({ kind: 'mjpeg', url: `http://${p.host}:8080/?action=stream` });
  return list;
}

function probeImage(url: string, ms = 5000): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    const finish = (ok: boolean) => {
      clearTimeout(timer);
      img.onload = img.onerror = null;
      img.src = '';
      resolve(ok);
    };
    const timer = setTimeout(() => finish(false), ms);
    img.onload = () => finish(true);
    img.onerror = () => finish(false);
    img.src = url;
  });
}

export interface CameraHandle {
  /**
   * The current frame: a JPEG for WebRTC, or the URL of a still frame for MJPEG cameras
   * (their images are cross-origin, so the page can't read the pixels). Null if no picture.
   */
  capture(): Promise<Blob | string | null>;
}

function canvasBlob(source: HTMLVideoElement, w: number, h: number): Promise<Blob | null> {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d')!.drawImage(source, 0, 0, w, h);
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
}

/** mjpg-streamer serves a still frame next to the stream. */
const snapshotOf = (url: string) => url.replace('action=stream', 'action=snapshot');

interface Props {
  printer: Printer;
  mode?: CameraMode;
  className?: string;
  retryKey?: number;
  ref?: Ref<CameraHandle>;
}

export function CameraView({
  printer,
  mode = printer.cameraMode,
  className,
  retryKey,
  ref,
}: Props) {
  const t = useT();
  const [view, setView] = useState<View>({ kind: 'loading' });
  const [tick, setTick] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);

  useImperativeHandle(
    ref,
    () => ({
      async capture() {
        const video = videoRef.current;
        if (view.kind === 'webrtc' && video?.videoWidth) {
          return canvasBlob(video, video.videoWidth, video.videoHeight);
        }
        if (view.kind === 'mjpeg' || view.kind === 'snapshot') return snapshotOf(view.url);
        return null;
      },
    }),
    [view],
  );
  const cacheKey = `${printer.id}:${mode}:${printer.cameraUrl}`;

  useEffect(() => {
    let cancelled = false;
    let pc: RTCPeerConnection | null = null;
    setView({ kind: 'loading' });

    (async () => {
      const cached = workingSource.get(cacheKey);
      const list = cached ? [cached] : await candidates(printer, mode);
      for (const [i, src] of list.entries()) {
        if (cancelled) return;
        const last = i === list.length - 1;
        try {
          if (src.kind === 'webrtc') {
            const conn = await connectCrealityWebrtc(src.url, (stream) => {
              if (!cancelled) setView({ kind: 'webrtc', stream });
            });
            if (cancelled) return conn.close();
            pc = conn;
            conn.onconnectionstatechange = () => {
              if (conn.connectionState === 'failed' && !cancelled) {
                workingSource.delete(cacheKey);
                setView({ kind: 'error' });
              }
            };
          } else if (src.kind === 'mjpeg') {
            // The last candidate is shown even if the probe is inconclusive.
            if (!last && !(await probeImage(src.url))) continue;
            if (!cancelled) setView({ kind: 'mjpeg', url: src.url });
          } else {
            if (!cancelled) setView({ kind: 'snapshot', url: src.url });
          }
          workingSource.set(cacheKey, src);
          return;
        } catch {
          /* try the next source */
        }
      }
      workingSource.delete(cacheKey);
      if (!cancelled) setView({ kind: 'error' });
    })();

    return () => {
      cancelled = true;
      pc?.close();
    };
  }, [cacheKey, printer.host, retryKey]);

  useEffect(() => {
    if (view.kind === 'webrtc' && videoRef.current) videoRef.current.srcObject = view.stream;
  }, [view]);

  useEffect(() => {
    if (view.kind !== 'snapshot') return;
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [view.kind]);

  return (
    <div className={`camera ${className ?? ''}`}>
      {view.kind === 'loading' && (
        <div className="camera-placeholder">
          <Loader2 className="spin" size={28} />
          <span>{t('camera.connecting')}</span>
        </div>
      )}
      {view.kind === 'error' && (
        <div className="camera-placeholder">
          <CameraOff size={28} />
          <span>{t('camera.unavailable')}</span>
        </div>
      )}
      {view.kind === 'webrtc' && <video ref={videoRef} autoPlay playsInline muted />}
      {view.kind === 'mjpeg' && (
        <img src={view.url} alt="" onError={() => setView({ kind: 'error' })} />
      )}
      {view.kind === 'snapshot' && (
        <img src={`${view.url}${view.url.includes('?') ? '&' : '?'}t=${tick}`} alt="" />
      )}
    </div>
  );
}
