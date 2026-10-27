import { PrinterMonitor, type SocketEvent } from '../native';
import type { SocketHandlers, Transport } from './transport';

// WebSocket opened by Java (NativeSocket.java), so Moonraker sees no Origin header.

const open = new Map<string, SocketHandlers>();
let listening: Promise<unknown> | null = null;
let counter = 0;

function dispatch(e: SocketEvent) {
  const h = open.get(e.id);
  if (!h) return;
  if (e.type === 'open') h.onOpen();
  else if (e.type === 'message') h.onMessage(e.data ?? '');
  else {
    open.delete(e.id);
    h.onClose(e.code ?? 1006, e.reason ?? '');
  }
}

export const nativeTransport: Transport = (url, handlers) => {
  listening ??= PrinterMonitor.addListener('socketEvent', dispatch);
  const id = `ws${++counter}`;
  open.set(id, handlers);
  listening
    .then(() => PrinterMonitor.socketOpen({ id, url }))
    .catch((err: Error) => {
      if (open.delete(id)) handlers.onClose(1006, err.message);
    });
  return {
    send: (data) => {
      if (open.has(id)) PrinterMonitor.socketSend({ id, data }).catch(() => {});
    },
    close: () => {
      if (open.delete(id)) PrinterMonitor.socketClose({ id }).catch(() => {});
    },
  };
};
