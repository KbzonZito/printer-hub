import type { ReactNode } from 'react';
import { usePanZoom } from '../usePanZoom';

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
  const { ref, view, reset, gesturing, handlers } = usePanZoom();
  return (
    <div ref={ref} className={`zoom-pan ${gesturing ? 'gesturing' : ''}`} {...handlers}>
      <div
        className="zoom-pan-content"
        style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}
      >
        {children}
      </div>
      {overlay?.(view.scale, reset)}
    </div>
  );
}
