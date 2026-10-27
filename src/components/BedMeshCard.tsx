import { useEffect, useState } from 'react';
import { Grid3x3, Save } from 'lucide-react';
import { post, queryObjects } from '../api/moonraker';
import { useT } from '../i18n';
import { flatness, meshColor, meshStats, type BedMesh } from '../mesh';
import type { Printer } from '../store';
import { ConfirmSheet, useAction } from './ui';

async function fetchMesh(p: Printer): Promise<BedMesh | null> {
  const status = (await queryObjects(p, {
    bed_mesh: ['profile_name', 'mesh_min', 'mesh_max', 'probed_matrix'],
  })) as Record<string, Record<string, unknown>>;
  const m = status.bed_mesh;
  const matrix = m?.probed_matrix as number[][] | undefined;
  if (
    !m ||
    !matrix?.length ||
    !matrix[0]?.length ||
    (matrix.length === 1 && matrix[0].length === 1)
  )
    return null;
  return {
    profile: String(m.profile_name ?? ''),
    matrix,
    min: (m.mesh_min as [number, number]) ?? [0, 0],
    max: (m.mesh_max as [number, number]) ?? [0, 0],
  };
}

/** Heatmap of the bed mesh with its flatness, and a button to probe it again. */
export function BedMeshCard({ printer, printing }: { printer: Printer; printing: boolean }) {
  const t = useT();
  const run = useAction();
  const [mesh, setMesh] = useState<BedMesh | null | undefined>(undefined);
  const [confirm, setConfirm] = useState<'calibrate' | 'save' | null>(null);
  const [busy, setBusy] = useState(false);
  const [calibrated, setCalibrated] = useState(false);

  const load = () =>
    fetchMesh(printer)
      .then(setMesh)
      .catch(() => setMesh(null));
  useEffect(() => {
    load();
  }, [printer.id]);

  const gcode = (script: string) =>
    // Probing a whole mesh can take minutes.
    post(printer, `/printer/gcode/script?script=${encodeURIComponent(script)}`, 10 * 60 * 1000);

  const calibrate = async () => {
    setBusy(true);
    const ok = await run(() => gcode('G28\nBED_MESH_CALIBRATE'), t('mesh.done'));
    setBusy(false);
    if (ok) {
      setCalibrated(true);
      load();
    }
  };

  const stats = mesh ? meshStats(mesh.matrix) : null;
  const maxAbs = stats ? Math.max(Math.abs(stats.lo), Math.abs(stats.hi)) : 0;
  const quality = stats ? flatness(stats.range) : null;
  const cols = mesh?.matrix[0].length ?? 0;
  // Rows are stored front to back; draw the back of the bed at the top.
  const rows = mesh ? [...mesh.matrix].reverse() : [];

  return (
    <section className="card">
      <h2 className="card-title">{t('mesh.title')}</h2>
      {mesh === undefined && <div className="loader small" />}
      {mesh === null && <p className="muted small">{t('mesh.none')}</p>}
      {mesh && stats && (
        <>
          <div className="mesh-summary">
            <span>
              <small className="muted">{t('mesh.range')}</small>
              <strong>{stats.range.toFixed(3)} mm</strong>
            </span>
            <span className={`pill mesh-${quality}`}>{t(`mesh.${quality!}`)}</span>
          </div>
          <div
            className="mesh-grid"
            style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
            role="img"
            aria-label={t('mesh.aria', {
              lo: stats.lo.toFixed(3),
              hi: stats.hi.toFixed(3),
            })}
          >
            {rows.flatMap((row, y) =>
              row.map((v, x) => (
                <span
                  key={`${y}-${x}`}
                  className="mesh-cell"
                  style={{ background: meshColor(v, maxAbs) }}
                  title={`${v.toFixed(3)} mm`}
                >
                  {cols <= 9 ? v.toFixed(2) : ''}
                </span>
              )),
            )}
          </div>
          <div className="mesh-legend muted small">
            <span>{t('mesh.front')}</span>
            <span>
              {stats.lo.toFixed(3)} … {stats.hi.toFixed(3)} mm
              {mesh.profile ? ` · ${mesh.profile}` : ''}
            </span>
          </div>
        </>
      )}
      <div className="row gap">
        <button
          className="btn grow"
          disabled={printing || busy}
          onClick={() => setConfirm('calibrate')}
        >
          {busy ? <div className="loader small" /> : <Grid3x3 size={18} />}
          {busy ? t('mesh.probing') : t('mesh.calibrate')}
        </button>
        {calibrated && (
          <button className="btn" disabled={printing || busy} onClick={() => setConfirm('save')}>
            <Save size={18} /> {t('mesh.save')}
          </button>
        )}
      </div>
      <ConfirmSheet
        open={confirm != null}
        title={confirm === 'save' ? t('mesh.save') : t('mesh.calibrate')}
        message={confirm === 'save' ? t('mesh.saveHint') : t('mesh.calibrateHint')}
        confirmLabel={confirm === 'save' ? t('mesh.save') : t('mesh.calibrate')}
        onConfirm={() =>
          confirm === 'save' ? run(() => gcode('SAVE_CONFIG'), t('mesh.saved')) : calibrate()
        }
        onClose={() => setConfirm(null)}
      />
    </section>
  );
}
