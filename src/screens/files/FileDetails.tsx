import { Clock, History } from 'lucide-react';
import type { FileMetadata, GcodeFile } from '../../api/moonraker';
import { formatCost, printCost } from '../../cost';
import { estimateFile, type Calibration } from '../../estimate';
import { formatBytes, formatClock, formatDate, formatDuration } from '../../format';
import { useLang, useT, type MessageKey } from '../../i18n';
import { useSettings } from '../../store';

// File details sheet content: time estimate (adjusted with this printer's history) and the
// slicer data (material, filament, temperatures…).

export function EstimateCard({
  file,
  meta,
  cal,
}: {
  file: GcodeFile;
  meta: FileMetadata | undefined;
  cal: Calibration | null;
}) {
  const t = useT();
  const lang = useLang();
  const est = estimateFile(file.path, meta, cal);
  const rows: { key: MessageKey; value: number | null; icon?: typeof Clock }[] = [
    { key: 'files.est.lastPrint', value: est.lastActual, icon: History },
    { key: 'files.est.calibrated', value: est.calibrated },
    { key: 'files.est.slicer', value: est.slicer },
    { key: 'files.est.byFilament', value: est.slicer ? null : est.byFilament },
  ];
  return (
    <div className="estimate">
      <div className="estimate-head">
        <Clock size={20} />
        <div className="grow">
          <span className="muted small">{t('files.estimate')}</span>
          <strong>{est.best ? formatDuration(est.best) : '—'}</strong>
        </div>
        {est.best && (
          <span className="muted small right">
            {t('files.est.finish', {
              time: formatClock(new Date(Date.now() + est.best * 1000), lang),
            })}
          </span>
        )}
      </div>
      {!est.best && <p className="muted small">{t('files.est.none')}</p>}
      {rows
        .filter((r) => r.value)
        .map((r) => (
          <div key={r.key} className="estimate-row">
            <span className="muted">{t(r.key)}</span>
            <strong>{formatDuration(r.value!)}</strong>
          </div>
        ))}
      {est.calibrated && cal?.ratio && (
        <p className="muted small">
          {t('files.est.calibratedHint', {
            n: String(cal.samples),
            pct: `${Math.round(cal.ratio * 100)}%`,
          })}
        </p>
      )}
    </div>
  );
}

export function FileDetails({ file, meta }: { file: GcodeFile; meta: FileMetadata | undefined }) {
  const t = useT();
  const lang = useLang();
  const { settings } = useSettings();
  const cost = printCost(settings.presets, {
    type: meta?.filament_type,
    grams: meta?.filament_weight_total,
    lengthMm: meta?.filament_total,
  });
  const filament = meta?.filament_weight_total
    ? `${meta.filament_weight_total.toFixed(0)} g`
    : null;
  const length = meta?.filament_total ? `${(meta.filament_total / 1000).toFixed(1)} m` : null;
  const temps =
    meta?.first_layer_extr_temp || meta?.first_layer_bed_temp
      ? `${meta.first_layer_extr_temp ?? '—'}° / ${meta.first_layer_bed_temp ?? '—'}°`
      : null;
  const rows: [MessageKey, string | null][] = [
    [
      'files.material',
      [meta?.filament_type, meta?.filament_name].filter(Boolean).join(' · ') || null,
    ],
    ['home.filament', [length, filament].filter(Boolean).join(' · ') || null],
    ['files.cost', cost != null ? formatCost(cost, settings.currency, lang) : null],
    ['files.temps', temps],
    ['files.layer', meta?.layer_height ? `${meta.layer_height} mm` : null],
    ['files.height', meta?.object_height ? `${meta.object_height} mm` : null],
    ['files.slicer', meta?.slicer ?? null],
    ['files.size', formatBytes(file.size)],
    ['files.modified', formatDate(file.modified, lang)],
  ];
  return (
    <div className="details">
      {rows
        .filter(([, v]) => v)
        .map(([k, v]) => (
          <div key={k} className="estimate-row">
            <span className="muted">{t(k)}</span>
            <span>{v}</span>
          </div>
        ))}
    </div>
  );
}
