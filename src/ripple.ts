// Material-style touch ripple for every tappable surface, wired once at startup.

const SELECTOR =
  '.btn, .tabbar button, .segmented button, .file-row, .list-main, .chip, .tile, .found, .select-option, .select-field, .choice, .section-head';

export function installRipple() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  document.addEventListener(
    'pointerdown',
    (e) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>(SELECTOR);
      if (!el || (el as HTMLButtonElement).disabled) return;
      const rect = el.getBoundingClientRect();
      const size = Math.hypot(rect.width, rect.height) * 2;
      const ripple = document.createElement('span');
      ripple.className = 'ripple';
      ripple.style.width = ripple.style.height = `${size}px`;
      ripple.style.left = `${e.clientX - rect.left - size / 2}px`;
      ripple.style.top = `${e.clientY - rect.top - size / 2}px`;
      ripple.addEventListener('animationend', () => ripple.remove());
      el.appendChild(ripple);
    },
    { passive: true },
  );
}
