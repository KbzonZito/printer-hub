import type { ComponentType, ReactNode } from 'react';
import { RefreshCw } from 'lucide-react';
import { useT } from '../i18n';

// The three states of a list or screen that loads something: loading, empty and failed.

export function Loading({ label }: { label?: string }) {
  return (
    <div className="empty" role="status" aria-live="polite">
      <div className="loader" />
      {label && <p className="muted">{label}</p>}
    </div>
  );
}

export function Empty({
  icon: Icon,
  children,
}: {
  icon: ComponentType<{ size?: number }>;
  children: ReactNode;
}) {
  return (
    <div className="empty">
      <Icon size={36} />
      <p className="muted">{children}</p>
    </div>
  );
}

/** A load that failed, with its message and a way to try again. */
export function LoadError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const t = useT();
  return (
    <div className="empty" role="alert">
      <p className="muted">{message}</p>
      {onRetry && (
        <button className="btn primary" onClick={onRetry}>
          <RefreshCw size={18} /> {t('common.retry')}
        </button>
      )}
    </div>
  );
}
