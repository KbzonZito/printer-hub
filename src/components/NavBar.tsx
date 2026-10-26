import { useLayoutEffect, useRef, type ComponentType } from 'react';

const DURATION = 380;
const GROW = 2.5; // Active item width in units; keep in sync with --grow in styles.css.
const GAP = 8; // Space between icon and label.
// Close to --ease (cubic-bezier(0.2, 0, 0, 1)), without overshoot.
const ease = (t: number) => 1 - Math.pow(1 - t, 3);
const lerp = (a: number, b: number, p: number) => a + (b - a) * p;

interface Geometry {
  widths: number[];
  labels: number[];
  pill: { left: number; width: number };
}

/**
 * Floating navigation bar. One animation drives everything frame by frame: the pressed
 * item widens while its icon and label stay centred and the label is revealed, the
 * previous one narrows, and the pill glides over and ends exactly around the new item.
 * The bar itself never resizes.
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
  // What is currently on screen, so a new tap starts from there (even mid-animation).
  const shown = useRef<Geometry | null>(null);

  useLayoutEffect(() => {
    const bar = barRef.current;
    const pill = pillRef.current;
    if (!bar || !pill) return;
    const buttons = [...bar.querySelectorAll<HTMLButtonElement>('button')];
    const labels = buttons.map((b) => b.querySelector('span')!);
    const index = tabs.findIndex((x) => x.id === active);
    const fullLabel = labels.map((l) => l.scrollWidth);

    const paint = (g: Geometry) => {
      buttons.forEach((b, i) => {
        b.style.width = `${g.widths[i]}px`;
        const reveal = fullLabel[i] ? Math.min(1, g.labels[i] / fullLabel[i]) : 0;
        labels[i].style.maxWidth = `${g.labels[i]}px`;
        labels[i].style.marginLeft = `${GAP * reveal}px`;
        labels[i].style.opacity = String(reveal * reveal);
      });
      pill.style.width = `${g.pill.width}px`;
      pill.style.transform = `translateX(${g.pill.left}px)`;
      shown.current = g;
    };
    // Resting state: CSS lays the items out; only the pill is positioned here.
    const settle = () => {
      buttons.forEach((b, i) => {
        b.style.width = '';
        labels[i].style.maxWidth = labels[i].style.marginLeft = labels[i].style.opacity = '';
      });
      const btn = buttons[index];
      pill.style.width = `${btn.offsetWidth}px`;
      pill.style.transform = `translateX(${btn.offsetLeft}px)`;
      shown.current = {
        widths: buttons.map((b) => b.offsetWidth),
        labels: labels.map((l) => l.offsetWidth),
        pill: { left: btn.offsetLeft, width: btn.offsetWidth },
      };
    };

    const onResize = () => settle();
    window.addEventListener('resize', onResize);
    let frame = 0;
    const cleanup = () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', onResize);
    };

    const from = shown.current;
    const isRail = getComputedStyle(bar).position !== 'fixed'; // tablets: CSS-only rail
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!from || isRail || reduced) {
      settle();
      return cleanup;
    }

    const unit = (bar.clientWidth - 16) / (buttons.length - 1 + GROW);
    const toWidths = buttons.map((_, i) => (i === index ? unit * GROW : unit));
    const toLabels = buttons.map((_, i) => (i === index ? fullLabel[i] : 0));

    const step = (p: number) => {
      const widths = buttons.map((_, i) => lerp(from.widths[i], toWidths[i], p));
      const left = widths.slice(0, index).reduce((a, b) => a + b, 8);
      paint({
        widths,
        labels: buttons.map((_, i) => lerp(from.labels[i], toLabels[i], p)),
        // The pill slides from where it was to the item, growing with it.
        pill: {
          left: lerp(from.pill.left, left, p),
          width: lerp(from.pill.width, widths[index], p),
        },
      });
    };
    // First frame synchronously, before the browser paints the new active state.
    step(0);
    const start = performance.now();
    const tick = (now: number) => {
      const p = ease(Math.min(1, (now - start) / DURATION));
      if (p < 1) {
        step(p);
        frame = requestAnimationFrame(tick);
      } else {
        settle();
      }
    };
    frame = requestAnimationFrame(tick);
    return cleanup;
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
