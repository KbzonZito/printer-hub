import { useLayoutEffect, useRef, type ComponentType } from 'react';

/**
 * Floating navigation bar. Idle items show only their icon; the pressed one grows from
 * the icon's size to icon + label, and the bar resizes around it (styles in .tabbar).
 * Each label's real width is measured into --label-w so the growth animates to exactly
 * that size, never past it.
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
  const labels = tabs.map((x) => label(x.id)).join('|');

  useLayoutEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    // Re-measure whenever a label's natural size changes (styles or web font loading).
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        const text = e.target as HTMLElement;
        text.parentElement!.style.setProperty('--label-w', `${Math.ceil(text.offsetWidth)}px`);
      }
    });
    bar.querySelectorAll('.tab-label > span').forEach((el) => ro.observe(el));
    return () => ro.disconnect();
  }, [labels]);

  return (
    <nav className="tabbar" ref={barRef}>
      <img className="rail-logo" src="./icon.svg" alt="" width={40} height={40} />
      {tabs.map(({ id, icon: Icon }) => (
        <button
          key={id}
          className={active === id ? 'active' : ''}
          aria-current={active === id ? 'page' : undefined}
          onClick={() => onSelect(id)}
        >
          <Icon size={22} />
          <span className="tab-label">
            <span>{label(id)}</span>
          </span>
        </button>
      ))}
    </nav>
  );
}
