import { useEffect, useRef, useState } from 'react';
import { Activity } from 'lucide-react';
import type { Printer } from '../store';
import { createConnection } from '.';
import type { Snapshot } from './PrinterConnection';

/**
 * Temporary diagnostic (phase 2, until step 2.7 wires the connection into the app):
 * opens a real-time connection and shows what arrives, to try the native transport.
 */
export function ConnectionTest({ printer }: { printer: Printer }) {
  const [running, setRunning] = useState(false);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [updates, setUpdates] = useState(0);
  const [events, setEvents] = useState(0);
  const startedAt = useRef(0);

  useEffect(() => {
    if (!running) return;
    const conn = createConnection(printer);
    startedAt.current = Date.now();
    setUpdates(0);
    setEvents(0);
    const off = conn.subscribe((s) => {
      setSnap(s);
      setUpdates((n) => n + 1);
    });
    conn.onEvent(() => setEvents((n) => n + 1));
    conn.start();
    return () => {
      off();
      conn.stop();
    };
  }, [running, printer.id]);

  const secs = Math.max(1, (Date.now() - startedAt.current) / 1000);
  const state = snap?.state;
  return (
    <div className="about-meta">
      <strong>Prueba de conexión en tiempo real</strong>
      {running && snap && (
        <>
          <div className="estimate-row">
            <span className="muted">Estado</span>
            <span>
              {state?.kind}
              {state?.kind === 'klippy' && ` (${state.klippyState}) ${state.message}`}
              {state?.kind === 'reconnecting' && ` · intento ${state.attempt}`}
            </span>
          </div>
          <div className="estimate-row">
            <span className="muted">Modo</span>
            <span>{snap.mode === 'realtime' ? 'Tiempo real' : 'Consulta periódica'}</span>
          </div>
          <div className="estimate-row">
            <span className="muted">Boquilla / cama</span>
            <span>
              {snap.status
                ? `${snap.status.extruder.temperature.toFixed(1)}° / ${snap.status.bed.temperature.toFixed(1)}°`
                : '—'}
            </span>
          </div>
          <div className="estimate-row">
            <span className="muted">Actualizaciones / avisos</span>
            <span>
              {(updates / secs).toFixed(1)}/s · {events}
            </span>
          </div>
        </>
      )}
      <button type="button" className="btn" onClick={() => setRunning(!running)}>
        <Activity size={18} /> {running ? 'Detener prueba' : 'Probar tiempo real'}
      </button>
    </div>
  );
}
