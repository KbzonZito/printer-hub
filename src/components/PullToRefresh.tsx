import { useEffect, useRef, useState, type ReactNode } from 'react';
import { RefreshCw } from 'lucide-react';
import { useT } from '../i18n';

/** How far the finger must pull (after damping) to trigger a refresh. */
const THRESHOLD = 72;
const MAX_PULL = 110;

/**
 * Pull down from the top of the screen to reload. Works on the scrolling <main>, so it only
 * starts when the screen is already scrolled to the top.
 */
export function PullToRefresh({
  onRefresh,
  children,
}: {
  onRefresh: () => Promise<unknown>;
  children: ReactNode;
}) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const latest = useRef({ onRefresh, refreshing });
  latest.current = { onRefresh, refreshing };

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let startY: number | null = null;
    let distance = 0;

    const scroller = () => el.closest('main');
    const onStart = (e: TouchEvent) => {
      const atTop = (scroller()?.scrollTop ?? 0) <= 0;
      const free = atTop && !latest.current.refreshing && e.touches.length === 1;
      startY = free ? e.touches[0].clientY : null;
      distance = 0;
    };
    const onMove = (e: TouchEvent) => {
      if (startY == null) return;
      const dy = e.touches[0].clientY - startY;
      if (dy <= 0) {
        if (distance > 0) setPull((distance = 0));
        return;
      }
      // Hold the page still while pulling, and resist more the further it goes.
      e.preventDefault();
      distance = Math.min(MAX_PULL, dy * 0.5);
      setDragging(true);
      setPull(distance);
    };
    const onEnd = async () => {
      if (startY == null) return;
      startY = null;
      setDragging(false);
      if (distance < THRESHOLD) return setPull(0);
      setRefreshing(true);
      setPull(THRESHOLD * 0.75);
      try {
        await latest.current.onRefresh();
      } catch {
        /* the screen shows its own error */
      }
      setRefreshing(false);
      setPull(0);
    };

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd);
    el.addEventListener('touchcancel', onEnd);
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
    };
  }, []);

  const ready = pull >= THRESHOLD;
  return (
    <div ref={ref} className={`ptr ${dragging ? 'dragging' : ''}`}>
      <div
        className="ptr-indicator"
        style={{ transform: `translate(-50%, ${pull - 44}px)`, opacity: Math.min(1, pull / 40) }}
        role={refreshing ? 'status' : undefined}
        aria-label={refreshing ? t('common.refreshing') : undefined}
      >
        <RefreshCw
          size={20}
          className={refreshing ? 'spin' : ''}
          style={refreshing ? undefined : { transform: `rotate(${pull * 3}deg)` }}
          strokeWidth={ready ? 2.6 : 2}
        />
      </div>
      <div
        className="ptr-content"
        style={{ transform: pull ? `translateY(${pull * 0.5}px)` : undefined }}
      >
        {children}
      </div>
    </div>
  );
}
