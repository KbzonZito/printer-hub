import type { SocketHandlers, Socket } from '../connection/transport';
import type { Printer } from '../store';

// The demo printer ("Try without a printer"): a printer with this host never touches the
// network. Its requests and socket go to a simulator inside the app (sim.ts), loaded only
// when it's first used.

export const DEMO_HOST = 'demo.printerhub';

export const isDemo = (p: Pick<Printer, 'host'> | null | undefined) => p?.host === DEMO_HOST;
export const isDemoUrl = (url: string) => url.startsWith(`http://${DEMO_HOST}:`);

const loadSim = () => import('./sim');

/** fetch() for the demo printer's URLs. */
export async function demoFetch(url: string, init?: RequestInit): Promise<Response> {
  const sim = await loadSim();
  return sim.handleRequest(url, init);
}

/** fetch(), or the simulator for the demo printer. */
export function fetchOrDemo(url: string, init?: RequestInit): Promise<Response> {
  return isDemoUrl(url) ? demoFetch(url, init) : fetch(url, init);
}

/** The JSON-RPC socket of the demo printer (see transport.ts). */
export function demoTransport(_url: string, handlers: SocketHandlers): Socket {
  let closed = false;
  let conn: { send: (data: string) => void; close: () => void } | null = null;
  const pending: string[] = [];
  void loadSim().then((sim) => {
    if (closed) return;
    conn = sim.connect((data) => {
      if (!closed) handlers.onMessage(data);
    });
    handlers.onOpen();
    pending.splice(0).forEach((d) => conn!.send(d));
  });
  return {
    send: (data) => (conn ? conn.send(data) : pending.push(data)),
    close: () => {
      closed = true;
      conn?.close();
    },
  };
}

/** An animated picture standing in for the camera: the toolhead moving over the bed. */
export const DEMO_CAMERA = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360"><rect width="640" height="360" fill="#15181d"/><path d="M90 300 L550 300 L500 220 L140 220 Z" fill="#2a3038"/><g fill="#ff7a1a"><rect x="220" y="250" width="70" height="30" rx="4"/><rect x="350" y="246" width="60" height="34" rx="4" opacity=".9"/></g><rect x="60" y="70" width="520" height="14" rx="4" fill="#3a414b"/><g><animateTransform attributeName="transform" type="translate" values="0 0;220 0;60 0;160 0;0 0" dur="6s" repeatCount="indefinite"/><rect x="190" y="60" width="60" height="70" rx="6" fill="#4a525e"/><path d="M212 130 L228 130 L222 150 L218 150 Z" fill="#d9a441"/></g><text x="24" y="40" font-family="sans-serif" font-size="20" fill="#8a929c">DEMO</text></svg>`,
)}`;

/** A new demo printer, ready to save. */
export function demoPrinter(base: Printer, name: string): Printer {
  return { ...base, name, host: DEMO_HOST, port: 7125, cameraMode: 'auto', cameraUrl: '' };
}
