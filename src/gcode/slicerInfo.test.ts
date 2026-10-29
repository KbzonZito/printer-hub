import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseDuration, parseHead, parseTail } from './slicerInfo';

const text = readFileSync(
  new URL('./fixtures/creality-print-block.gcode', import.meta.url),
  'utf8',
);

describe('slicer info from the file itself', () => {
  it('reads durations in every format', () => {
    expect(parseDuration('17m 58s')).toBe(1078);
    expect(parseDuration('3h28m')).toBe(12480);
    expect(parseDuration('1d 2h 3m 4s')).toBe(93784);
    expect(parseDuration('soon')).toBeNull();
  });

  it('reads the slicer, layers and complete thumbnails from the first kilobytes', () => {
    const head = parseHead(text.slice(0, 64 * 1024));
    expect(head.slicer).toBe('Creality Print V5.1.7.10471');
    expect(head.layers).toBe(102);
    expect(head.thumbnails.map((t) => t.width)).toEqual([96, 300]);
    expect(head.thumbnails[0].url).toMatch(/^data:image\/png;base64,iVBOR/);
    // With only 8 KB, the small thumbnail is complete and the big one is left out.
    expect(parseHead(text.slice(0, 8 * 1024)).thumbnails.map((t) => t.width)).toEqual([96]);
  });

  it('reads time, filament and temperatures from the end of the file', () => {
    expect(parseTail(text.slice(-128 * 1024))).toEqual({
      estimatedTime: 1078,
      filamentMm: 1663.23,
      filamentG: 4.96,
      filamentType: 'PLA',
      nozzleTemp: 220,
      bedTemp: 60,
      printerModel: 'Creality Hi',
    });
  });

  it('understands Cura', () => {
    const cura = ';FLAVOR:Marlin\n;TIME:5025\n;Filament used: 4.38m\n;Layer height: 0.2\n';
    expect(parseHead(cura).slicer).toBe('Cura');
    expect(parseTail(cura)).toMatchObject({ estimatedTime: 5025, filamentMm: 4380 });
  });
});

describe('completeMetadata', async () => {
  const { needsCompletion } = await import('../api/gcodeInfo');
  it('asks for the file only when something is missing, and only once', () => {
    const creality = { slicer: 'Unknown', object_height: 109.8 };
    expect(needsCompletion(creality, false)).toBe(true);
    expect(needsCompletion(creality, true)).toBe(true);
    expect(needsCompletion({ ...creality, completed: 'list' }, false)).toBe(false);
    expect(needsCompletion({ ...creality, completed: 'list' }, true)).toBe(true);
    expect(needsCompletion({ ...creality, completed: 'detail' }, true)).toBe(false);
    const full = {
      slicer: 'OrcaSlicer',
      estimated_time: 100,
      thumbnails: [{ width: 300, height: 300, relative_path: '.thumbs/a.png' }],
    };
    expect(needsCompletion(full, true)).toBe(false);
  });
});
