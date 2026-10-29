import { useRef, useState, type PointerEvent, type WheelEvent } from 'react';

// Pinch to zoom, drag to move, double tap to zoom in or out (and the mouse wheel in a browser).
// Shared by the camera (ZoomPan, CSS transform) and the G-code viewer (redraws its canvas).

/** Zoom and offset of the content, around the center of the frame (CSS pixels). */
export interface PanZoomView {
  scale: number;
  x: number;
  y: number;
}

export const IDENTITY: PanZoomView = { scale: 1, x: 0, y: 0 };

/** Keeps the zoomed content covering the frame (no empty borders while panning). */
export function clampView(v: PanZoomView, w: number, h: number, maxScale: number): PanZoomView {
  const scale = Math.min(maxScale, Math.max(1, v.scale));
  const maxX = ((scale - 1) * w) / 2;
  const maxY = ((scale - 1) * h) / 2;
  return {
    scale,
    x: Math.min(maxX, Math.max(-maxX, v.x)),
    y: Math.min(maxY, Math.max(-maxY, v.y)),
  };
}

/** The view zoomed by `factor` around a point (relative to the frame's center). */
export function zoomAt(v: PanZoomView, factor: number, cx: number, cy: number): PanZoomView {
  return { scale: v.scale * factor, x: cx - (cx - v.x) * factor, y: cy - (cy - v.y) * factor };
}

const DOUBLE_TAP_MS = 300;

export function usePanZoom({ maxScale = 5, doubleTapScale = 2.5 } = {}) {
  const ref = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<PanZoomView>(IDENTITY);
  const [gesturing, setGesturing] = useState(false);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const start = useRef<{
    view: PanZoomView;
    dist: number;
    mid: { x: number; y: number };
  } | null>(null);
  const lastTap = useRef(0);
  const viewRef = useRef(view);
  viewRef.current = view;

  const box = () => {
    const r = ref.current!.getBoundingClientRect();
    return { w: r.width, h: r.height, left: r.left, top: r.top };
  };
  const clamp = (v: PanZoomView) => {
    const { w, h } = box();
    return clampView(v, w, h, maxScale);
  };

  const begin = () => {
    const pts = [...pointers.current.values()];
    const mid = {
      x: pts.reduce((s, p) => s + p.x, 0) / pts.length,
      y: pts.reduce((s, p) => s + p.y, 0) / pts.length,
    };
    const dist = pts.length > 1 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) : 0;
    start.current = { view: viewRef.current, dist, mid };
  };

  const onPointerDown = (e: PointerEvent) => {
    if ((e.target as Element).closest('button, input')) return; // the overlay's own controls
    try {
      ref.current?.setPointerCapture(e.pointerId);
    } catch {
      /* the pointer is already gone */
    }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    setGesturing(true);
    begin();
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!pointers.current.has(e.pointerId) || !start.current) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointers.current.values()];
    const { view: v0, dist, mid } = start.current;
    const { w, h, left, top } = box();
    const now = {
      x: pts.reduce((s, p) => s + p.x, 0) / pts.length,
      y: pts.reduce((s, p) => s + p.y, 0) / pts.length,
    };
    let factor = 1;
    if (pts.length > 1 && dist > 0) {
      factor = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) / dist;
    } else if (v0.scale === 1) {
      return; // one finger at 1× moves nothing; leave it alone
    }
    // Zoom around the point between the fingers, and follow them as they move.
    const z = zoomAt(v0, factor, mid.x - left - w / 2, mid.y - top - h / 2);
    setView(clamp({ ...z, x: z.x + now.x - mid.x, y: z.y + now.y - mid.y }));
  };

  const onPointerUp = (e: PointerEvent) => {
    if (!pointers.current.delete(e.pointerId)) return;
    if (pointers.current.size > 0) return begin();
    setGesturing(false);
    start.current = null;

    const t = Date.now();
    if (t - lastTap.current < DOUBLE_TAP_MS) {
      lastTap.current = 0;
      const { w, h, left, top } = box();
      if (viewRef.current.scale > 1) setView(IDENTITY);
      else {
        // Zoom in on the tapped point.
        const cx = e.clientX - left - w / 2;
        const cy = e.clientY - top - h / 2;
        setView(clamp(zoomAt(IDENTITY, doubleTapScale, cx, cy)));
      }
    } else {
      lastTap.current = t;
    }
  };

  const onWheel = (e: WheelEvent) => {
    const { w, h, left, top } = box();
    const factor = Math.exp(-e.deltaY * 0.002);
    setView(
      clamp(zoomAt(viewRef.current, factor, e.clientX - left - w / 2, e.clientY - top - h / 2)),
    );
  };

  return {
    ref,
    view,
    setView,
    reset: () => setView(IDENTITY),
    gesturing,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
      onWheel,
    },
  };
}
