// A WebSocket "transport": the browser's WebSocket, or a native one on Android (see
// nativeTransport.ts) because Moonraker rejects the WebView's Origin header unless
// cors_domains allows localhost (docs/plans/creality-hi.md).

export interface SocketHandlers {
  onOpen: () => void;
  onMessage: (data: string) => void;
  /** The connection failed or was closed by the other side. */
  onClose: (code: number, reason: string) => void;
}

export interface Socket {
  send: (data: string) => void;
  /** Closes the connection. No handler is called after this. */
  close: () => void;
}

/** Opens one connection; each reconnection opens a new one. */
export type Transport = (url: string, handlers: SocketHandlers) => Socket;

export const webTransport: Transport = (url, handlers) => {
  let ws: WebSocket | null = new WebSocket(url);
  ws.onopen = () => handlers.onOpen();
  ws.onmessage = (e) => handlers.onMessage(typeof e.data === 'string' ? e.data : '');
  ws.onclose = (e) => {
    ws = null;
    handlers.onClose(e.code, e.reason);
  };
  return {
    send: (data) => ws?.send(data),
    close: () => {
      if (!ws) return;
      ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null;
      ws.close();
      ws = null;
    },
  };
};
