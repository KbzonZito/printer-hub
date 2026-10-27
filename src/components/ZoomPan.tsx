import { useRef, useState, type PointerEvent, type ReactNode } from 'react';

const MAX_SCALE = 5;
const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_SCALE = 2.5;

interface View {
  scale: number;
  x: number;
  y: number;
}

const IDENTITY: View = { scale: 1, x: 0, y: 0 };

/** Keeps the zoomed content covering the frame (no empty borders while panning). */
function clamp(v: View, w: number, h: number): View {
  const scale = Math.min(MAX_SCALE, Math.max(1, v.scale));
  const maxX = ((scale - 1) * w) / 2;
  const maxY = ((scale - 1) * h) / 2;
  return {
    scale,
    x: Math.min(maxX, Math.max(-maxX, v.x)),
    y: Math.min(maxY, Math.max(-maxY, v.y)),
  };
}

/**
 * Pinch to zoom, drag to move and double tap to zoom in or out. `children` is the content;
 * `overlay` receives the current zoom and a reset function (for a "2.5×" chip).
 */
export function ZoomPan({
  children,
  overlay,
}: {
  children: ReactNode;
  overlay?: (scale: number, reset: () => void) => ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>(IDENTITY);
  const [gesturing, setGesturing] = useState(false);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const start = useRef<{ view: View; dist: number; mid: { x: number; y: number } } | null>(null);
  const lastTap = useRef(0);
  const viewRef = useRef(view);
  viewRef.current = view;

  const size = () => {
    const r = ref.current!.getBoundingClientRect();
    return { w: r.width, h: r.height, left: r.left, top: r.top };
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
    if ((e.target as Element).closest('button')) return; // the overlay's own buttons
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
    const { w, h, left, top } = size();
    const now = {
      x: pts.reduce((s, p) => s + p.x, 0) / pts.length,
      y: pts.reduce((s, p) => s + p.y, 0) / pts.length,
    };
    let scale = v0.scale;
    if (pts.length > 1 && dist > 0) {
      scale = v0.scale * (Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) / dist);
    } else if (v0.scale === 1) {
      return; // one finger at 1× scrolls nothing; leave it alone
    }
    // Zoom around the point between the fingers, and follow them as they move.
    const cx = mid.x - left - w / 2;
    const cy = mid.y - top - h / 2;
    const k = scale / v0.scale;
    setView(
      clamp(
        {
          scale,
          x: cx - (cx - v0.x) * k + (now.x - mid.x),
          y: cy - (cy - v0.y) * k + (now.y - mid.y),
        },
        w,
        h,
      ),
    );
  };

  const onPointerUp = (e: PointerEvent) => {
    if (!pointers.current.delete(e.pointerId)) return;
    if (pointers.current.size > 0) return begin();
    setGesturing(false);
    start.current = null;

    const t = Date.now();
    if (t - lastTap.current < DOUBLE_TAP_MS) {
      lastTap.current = 0;
      const { w, h, left, top } = size();
      if (viewRef.current.scale > 1) setView(IDENTITY);
      else {
        // Zoom in on the tapped point.
        const cx = e.clientX - left - w / 2;
        const cy = e.clientY - top - h / 2;
        setView(
          clamp(
            {
              scale: DOUBLE_TAP_SCALE,
              x: -cx * (DOUBLE_TAP_SCALE - 1),
              y: -cy * (DOUBLE_TAP_SCALE - 1),
            },
            w,
            h,
          ),
        );
      }
    } else {
      lastTap.current = t;
    }
  };

  return (
    <div
      ref={ref}
      className={`zoom-pan ${gesturing ? 'gesturing' : ''}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div
        className="zoom-pan-content"
        style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}
      >
        {children}
      </div>
      {overlay?.(view.scale, () => setView(IDENTITY))}
    </div>
  );
}
