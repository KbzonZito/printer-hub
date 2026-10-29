import { describe, expect, it } from 'vitest';
import { fitView, toScreen, zoomedView } from './gcode/render';
import { clampView, IDENTITY, zoomAt } from './usePanZoom';

describe('pan and zoom', () => {
  it('keeps the point under the fingers in place when zooming', () => {
    // A point 40 px right and 30 px below the center, zoomed 3×.
    const v = zoomAt(IDENTITY, 3, 40, 30);
    // Content point p maps to center + p * scale + offset: 40 → 40 * 3 + v.x must stay 40.
    expect(40 * v.scale + v.x).toBeCloseTo(40);
    expect(30 * v.scale + v.y).toBeCloseTo(30);
  });

  it('never zooms out below 1× or past the limit, and keeps the content covering the frame', () => {
    expect(clampView({ scale: 0.5, x: 10, y: 0 }, 100, 100, 5)).toEqual(IDENTITY);
    expect(clampView({ scale: 9, x: 0, y: 0 }, 100, 100, 5).scale).toBe(5);
    // At 2× a 100 px frame can move at most 50 px each way.
    expect(clampView({ scale: 2, x: 500, y: -500 }, 100, 100, 5)).toEqual({
      scale: 2,
      x: 50,
      y: -50,
    });
  });

  it('applies the zoom on top of the fitted bed view', () => {
    const frame = { minX: 0, minY: 0, maxX: 200, maxY: 200 };
    const base = fitView(frame, 400, 400, 0);
    // Without zoom, the bed center is the screen center and the back of the bed is at the top.
    expect(toScreen(base, 100, 100)).toEqual([200, 200]);
    expect(toScreen(base, 0, 200)).toEqual([0, 0]);
    // Zooming 2× around the center keeps the bed center there and doubles distances.
    const z = zoomedView(base, { scale: 2, x: 0, y: 0 }, 400, 400);
    expect(toScreen(z, 100, 100)).toEqual([200, 200]);
    expect(toScreen(z, 150, 100)).toEqual([400, 200]);
    // Same point fixed as in usePanZoom.
    const pz = zoomAt(IDENTITY, 2, 100, -50);
    const zz = zoomedView(base, pz, 400, 400);
    const before = toScreen(base, 150, 125);
    const after = toScreen(zz, 150, 125);
    expect(after[0]).toBeCloseTo(before[0]);
    expect(after[1]).toBeCloseTo(before[1]);
  });
});
