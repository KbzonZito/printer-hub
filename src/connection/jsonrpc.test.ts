import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JsonRpc, RpcError } from './jsonrpc';

function setup(timeout = 1000) {
  const sent: any[] = [];
  const notes: [string, any[]][] = [];
  const rpc = new JsonRpc(
    (data) => sent.push(JSON.parse(data)),
    (method, params) => notes.push([method, params]),
    timeout,
  );
  return { rpc, sent, notes };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('JsonRpc', () => {
  it('sends requests with increasing ids and resolves their results', async () => {
    const { rpc, sent } = setup();
    const a = rpc.call('server.info');
    const b = rpc.call('printer.objects.query', { objects: { extruder: null } });
    expect(sent).toEqual([
      { jsonrpc: '2.0', id: 1, method: 'server.info' },
      {
        jsonrpc: '2.0',
        id: 2,
        method: 'printer.objects.query',
        params: { objects: { extruder: null } },
      },
    ]);
    rpc.handle(JSON.stringify({ jsonrpc: '2.0', id: 2, result: 'second' }));
    rpc.handle(JSON.stringify({ jsonrpc: '2.0', id: 1, result: { klippy_state: 'ready' } }));
    await expect(a).resolves.toEqual({ klippy_state: 'ready' });
    await expect(b).resolves.toBe('second');
  });

  it('turns JSON-RPC errors into RpcError with the code', async () => {
    const { rpc } = setup();
    const p = rpc.call('printer.objects.subscribe');
    rpc.handle(
      JSON.stringify({ id: 1, error: { code: 503, message: 'Klippy Host not connected' } }),
    );
    await expect(p).rejects.toMatchObject({ message: 'Klippy Host not connected', code: 503 });
    await expect(p).rejects.toBeInstanceOf(RpcError);
  });

  it('times out requests without an answer', async () => {
    const { rpc } = setup(1000);
    const p = rpc.call('server.info');
    vi.advanceTimersByTime(999);
    rpc.handle('{"id": 99, "result": 1}'); // someone else's answer
    vi.advanceTimersByTime(1);
    await expect(p).rejects.toThrow('server.info: timeout');
  });

  it('allows a custom timeout per call', async () => {
    const { rpc } = setup(10_000);
    const p = rpc.call('server.info', undefined, 50);
    vi.advanceTimersByTime(50);
    await expect(p).rejects.toThrow('timeout');
  });

  it('passes notifications on', () => {
    const { rpc, notes } = setup();
    rpc.handle(
      JSON.stringify({
        jsonrpc: '2.0',
        method: 'notify_status_update',
        params: [{ fan: { speed: 1 } }, 12.5],
      }),
    );
    rpc.handle(JSON.stringify({ jsonrpc: '2.0', method: 'notify_klippy_ready' }));
    expect(notes).toEqual([
      ['notify_status_update', [{ fan: { speed: 1 } }, 12.5]],
      ['notify_klippy_ready', []],
    ]);
  });

  it('ignores invalid messages and late answers', () => {
    const { rpc, notes } = setup();
    expect(() => rpc.handle('not json')).not.toThrow();
    expect(() => rpc.handle('{"id": 5, "result": 1}')).not.toThrow();
    expect(notes).toEqual([]);
  });

  it('fails every pending request at once', async () => {
    const { rpc } = setup();
    const a = rpc.call('a');
    const b = rpc.call('b');
    rpc.failAll('closed');
    await expect(a).rejects.toThrow('closed');
    await expect(b).rejects.toThrow('closed');
  });

  it('rejects when sending fails', async () => {
    const rpc = new JsonRpc(
      () => {
        throw new Error('socket closed');
      },
      () => {},
    );
    await expect(rpc.call('server.info')).rejects.toThrow('server.info: socket closed');
  });
});
