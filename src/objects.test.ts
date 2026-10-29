import { describe, expect, it } from 'vitest';
import type { PrintObject } from './api/moonraker';
import { bedFrame, displayName, objectCenter, objectLabels, svgPoints, toSvg } from './objects';

const square = (x: number, y: number, s = 10): PrintObject => ({
  name: `SQ_${x}_${y}`,
  center: [x + s / 2, y + s / 2],
  polygon: [
    [x, y],
    [x + s, y],
    [x + s, y + s],
    [x, y + s],
  ],
});

describe('exclude object geometry', () => {
  it('uses the bed limits when known', () => {
    expect(bedFrame([], [0, 0], [260, 260])).toEqual({ minX: 0, minY: 0, maxX: 260, maxY: 260 });
  });

  it('falls back to the objects area with a margin', () => {
    const f = bedFrame([square(100, 100), square(150, 120)], null, null);
    expect(f).toEqual({ minX: 80, minY: 80, maxX: 180, maxY: 150 });
  });

  it('flips Y: the back of the bed (high Y) is at the top of the drawing', () => {
    const f = bedFrame([], [0, 0], [200, 200]);
    expect(toSvg([10, 190], f)).toEqual([10, 10]); // back left → top left
    expect(toSvg([10, 10], f)).toEqual([10, 190]); // front left → bottom left
  });

  it('keeps each object where it is on the bed', () => {
    const f = bedFrame([], [-5, -5], [255, 255]);
    expect(svgPoints(square(0, 0).polygon, f)).toBe(
      '5.00,255.00 15.00,255.00 15.00,245.00 5.00,245.00',
    );
  });

  it('finds the center from the outline when Klipper gives none', () => {
    expect(objectCenter({ ...square(0, 0), center: null })).toEqual([5, 5]);
    expect(objectCenter({ name: 'X', center: null, polygon: [] })).toBeNull();
  });

  it('shortens slicer names', () => {
    expect(displayName('3DBenchy.stl_id_0_copy_0')).toBe('3DBenchy');
    expect(displayName('Soporte_movil.3mf_id_2_copy_1')).toBe('Soporte movil');
    expect(displayName('PART_A')).toBe('PART A');
  });

  it('numbers copies of the same model', () => {
    const labels = objectLabels([
      { name: 'BENCHY.STL_ID_0_COPY_0', center: null, polygon: [] },
      { name: 'BENCHY.STL_ID_0_COPY_1', center: null, polygon: [] },
      { name: 'CUBE.STL_ID_1_COPY_0', center: null, polygon: [] },
    ]);
    expect([...labels.values()]).toEqual(['BENCHY 1', 'BENCHY 2', 'CUBE']);
  });
});
