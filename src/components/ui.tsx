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
import { useT } from '../i18n';

/** Bottom sheet (dialog on tablets) that animates in and out. */
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
      <div className="sheet" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
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
