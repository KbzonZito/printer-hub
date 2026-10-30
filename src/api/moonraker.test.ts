import { afterEach, describe, expect, it, vi } from 'vitest';
import { listDirectory, thumbnailUrl } from './moonraker';

const printer = {
  id: 'p',
  name: 'P',
  host: '192.168.1.177',
  port: 7125,
  cameraMode: 'auto' as const,
  cameraUrl: '',
};

afterEach(() => vi.unstubAllGlobals());

describe('Moonraker responses', () => {
  it('lists a folder: hides dot folders and non-G-code files, keeps paths relative to gcodes', async () => {
    const fetchMock = vi.fn(async (_url: string) =>
      Response.json({
        result: {
          dirs: [
            { dirname: '.thumbs', modified: 1, size: 0 },
            { dirname: 'Cables', modified: 2, size: 0 },
          ],
          files: [
            { filename: 'Winder.gcode', modified: 3, size: 100 },
            { filename: 'notes.txt', modified: 4, size: 5 },
          ],
        },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const r = await listDirectory(printer, 'Gridfinity');
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      'http://192.168.1.177:7125/server/files/directory?path=gcodes%2FGridfinity',
    );
    expect(r.dirs).toEqual([
      { dirname: 'Cables', name: 'Cables', path: 'Gridfinity/Cables', modified: 2, size: 0 },
    ]);
    expect(r.files).toEqual([{ path: 'Gridfinity/Winder.gcode', modified: 3, size: 100 }]);
  });

  it('builds the URL of the biggest thumbnail, next to the file', () => {
    const meta = {
      thumbnails: [
        { width: 32, height: 32, relative_path: '.thumbs/a-32x32.png' },
        { width: 300, height: 300, relative_path: '.thumbs/a-300x300.png' },
      ],
    };
    expect(thumbnailUrl(printer, 'Random Prints/a.gcode', meta)).toBe(
      'http://192.168.1.177:7125/server/files/gcodes/Random%20Prints/.thumbs/a-300x300.png',
    );
    // Without Moonraker thumbnails, the one the app read from the file.
    expect(thumbnailUrl(printer, 'a.gcode', { thumbnail_data: 'data:image/png;base64,x' })).toBe(
      'data:image/png;base64,x',
    );
  });
});
