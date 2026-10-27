import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';
import { useContainerBackHandler } from '../backStack';
import { useT } from '../i18n';

/** Drag distance (px) or speed (px/ms) past which releasing a dragged sheet closes it. */
const SWIPE_CLOSE_PX = 110;
const SWIPE_CLOSE_SPEED = 0.6;

/**
 * Drag a sheet down to close it. Starts only when its content is scrolled to the top, and
 * not from controls that use vertical drags themselves (text areas, sliders).
 */
function useSwipeToClose(
  ref: React.RefObject<HTMLDivElement | null>,
  enabled: boolean,
  onClose: () => void,
) {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    const backdrop = el.parentElement!;
    let startY: number | null = null;
    let dy = 0;
    let dragging = false;
    let samples: { y: number; t: number }[] = [];

    const onStart = (e: TouchEvent) => {
      const target = e.target as Element;
      const free =
        e.touches.length === 1 &&
        el.scrollTop <= 0 &&
        !target.closest('textarea, input[type="range"], .no-swipe');
      startY = free ? e.touches[0].clientY : null;
      dy = 0;
      dragging = false;
      samples = [];
    };
    const onMove = (e: TouchEvent) => {
      if (startY == null) return;
      dy = e.touches[0].clientY - startY;
      if (!dragging) {
        // A small threshold keeps taps and upward scrolls working normally.
        if (dy < 8) {
          if (dy < 0) startY = null;
          return;
        }
        dragging = true;
        el.style.animation = 'none';
        el.style.transition = 'none';
      }
      e.preventDefault();
      const offset = Math.max(0, dy - 8);
      el.style.transform = `translateY(${offset}px)`;
      backdrop.style.opacity = String(Math.max(0.3, 1 - offset / el.offsetHeight));
      samples = [...samples.slice(-4), { y: e.touches[0].clientY, t: e.timeStamp }];
    };
    const onEnd = () => {
      if (startY == null || !dragging) return;
      startY = null;
      const first = samples[0];
      const last = samples[samples.length - 1];
      const speed = first && last && last.t > first.t ? (last.y - first.y) / (last.t - first.t) : 0;
      if (dy > SWIPE_CLOSE_PX || (speed > SWIPE_CLOSE_SPEED && dy > 30)) {
        // Continue from where the finger left it (the exit animation starts at this transform).
        el.style.animation = 'sheet-out 0.22s var(--ease) both';
        close.current();
      } else {
        el.style.transition = 'transform 0.25s var(--ease)';
        el.style.transform = '';
        backdrop.style.opacity = '';
      }
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
  }, [enabled]);
}

/** Bottom sheet (dialog on tablets) that animates in and out. Drag it down to close it. */
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}) {
  const [mounted, setMounted] = useState(open);
  const [closing, setClosing] = useState(false);
  useContainerBackHandler(open, onClose);
  const sheetRef = useRef<HTMLDivElement>(null);
  useSwipeToClose(sheetRef, mounted && !closing, onClose);
  // Keep showing the last content while the exit animation runs.
  const last = useRef({ title, children });
  if (open) last.current = { title, children };

  useEffect(() => {
    if (open) {
      setMounted(true);
      setClosing(false);
    } else if (mounted) {
      setClosing(true);
    }
  }, [open]);

  if (!mounted) return null;
  // Portal to <body> so sheets opened from inside another sheet stack correctly.
  return createPortal(
    <div
      className={`sheet-backdrop ${closing ? 'closing' : ''}`}
      onClick={onClose}
      onAnimationEnd={(e) => {
        if (closing && e.target === e.currentTarget) {
          setMounted(false);
          setClosing(false);
        }
      }}
    >
      <div
        ref={sheetRef}
        className="sheet"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-handle" />
        {last.current.title && <h2 className="sheet-title">{last.current.title}</h2>}
        {last.current.children}
      </div>
    </div>,
    document.body,
  );
}

/** Replaces the native <select>, whose Android picker doesn't match the app's style. */
export function Select<T extends string>({
  value,
  options,
  onChange,
  title,
}: {
  value: T;
  options: { value: T; label: string; extra?: ReactNode }[];
  onChange: (value: T) => void;
  title: string;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);
  return (
    <>
      <button type="button" className="select-field" onClick={() => setOpen(true)}>
        <span className="grow">{current?.label ?? value}</span>
        {current?.extra}
        <ChevronDown size={20} />
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={title}>
        <div className="select-options" role="radiogroup">
          {options.map((o) => (
            <button
              type="button"
              key={o.value}
              role="radio"
              aria-checked={o.value === value}
              className={`select-option ${o.value === value ? 'active' : ''}`}
              onClick={() => {
                onChange(o.value);
                setOpen(false);
              }}
            >
              <span className="radio" />
              <span className="grow">{o.label}</span>
              {o.extra}
            </button>
          ))}
        </div>
      </Sheet>
    </>
  );
}

export function ConfirmSheet({
  open,
  title,
  message,
  confirmLabel,
  danger,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  message?: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const t = useT();
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      {message && <p className="muted">{message}</p>}
      <div className="row gap">
        <button className="btn ghost grow" onClick={onClose}>
          {t('common.back')}
        </button>
        <button
          className={`btn grow ${danger ? 'danger' : 'primary'}`}
          onClick={() => {
            onClose();
            onConfirm();
          }}
        >
          {confirmLabel}
        </button>
      </div>
    </Sheet>
  );
}

type Toast = { id: number; text: string; error?: boolean };
const ToastContext = createContext<(text: string, error?: boolean) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const show = useCallback((text: string, error?: boolean) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, error }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);
  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="toasts">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.error ? 'error' : ''}`}>
            {t.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

/** Wraps an async action with toast feedback. */
export function useAction() {
  const toast = useToast();
  return useCallback(
    async (fn: () => Promise<unknown>, success?: string) => {
      try {
        await fn();
        if (success) toast(success);
        return true;
      } catch (err) {
        toast((err as Error).message, true);
        return false;
      }
    },
    [toast],
  );
}

const SECTIONS_KEY = 'printer-hub:sections';

function readOpenSections(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(SECTIONS_KEY) ?? '{}');
  } catch {
    return {};
  }
}

/** Expandable settings card; remembers whether it was left open. */
export function Section({
  id,
  icon: Icon,
  title,
  summary,
  defaultOpen = false,
  children,
}: {
  id: string;
  icon: ComponentType<{ size?: number }>;
  title: string;
  summary?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(() => readOpenSections()[id] ?? defaultOpen);
  const toggle = () => {
    setOpen(!open);
    try {
      localStorage.setItem(SECTIONS_KEY, JSON.stringify({ ...readOpenSections(), [id]: !open }));
    } catch {
      /* storage unavailable */
    }
  };
  return (
    <section className={`section ${open ? 'open' : ''}`}>
      <button type="button" className="section-head" onClick={toggle} aria-expanded={open}>
        <span className="section-icon">
          <Icon size={20} />
        </span>
        <span className="grow">
          <strong>{title}</strong>
          {summary && <small className="muted">{summary}</small>}
        </span>
        <ChevronDown size={20} className="section-chevron" />
      </button>
      <div className="section-body">
        <div>
          <div className="section-content">{children}</div>
        </div>
      </div>
    </section>
  );
}
