import { useEffect, useState } from 'react';
import { Check, Disc3, X } from 'lucide-react';
import {
  fetchActiveSpoolId,
  listSpools,
  setActiveSpool,
  spoolLabel,
  type Spool,
} from '../api/spoolman';
import { useT } from '../i18n';
import type { Printer } from '../store';
import { useCapabilities, useConnectionEvent } from '../usePrinterStatus';
import { Sheet, useAction } from './ui';

/** Active Spoolman spool, for the dashboard and the "enough filament?" check. */
export function useActiveSpool(printer: Printer) {
  const caps = useCapabilities();
  const enabled = caps.has('spoolman');
  const [spools, setSpools] = useState<Spool[] | null>(null);
  const [activeId, setActiveId] = useState<number | null>(null);

  const load = () =>
    Promise.all([fetchActiveSpoolId(printer), listSpools(printer)])
      .then(([id, list]) => {
        setActiveId(id);
        setSpools(list);
      })
      .catch(() => setSpools([]));
  useEffect(() => {
    if (enabled) load();
  }, [enabled, printer.id]);
  useConnectionEvent('notify_active_spool_set', (params) => {
    setActiveId(params?.[0]?.spool_id ?? null);
    load();
  });

  const active = spools?.find((s) => s.id === activeId) ?? null;
  return { enabled, spools, active, activeId, setActiveId, reload: load };
}

export function SpoolDot({ spool, size = 22 }: { spool: Spool | null; size?: number }) {
  const hex = spool?.filament.color_hex;
  return (
    <span
      className="spool-dot"
      style={{ width: size, height: size, background: hex ? `#${hex.slice(0, 6)}` : undefined }}
    />
  );
}

export function SpoolCard({ printer }: { printer: Printer }) {
  const t = useT();
  const run = useAction();
  const { enabled, spools, active, activeId, setActiveId } = useActiveSpool(printer);
  const [open, setOpen] = useState(false);
  if (!enabled || !spools) return null;

  const choose = async (id: number | null) => {
    setOpen(false);
    const ok = await run(() => setActiveSpool(printer, id));
    if (ok) setActiveId(id);
  };

  return (
    <>
      <button className="card spool-card" onClick={() => setOpen(true)}>
        {active ? <SpoolDot spool={active} /> : <Disc3 size={22} className="muted" />}
        <span className="grow">
          <small className="muted">{t('spool.active')}</small>
          <strong>{active ? spoolLabel(active) : t('spool.none')}</strong>
        </span>
        {active?.remaining_weight != null && (
          <span className="spool-remaining">
            {Math.round(active.remaining_weight)}
            <small> g</small>
          </span>
        )}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={t('spool.choose')}>
        <div className="select-options">
          {spools.length === 0 && <p className="muted">{t('spool.empty')}</p>}
          {spools
            .filter((s) => !s.archived)
            .map((s) => (
              <button
                key={s.id}
                className={`select-option ${s.id === activeId ? 'active' : ''}`}
                onClick={() => choose(s.id)}
              >
                <SpoolDot spool={s} />
                <span className="grow">
                  <strong>{spoolLabel(s)}</strong>
                  <small className="muted">
                    {[
                      s.filament.material,
                      s.remaining_weight != null && `${Math.round(s.remaining_weight)} g`,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </small>
                </span>
                {s.id === activeId && <Check size={18} className="accent" />}
              </button>
            ))}
          {activeId != null && (
            <button className="select-option" onClick={() => choose(null)}>
              <X size={20} />
              <span className="grow">{t('spool.clear')}</span>
            </button>
          )}
        </div>
      </Sheet>
    </>
  );
}
