import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { StatusBar } from '@capacitor/status-bar';
import { ChevronLeft, ChevronRight, Info, RefreshCw, X, ZoomOut } from 'lucide-react';
import type { GcodeFile } from '../api/moonraker';
import { useBackHandler } from '../backStack';
import { baseName, formatBytes } from '../format';
import { PLATE, TOOL_FALLBACK, visibleOnPlate } from '../gcode/colors';
import { KIND_COLORS, KINDS } from '../gcode/kinds';
import { layerAtOffset, layerBytes } from '../gcode/model';
import {
  drawBed,
  drawLayer,
  drawLayerLive,
  drawNozzle,
  drawTravel,
  fitView,
  zoomedView,
  type ColorBy,
  type Frame,
} from '../gcode/render';
import { useGcodeModel, WARN_BYTES } from '../gcode/useGcodeModel';
import { useT, type MessageKey } from '../i18n';
import { isNative } from '../native';
import type { Printer } from '../store';
import { usePanZoom } from '../usePanZoom';
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
 * the download and parse figures. Pinch or double tap to zoom: the canvas is redrawn at the new
 * scale, so lines stay sharp.
 *
 * `live` follows the print in progress (D8): the layer being printed, what's done in full color
 * and what's left faint, the nozzle, and excluded parts crossed out.
 */
export function GcodeViewer({
  printer,
  file,
  live = false,
  onClose,
}: {
  printer: Printer;
  file: GcodeFile;
  live?: boolean;
  onClose: () => void;
}) {
  const t = useT();
  const { status } = usePrinterStatus();
  // While printing, Klipper may read the file well ahead; no confirmation for the live view.
  const [confirmed, setConfirmed] = useState(live || file.size <= WARN_BYTES);
  const filePosition = live ? (status?.filePosition ?? null) : null;
  const model = useGcodeModel(printer, confirmed ? file : null, { liveOffset: filePosition });
  const [layer, setLayer] = useState(0);
  /** Live view: the layer follows the print until the user picks another. */
  const [following, setFollowing] = useState(live);
  const pick = (n: number) => {
    setFollowing(false);
    setLayer(n);
  };
  const [info, setInfo] = useState(false);
  const [showTravel, setShowTravel] = useState(false);
  const [showPrev, setShowPrev] = useState(true);
  const [colorBy, setColorBy] = useState<ColorBy>('kind');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Up to 20× (a 0.4 mm line is several pixels wide), double tap 3×.
  const pz = usePanZoom({ maxScale: 20, doubleTapScale: 3 });
  const boxRef = pz.ref;
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
  const printingLayer = filePosition != null ? layerAtOffset(layers, filePosition) : -1;
  const current =
    following && printingLayer >= 0
      ? printingLayer
      : Math.min(layer, Math.max(0, layers.length - 1));
  // Excluded parts, as polyObject values (object index + 1).
  const objectNames = model.summary?.objects ?? [];
  const excludedNames = live ? (status?.excludedObjects ?? []).map((n) => n.toUpperCase()) : [];
  const excluded = new Set(
    excludedNames.map((n) => objectNames.indexOf(n) + 1).filter((i) => i > 0),
  );
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

  // Multicolor prints (more than one tool) can be colored by filament.
  const tools = model.summary?.tools ?? [];
  const multiTool = tools.length > 1;
  const by: ColorBy = multiTool ? colorBy : 'kind';
  const toolColors = Array.from({ length: Math.max(...tools, 0) + 1 }, (_, i) =>
    visibleOnPlate(model.summary?.toolColors[i] ?? TOOL_FALLBACK[i % TOOL_FALLBACK.length]),
  );

  // The canvas buffer only changes with the size; drawing happens on every change below.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !size.w || !size.h) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(size.w * dpr);
    canvas.height = Math.round(size.h * dpr);
  }, [size]);

  // A layer is a few thousand points drawn from cached paths: well under a frame's time, so it
  // is redrawn on every change, including each step of a pinch.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !size.w || !size.h) return;
    const dpr = window.devicePixelRatio || 1;
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const view = zoomedView(fitView(frame, size.w, size.h), pz.view, size.w, size.h);
    drawBed(ctx, frame, view, dpr, { plate: PLATE, grid: 'rgba(255,255,255,0.06)' });
    if (showPrev && current > 0 && layers[current - 1])
      drawLayer(ctx, layers[current - 1], view, dpr, {
        colors: KIND_COLORS,
        color: '#ffffff',
        alpha: 0.12,
      });
    const l = layers[current];
    if (!l) return;
    const colors = by === 'tool' ? toolColors : KIND_COLORS;
    if (live) drawLayerLive(ctx, l, view, dpr, { colors, by, doneOffset: filePosition, excluded });
    else drawLayer(ctx, l, view, dpr, { colors, by });
    if (showTravel) drawTravel(ctx, l, view, dpr, 'rgba(255,255,255,0.45)');
    if (live && current === printingLayer && status)
      drawNozzle(ctx, view, dpr, status.position[0], status.position[1], '#ff7043');
  }, [
    layers,
    current,
    size,
    pz.view,
    showPrev,
    showTravel,
    by,
    toolColors.join(),
    live,
    filePosition,
    printingLayer,
    status?.position[0],
    status?.position[1],
    [...excluded].join(),
    frame.minX,
    frame.minY,
    frame.maxX,
    frame.maxY,
  ]);

  // Arrow keys change the layer (keyboard, or a phone with one).
  const last = layers.length - 1;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp') pick(Math.min(last, current + 1));
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') pick(Math.max(0, current - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [last, current]);

  const l = layers[current];
  // Until the whole file is read, the header's count ("; total layer number").
  const total =
    model.status === 'ready'
      ? layers.length
      : (model.layersHint ?? model.summary?.layersHint ?? layers.length);
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

      <div className="gcode-canvas" ref={boxRef} {...pz.handlers}>
        <canvas ref={canvasRef} style={{ width: size.w, height: size.h }} />
        {pz.view.scale > 1.01 && (
          <button className="zoom-chip" onClick={pz.reset} aria-label={t('camera.resetZoom')}>
            <ZoomOut size={16} /> {pz.view.scale.toFixed(1)}×
          </button>
        )}
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
            onClick={() => pick(current - 1)}
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
            onChange={(e) => pick(Number(e.target.value))}
            aria-label={t('gcode.layer')}
            aria-valuetext={
              l ? t('gcode.layerOf', { n: current + 1, total, z: l.z.toFixed(2) }) : undefined
            }
          />
          <button
            className="viewer-btn"
            disabled={current >= layers.length - 1}
            onClick={() => pick(current + 1)}
            aria-label={t('gcode.next')}
          >
            <ChevronRight size={22} />
          </button>
        </div>
        <div className="gcode-layer-text" aria-live="polite">
          {!l
            ? '…'
            : model.partial
              ? t('gcode.layerZ', { z: l.z.toFixed(2) })
              : t('gcode.layerOf', { n: current + 1, total, z: l.z.toFixed(2) })}
          {live && current === printingLayer && ` · ${t('gcode.printingNow')}`}
        </div>
        {live && !following && printingLayer >= 0 && (
          <button className="btn small gcode-follow" onClick={() => setFollowing(true)}>
            {t('gcode.backToCurrent')}
          </button>
        )}
        <div className="gcode-options" role="group" aria-label={t('gcode.options')}>
          <button
            className={`chip ${showPrev ? 'on' : ''}`}
            aria-pressed={showPrev}
            onClick={() => setShowPrev(!showPrev)}
          >
            {t('gcode.showPrev')}
          </button>
          <button
            className={`chip ${showTravel ? 'on' : ''}`}
            aria-pressed={showTravel}
            onClick={() => setShowTravel(!showTravel)}
          >
            {t('gcode.showTravel')}
          </button>
          {multiTool && (
            <button
              className={`chip ${by === 'tool' ? 'on' : ''}`}
              aria-pressed={by === 'tool'}
              onClick={() => setColorBy(by === 'tool' ? 'kind' : 'tool')}
            >
              {t('gcode.byFilament')}
            </button>
          )}
        </div>
        <div className="gcode-legend">
          {by === 'tool'
            ? tools.map((tool) => (
                <span key={tool}>
                  <i style={{ background: toolColors[tool] }} />
                  {t('gcode.tool', { n: tool + 1 })}
                </span>
              ))
            : KINDS.map((k, i) =>
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
        {st.fromCache && st.downloadMs != null && (
          <p className="muted small">{t('gcode.firstLoadNote')}</p>
        )}
        <button
          className="btn"
          disabled={model.status === 'loading'}
          onClick={() => {
            setInfo(false);
            model.reload();
          }}
        >
          <RefreshCw size={18} /> {t('gcode.reload')}
        </button>
      </Sheet>
    </div>,
    document.body,
  );
}
