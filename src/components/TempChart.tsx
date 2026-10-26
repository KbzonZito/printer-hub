import { useState } from 'react';
import { useT } from '../i18n';
import type { TempSample } from '../usePrinterStatus';

const W = 480;
const H = 200;
const PAD = { left: 36, right: 8, top: 10, bottom: 22 };
const RANGES = [5, 10, 20];

type Series = { key: keyof TempSample; target: keyof TempSample; className: string };
const SERIES: Series[] = [
  { key: 'extruder', target: 'extruderTarget', className: 'nozzle' },
  { key: 'bed', target: 'bedTarget', className: 'bed' },
];

export function TempChart({ history }: { history: TempSample[] }) {
  const t = useT();
  const [minutes, setMinutes] = useState(10);
  const now = Date.now();
  const span = minutes * 60 * 1000;
  const data = history.filter((s) => now - s.time <= span);
  const last = history[history.length - 1];

  const peak = Math.max(
    60,
    ...data.flatMap((s) => [s.extruder, s.extruderTarget, s.bed, s.bedTarget]),
  );
  const yMax = Math.ceil((peak + 10) / 50) * 50;
  const x = (time: number) =>
    PAD.left + ((time - (now - span)) / span) * (W - PAD.left - PAD.right);
  const y = (v: number) => PAD.top + (1 - v / yMax) * (H - PAD.top - PAD.bottom);
  const path = (k: keyof TempSample) =>
    data.map((s, i) => `${i ? 'L' : 'M'}${x(s.time).toFixed(1)},${y(s[k]).toFixed(1)}`).join('');
  const ticks = Array.from({ length: yMax / 50 + 1 }, (_, i) => i * 50).filter(
    (v) => yMax <= 200 || v % 100 === 0,
  );

  return (
    <section className="card chart-card">
      <div className="chart-head">
        <div className="chart-legend">
          <span className="legend nozzle">
            {t('home.nozzle')} <strong>{last ? `${last.extruder.toFixed(0)}°` : '—'}</strong>
          </span>
          <span className="legend bed">
            {t('home.bed')} <strong>{last ? `${last.bed.toFixed(0)}°` : '—'}</strong>
          </span>
        </div>
        <div className="segmented mini">
          {RANGES.map((m) => (
            <button key={m} className={m === minutes ? 'active' : ''} onClick={() => setMinutes(m)}>
              {m}m
            </button>
          ))}
        </div>
      </div>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('chart.title')}>
        {ticks.map((v) => (
          <g key={v}>
            <line className="grid" x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} />
            <text className="axis" x={PAD.left - 6} y={y(v) + 4} textAnchor="end">
              {v}
            </text>
          </g>
        ))}
        {[minutes, minutes / 2].map((m) => (
          <text key={m} className="axis" x={x(now - m * 60000)} y={H - 4} textAnchor="start">
            -{m}m
          </text>
        ))}
        {data.length > 1 &&
          SERIES.map((s) => (
            <g key={s.key} className={s.className}>
              <path className="target" d={path(s.target)} />
              <path className="line" d={path(s.key)} />
            </g>
          ))}
      </svg>
    </section>
  );
}
