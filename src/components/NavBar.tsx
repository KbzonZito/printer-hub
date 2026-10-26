import { useLayoutEffect, useRef, type ComponentType } from 'react';

const DURATION = 400;
// Matches --ease (cubic-bezier(0.2, 0, 0, 1)) closely enough for the indicator.
const ease = (t: number) => 1 - Math.pow(1 - t, 4);

/**
 * Floating navigation bar. The pill indicator glides from the previous item to the
 * pressed one, tracking that item's live box every frame while it widens, so the pill
 * always ends exactly around the icon and label.
 */
export function NavBar<T extends string>({
  tabs,
  active,
  onSelect,
  label,
}: {
  tabs: { id: T; icon: ComponentType<{ size?: number }> }[];
  active: T;
  onSelect: (id: T) => void;
  label: (id: T) => string;
}) {
  const barRef = useRef<HTMLElement>(null);
  const pillRef = useRef<HTMLSpanElement>(null);
  const box = useRef<{ left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    const bar = barRef.current;
    const pill = pillRef.current;
    if (!bar || !pill) return;
    const target = () => {
      const btn = bar.querySelector<HTMLElement>('button.active');
      return btn ? { left: btn.offsetLeft, width: btn.offsetWidth } : null;
    };
    const paint = (b: { left: number; width: number }) => {
      box.current = b;
      pill.style.transform = `translateX(${b.left}px)`;
      pill.style.width = `${b.width}px`;
    };

    const from = box.current;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let frame = 0;
    const start = performance.now();
    const step = (now: number) => {
      const to = target();
      if (!to) return;
      const p = from && !reduced ? ease(Math.min(1, (now - start) / DURATION)) : 1;
      paint({
        left: from ? from.left + (to.left - from.left) * p : to.left,
        width: from ? from.width + (to.width - from.width) * p : to.width,
      });
      // Keep following the item until its own width transition has settled.
      if (now - start < DURATION + 80) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);

    const onResize = () => {
      const to = target();
      if (to) paint(to);
    };
    window.addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', onResize);
    };
  }, [active]);

  return (
    <nav className="tabbar" ref={barRef}>
      <img className="rail-logo" src="./icon.svg" alt="" width={40} height={40} />
      <span className="tab-indicator" ref={pillRef} />
      {tabs.map(({ id, icon: Icon }) => (
        <button key={id} className={active === id ? 'active' : ''} onClick={() => onSelect(id)}>
          <Icon size={22} />
          <span>{label(id)}</span>
        </button>
      ))}
    </nav>
  );
}
