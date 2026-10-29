import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { StatusBar } from '@capacitor/status-bar';
import { ChevronLeft, ChevronRight, Info, X } from 'lucide-react';
import type { GcodeFile } from '../api/moonraker';
import { useBackHandler } from '../backStack';
import { baseName, formatBytes } from '../format';
import { KIND_COLORS, KINDS } from '../gcode/kinds';
import { layerBytes } from '../gcode/model';
import { drawBed, drawLayer, fitView, type Frame } from '../gcode/render';
import { useGcodeModel, WARN_BYTES } from '../gcode/useGcodeModel';
import { useT, type MessageKey } from '../i18n';
import { isNative } from '../native';
import type { Printer } from '../store';
import { usePrinterStatus } from '../usePrinterStatus';
import { Sheet } from './ui';

/** Seconds to download at the Creality Hi's measured speed (plan: "La Creality Hi real"). */
const HI_BYTES_PER_S = 0.9e6;

const fmtSeconds = (ms: number | null) =>
  ms == null ? '—' : ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`;
const speed = (bytes: number, ms: number | null) =>
  ms && ms > 0 ? `${(bytes / 1e6 / (ms / 1000)).toFixed(1)} MB/s` : '—';

/**
 * Full-screen G-code preview: one layer seen from above, a layer slider and an info panel with
 * the download and parse figures. First version (plan step G.5): no zoom yet.
 */
export function GcodeViewer({
  printer,
  file,
  onClose,
}: {
  printer: Printer;
  file: GcodeFile;
  onClose: () => void;
}) {
  const t = useT();
  const { status } = usePrinterStatus();
  const [confirmed, setConfirmed] = useState(file.size <= WARN_BYTES);
  const model = useGcodeModel(printer, confirmed ? file : null);
  const [layer, setLayer] = useState(0);
  const [info, setInfo] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useBackHandler(true, onClose);

  useEffect(() => {
    if (!isNative) return;
    StatusBar.hide().catch(() => {});
    return () => {
      StatusBar.show().catch(() => {});
    };
  }, []);

  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const ro = new ResizeObserver(() => setSize({ w: box.clientWidth, h: box.clientHeight }));
    ro.observe(box);
    return () => ro.disconnect();
  }, []);

  const layers = model.layers;
  const current = Math.min(layer, Math.max(0, layers.length - 1));
  const bounds = model.summary?.bounds;
  const frame: Frame =
    status?.bedMin && status.bedMax
      ? {
          minX: status.bedMin[0],
          minY: status.bedMin[1],
          maxX: status.bedMax[0],
          maxY: status.bedMax[1],
        }
      : bounds
        ? {
            minX: bounds.minX - 10,
            minY: bounds.minY - 10,
            maxX: bounds.maxX + 10,
            maxY: bounds.maxY + 10,
          }
        : { minX: 0, minY: 0, maxX: 260, maxY: 260 };

  // Redraw on every change: a layer is a few thousand points, well under a frame's time.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !size.w || !size.h) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(size.w * dpr);
    canvas.height = Math.round(size.h * dpr);
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const view = fitView(frame, size.w, size.h);
    drawBed(ctx, frame, view, dpr, { plate: '#1b1d21', grid: 'rgba(255,255,255,0.06)' });
    if (current > 0 && layers[current - 1])
      drawLayer(ctx, layers[current - 1], view, dpr, {
        colors: KIND_COLORS,
        color: '#ffffff',
        alpha: 0.12,
      });
    if (layers[current]) drawLayer(ctx, layers[current], view, dpr, { colors: KIND_COLORS });
  }, [layers, current, size, frame.minX, frame.minY, frame.maxX, frame.maxY]);

  const l = layers[current];
  const total = model.summary ? layers.length : (model.layersHint ?? layers.length);
  const loading = model.status === 'loading';
  const pct = model.total ? Math.min(1, model.received / model.total) : 0;
  const modelBytes = layers.reduce((s, x) => s + layerBytes(x), 0);
  const st = model.stats;
  const kindsPresent = model.summary?.kinds ?? 0;

  return createPortal(
    <div className="gcode-viewer" role="dialog" aria-modal="true" aria-label={t('gcode.title')}>
      <div className="viewer-top">
        <button className="viewer-btn" onClick={onClose} aria-label={t('common.close')}>
          <X size={22} />
        </button>
        <span className="grow gcode-title">{baseName(file.path)}</span>
        <button className="viewer-btn" onClick={() => setInfo(true)} aria-label={t('gcode.info')}>
          <Info size={20} />
        </button>
      </div>

      <div className="gcode-canvas" ref={boxRef}>
        <canvas ref={canvasRef} style={{ width: size.w, height: size.h }} />
        {!confirmed && (
          <div className="gcode-overlay">
            <p>
              {t('gcode.bigFile', {
                size: formatBytes(file.size),
                time: Math.ceil(file.size / HI_BYTES_PER_S),
              })}
            </p>
            <button className="btn primary" onClick={() => setConfirmed(true)}>
              {t('gcode.loadAnyway')}
            </button>
          </div>
        )}
        {model.status === 'error' && (
          <div className="gcode-overlay">
            <p>
              {model.error === 'too-big'
                ? t('gcode.tooBig')
                : t('gcode.error', { message: model.error ?? '' })}
            </p>
          </div>
        )}
        {confirmed && model.status !== 'error' && !l && (
          <div className="gcode-overlay">
            <div className="loader" />
          </div>
        )}
      </div>

      <div className="gcode-bottom">
        {loading && confirmed && (
          <div className="gcode-progress">
            <div className="progress-bar">
              <span style={{ width: `${pct * 100}%` }} />
            </div>
            <small>
              {st.fromCache
                ? t('gcode.fromCache')
                : t('gcode.downloading', {
                    done: formatBytes(model.received),
                    total: model.total ? formatBytes(model.total) : '?',
                    layers: layers.length,
                    of: model.layersHint ?? '?',
                  })}
            </small>
          </div>
        )}
        <div className="gcode-layer-row">
          <button
            className="viewer-btn"
            disabled={current <= 0}
            onClick={() => setLayer(current - 1)}
            aria-label={t('gcode.prev')}
          >
            <ChevronLeft size={22} />
          </button>
          <input
            type="range"
            className="gcode-slider"
            min={0}
            max={Math.max(0, layers.length - 1)}
            value={current}
            onChange={(e) => setLayer(Number(e.target.value))}
            aria-label={t('gcode.layer')}
            aria-valuetext={
              l ? t('gcode.layerOf', { n: current + 1, total, z: l.z.toFixed(2) }) : undefined
            }
          />
          <button
            className="viewer-btn"
            disabled={current >= layers.length - 1}
            onClick={() => setLayer(current + 1)}
            aria-label={t('gcode.next')}
          >
            <ChevronRight size={22} />
          </button>
        </div>
        <div className="gcode-layer-text" aria-live="polite">
          {l ? t('gcode.layerOf', { n: current + 1, total, z: l.z.toFixed(2) }) : '…'}
        </div>
        <div className="gcode-legend">
          {KINDS.map((k, i) =>
            kindsPresent & (1 << i) ? (
              <span key={k}>
                <i style={{ background: KIND_COLORS[i] }} />
                {t(`gcode.kind.${k}` as MessageKey)}
              </span>
            ) : null,
          )}
        </div>
      </div>

      <Sheet open={info} onClose={() => setInfo(false)} title={t('gcode.info')}>
        <div className="details">
          {(
            [
              [
                'gcode.infoSource',
                st.fromCache ? t('gcode.fromCacheShort') : t('gcode.downloaded'),
              ],
              ['gcode.infoSize', formatBytes(model.total ?? file.size)],
              ['gcode.infoFirstByte', fmtSeconds(st.firstByteMs)],
              [
                'gcode.infoDownload',
                `${fmtSeconds(st.downloadMs)} · ${speed(st.bytes, st.downloadMs)}`,
              ],
              ['gcode.infoParse', `${fmtSeconds(st.parseMs)} · ${speed(st.bytes, st.parseMs)}`],
              ['gcode.infoChunks', String(st.chunks)],
              ['gcode.infoLayers', String(layers.length)],
              ['gcode.infoPoints', `${((model.summary?.points ?? 0) / 1e6).toFixed(2)} M`],
              ['gcode.infoMemory', formatBytes(modelBytes)],
              ['gcode.infoSlicer', model.summary?.slicer ?? '—'],
            ] as [MessageKey, string][]
          ).map(([k, v]) => (
            <div key={k} className="estimate-row">
              <span className="muted">{t(k)}</span>
              <span>{v}</span>
            </div>
          ))}
        </div>
      </Sheet>
    </div>,
    document.body,
  );
}
