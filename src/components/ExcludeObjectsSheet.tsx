import { useState } from 'react';
import { Ban, Check, Shapes } from 'lucide-react';
import { printerActions, type PrinterStatus, type PrintObject } from '../api/moonraker';
import { haptic } from '../haptics';
import { useT } from '../i18n';
import { bedFrame, objectCenter, objectLabels, svgPoints, toSvg } from '../objects';
import type { Printer } from '../store';
import { ConfirmSheet, Sheet, useAction } from './ui';

/** Minimum tap radius around each object's center (mm), so small parts are easy to hit. */
const HIT_RADIUS = 9;

/**
 * Bed map of the parts in the current print (Klipper exclude_object). Tap a part to select
 * it, then confirm to stop printing it. Excluded parts stay drawn, crossed out.
 */
export function ExcludeObjectsSheet({
  printer,
  status,
  open,
  onClose,
}: {
  printer: Printer;
  status: PrinterStatus;
  open: boolean;
  onClose: () => void;
}) {
  const t = useT();
  const run = useAction();
  const [selected, setSelected] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);

  const { objects, excludedObjects, currentObject } = status;
  const excluded = new Set(excludedObjects.map((n) => n.toUpperCase()));
  const isExcluded = (o: PrintObject) => excluded.has(o.name.toUpperCase());
  const remaining = objects.filter((o) => !isExcluded(o)).length;
  const frame = bedFrame(objects, status.bedMin, status.bedMax);
  const width = frame.maxX - frame.minX;
  const height = frame.maxY - frame.minY;
  const sel = objects.find((o) => o.name === selected) ?? null;
  const labels = objectLabels(objects);
  const label = (o: PrintObject) => labels.get(o.name) ?? o.name;

  const pick = (o: PrintObject) => {
    if (isExcluded(o)) return;
    haptic('tap');
    setSelected(o.name === selected ? null : o.name);
  };

  const exclude = async () => {
    if (!sel) return;
    haptic('warning');
    const ok = await run(
      () => printerActions.excludeObject(printer, sel.name),
      t('objects.excluded', { name: label(sel) }),
    );
    if (ok) setSelected(null);
  };

  return (
    <Sheet
      open={open}
      onClose={() => {
        setSelected(null);
        onClose();
      }}
      title={t('objects.title')}
    >
      <p className="muted small">{t('objects.hint')}</p>
      <svg
        className="bed-map no-swipe"
        viewBox={`0 0 ${width} ${height}`}
        role="group"
        aria-label={t('objects.map')}
      >
        <rect className="bed-plate" x={0} y={0} width={width} height={height} rx={6} />
        {objects.map((o) => {
          const out = isExcluded(o);
          const center = objectCenter(o);
          const c = center ? toSvg(center, frame) : null;
          const cls = [
            'bed-object',
            out && 'excluded',
            o.name === currentObject && 'current',
            o.name === selected && 'selected',
          ]
            .filter(Boolean)
            .join(' ');
          return (
            <g
              key={o.name}
              className={cls}
              onClick={() => pick(o)}
              role="button"
              aria-label={`${label(o)}${out ? ` (${t('objects.isExcluded')})` : ''}`}
              aria-pressed={o.name === selected}
            >
              {c && <circle className="hit" cx={c[0]} cy={c[1]} r={HIT_RADIUS} />}
              {o.polygon.length > 2 ? (
                <polygon points={svgPoints(o.polygon, frame)} />
              ) : (
                c && <circle cx={c[0]} cy={c[1]} r={5} />
              )}
              {out && c && (
                <path
                  className="cross"
                  d={`M${c[0] - 5} ${c[1] - 5}L${c[0] + 5} ${c[1] + 5}M${c[0] + 5} ${c[1] - 5}L${c[0] - 5} ${c[1] + 5}`}
                />
              )}
            </g>
          );
        })}
      </svg>
      <div className="bed-legend muted small">
        <span>{t('mesh.front')}</span>
        <span>{t('objects.remaining', { n: remaining, total: objects.length })}</span>
      </div>

      <div className="select-options">
        {objects.map((o) => {
          const out = isExcluded(o);
          return (
            <button
              key={o.name}
              className={`select-option ${o.name === selected ? 'active' : ''}`}
              disabled={out}
              onClick={() => pick(o)}
            >
              {out ? <Ban size={18} /> : <Shapes size={18} />}
              <span className="grow">
                <strong>{label(o)}</strong>
                <small className="muted">
                  {out
                    ? t('objects.isExcluded')
                    : o.name === currentObject
                      ? t('objects.printingNow')
                      : o.name}
                </small>
              </span>
              {o.name === selected && <Check size={18} className="accent" />}
            </button>
          );
        })}
      </div>

      <button className="btn danger" disabled={!sel} onClick={() => setConfirm(true)}>
        <Ban size={18} />
        {sel ? t('objects.exclude', { name: label(sel) }) : t('objects.pick')}
      </button>

      <ConfirmSheet
        open={confirm}
        title={t('objects.confirmTitle', { name: sel ? label(sel) : '' })}
        message={remaining <= 1 ? t('objects.confirmLast') : t('objects.confirmText')}
        confirmLabel={t('objects.excludeShort')}
        danger
        onConfirm={exclude}
        onClose={() => setConfirm(false)}
      />
    </Sheet>
  );
}
