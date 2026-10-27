// JSON-RPC 2.0 over a socket: requests with ids and timeouts, plus notifications
// (messages without an id, like notify_status_update).

export class RpcError extends Error {
  constructor(
    message: string,
    readonly code?: number,
  ) {
    super(message);
  }
}

interface Pending {
  resolve: (value: any) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class JsonRpc {
  private nextId = 1;
  private pending = new Map<number, Pending>();

  constructor(
    private readonly send: (data: string) => void,
    private readonly onNotification: (method: string, params: any[]) => void,
    private readonly defaultTimeout = 10_000,
  ) {}

  call<T = any>(method: string, params?: object, timeout = this.defaultTimeout): Promise<T> {
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new RpcError(`${method}: timeout`));
      }, timeout);
      this.pending.set(id, { resolve, reject, timer });
      try {
        this.send(JSON.stringify({ jsonrpc: '2.0', id, method, ...(params ? { params } : {}) }));
      } catch (err) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(new RpcError(`${method}: ${(err as Error).message}`));
      }
    });
  }

  /** Feeds a message received from the socket. */
  handle(data: string) {
    let msg: any;
    try {
      msg = JSON.parse(data);
    } catch {
      return;
    }
    if (msg.id == null) {
      if (typeof msg.method === 'string') this.onNotification(msg.method, msg.params ?? []);
      return;
    }
    const p = this.pending.get(msg.id);
    if (!p) return;
    this.pending.delete(msg.id);
    clearTimeout(p.timer);
    if (msg.error) p.reject(new RpcError(msg.error.message ?? 'JSON-RPC error', msg.error.code));
    else p.resolve(msg.result);
  }

  /** Rejects every request still waiting, e.g. when the socket closes. */
  failAll(reason: string) {
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(new RpcError(reason));
    }
    this.pending.clear();
  }
}
