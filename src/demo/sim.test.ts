import { afterAll, describe, expect, it, vi } from 'vitest';
import { connect, handleRequest } from './sim';

const BASE = 'http://demo.printerhub:7125';
const get = async (path: string, init?: RequestInit) =>
  (await (await handleRequest(BASE + path, init)).json()).result;

afterAll(() => vi.useRealTimers());

describe('demo printer', () => {
  it('answers like Moonraker', async () => {
    const info = await get('/server/info');
    expect(info.klippy_state).toBe('ready');
    expect(info.components).toContain('spoolman');
    const { status } = await get('/printer/objects/query?print_stats=state,filename');
    expect(status.print_stats).toEqual({ state: 'printing', filename: 'Benchy_PLA_0.2mm.gcode' });
  });

  it('lists folders and files', async () => {
    const root = await get('/server/files/directory?path=gcodes');
    expect(root.dirs.map((d: { dirname: string }) => d.dirname)).toEqual(['models']);
    expect(root.files.map((f: { filename: string }) => f.filename)).toContain(
      'Calibration_cube.gcode',
    );
    const meta = await get('/server/files/metadata?filename=Calibration_cube.gcode');
    expect(meta.thumbnail_data).toMatch(/^data:image\/svg\+xml/);
  });

  it('serves G-code with HTTP ranges', async () => {
    const res = await handleRequest(`${BASE}/server/files/gcodes/Calibration_cube.gcode`, {
      headers: { Range: 'bytes=0-99' },
    });
    expect(res.status).toBe(206);
    expect(res.headers.get('Content-Range')).toMatch(/^bytes 0-99\/\d+$/);
    expect((await res.text()).length).toBe(100);
  });

  it('starts, pauses and cancels prints, and keeps them in the history', async () => {
    await get('/printer/print/start?filename=Calibration_cube.gcode', { method: 'POST' });
    let { status } = await get('/printer/objects/query?print_stats=state,filename');
    expect(status.print_stats).toEqual({ state: 'printing', filename: 'Calibration_cube.gcode' });
    await get('/printer/print/pause', { method: 'POST' });
    ({ status } = await get('/printer/objects/query?print_stats=state'));
    expect(status.print_stats.state).toBe('paused');
    await get('/printer/print/cancel', { method: 'POST' });
    const { jobs } = await get('/server/history/list?limit=1');
    expect(jobs[0]).toMatchObject({ filename: 'Calibration_cube.gcode', status: 'cancelled' });
  });

  it('sends status updates over the socket after subscribing', async () => {
    const messages: { id?: number; method?: string; result?: unknown }[] = [];
    const socket = connect((data) => messages.push(JSON.parse(data)));
    socket.send(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'printer.objects.subscribe',
        params: { objects: { extruder: ['target'] } },
      }),
    );
    await vi.waitFor(() => expect(messages.some((m) => m.id === 1)).toBe(true));
    socket.send(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'printer.gcode.script',
        params: { script: 'M104 S230' },
      }),
    );
    await vi.waitFor(() =>
      expect(
        messages.some(
          (m) =>
            m.method === 'notify_status_update' &&
            JSON.stringify(m).includes('"extruder":{"target":230}'),
        ),
      ).toBe(true),
    );
    socket.close();
  });
});
