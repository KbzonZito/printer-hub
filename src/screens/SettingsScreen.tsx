import { useState } from 'react';
import { Check, Pencil, Plus, Printer as PrinterIcon, Trash2 } from 'lucide-react';
import { testConnection } from '../api/moonraker';
import { ConfirmSheet, Sheet, useToast } from '../components/ui';
import { newPrinter, useStore, type CameraMode, type Printer } from '../store';

const CAMERA_MODES: { id: CameraMode; label: string }[] = [
  { id: 'auto', label: 'Automático' },
  { id: 'webrtc', label: 'WebRTC (Creality)' },
  { id: 'mjpeg', label: 'MJPEG stream' },
  { id: 'snapshot', label: 'Snapshot' },
];

export function PrinterForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: Printer;
  onSave: (p: Printer) => void;
  onCancel?: () => void;
}) {
  const [p, setP] = useState(initial);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const set = <K extends keyof Printer>(k: K, v: Printer[K]) => setP((x) => ({ ...x, [k]: v }));
  const clean = { ...p, host: p.host.trim().replace(/^https?:\/\//, '').replace(/[/:].*$/, '') };

  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault();
        if (clean.host) onSave(clean);
      }}
    >
      <label>
        <span>Nombre</span>
        <input className="input" value={p.name} onChange={(e) => set('name', e.target.value)} />
      </label>
      <div className="row gap">
        <label className="grow">
          <span>IP de la impresora</span>
          <input
            className="input"
            placeholder="192.168.1.50"
            inputMode="url"
            autoCapitalize="off"
            value={p.host}
            onChange={(e) => set('host', e.target.value)}
            required
          />
        </label>
        <label style={{ width: 96 }}>
          <span>Puerto</span>
          <input
            className="input"
            type="number"
            value={p.port}
            onChange={(e) => set('port', Number(e.target.value) || 7125)}
          />
        </label>
      </div>
      <label>
        <span>Cámara</span>
        <select
          className="input"
          value={p.cameraMode}
          onChange={(e) => set('cameraMode', e.target.value as CameraMode)}
        >
          {CAMERA_MODES.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>URL de cámara (opcional)</span>
        <input
          className="input"
          placeholder="http://192.168.1.50:8080/?action=stream"
          autoCapitalize="off"
          value={p.cameraUrl}
          onChange={(e) => set('cameraUrl', e.target.value)}
        />
      </label>

      {result && <div className={`banner ${result.ok ? 'ok' : 'error'}`}>{result.text}</div>}

      <div className="row gap">
        <button
          type="button"
          className="btn grow"
          disabled={!clean.host || testing}
          onClick={async () => {
            setTesting(true);
            setResult(null);
            try {
              setResult({ ok: true, text: await testConnection(clean) });
            } catch (err) {
              setResult({ ok: false, text: (err as Error).message });
            }
            setTesting(false);
          }}
        >
          {testing ? <div className="loader small" /> : 'Probar conexión'}
        </button>
        {onCancel && (
          <button type="button" className="btn ghost" onClick={onCancel}>
            Cancelar
          </button>
        )}
        <button type="submit" className="btn primary grow" disabled={!clean.host}>
          Guardar
        </button>
      </div>
    </form>
  );
}

export function SettingsScreen() {
  const { printers, active, savePrinter, removePrinter, selectPrinter } = useStore();
  const [editing, setEditing] = useState<Printer | null>(null);
  const [deleting, setDeleting] = useState<Printer | null>(null);
  const toast = useToast();

  return (
    <div className="screen">
      <h2 className="section-title">Impresoras</h2>
      <div className="list">
        {printers.map((p) => (
          <div key={p.id} className={`list-item ${active?.id === p.id ? 'selected' : ''}`}>
            <button className="list-main" onClick={() => selectPrinter(p.id)}>
              <PrinterIcon size={20} />
              <div>
                <strong>{p.name}</strong>
                <span className="muted small">
                  {p.host}:{p.port}
                </span>
              </div>
              {active?.id === p.id && <Check size={18} className="accent" />}
            </button>
            <button className="btn icon ghost" onClick={() => setEditing(p)} aria-label="Editar">
              <Pencil size={16} />
            </button>
            <button className="btn icon ghost" onClick={() => setDeleting(p)} aria-label="Eliminar">
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>
      <button className="btn" onClick={() => setEditing(newPrinter())}>
        <Plus size={18} /> Añadir impresora
      </button>

      <h2 className="section-title">Acerca de</h2>
      <p className="muted small">
        Printer Hub se conecta a impresoras con Klipper a través de Moonraker (Creality Hi, K1, K2,
        Sovol, Voron, Elegoo…). Necesitas estar en la misma red Wi-Fi que la impresora.
      </p>

      <Sheet open={!!editing} onClose={() => setEditing(null)} title="Impresora">
        {editing && (
          <PrinterForm
            key={editing.id}
            initial={editing}
            onCancel={() => setEditing(null)}
            onSave={(p) => {
              savePrinter(p);
              setEditing(null);
              toast('Guardado');
            }}
          />
        )}
      </Sheet>
      <ConfirmSheet
        open={!!deleting}
        title={`¿Eliminar ${deleting?.name}?`}
        confirmLabel="Eliminar"
        danger
        onConfirm={() => deleting && removePrinter(deleting.id)}
        onClose={() => setDeleting(null)}
      />
    </div>
  );
}
