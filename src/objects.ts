import type { PrintObject } from './api/moonraker';

// Bed map for excluding objects: Klipper's bed coordinates (mm, Y towards the back) drawn in
// SVG (Y down). The SVG uses millimetres too, so only the Y axis has to be flipped.

export interface BedFrame {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** The bed's limits, or the area the objects cover (plus a margin) when they're unknown. */
export function bedFrame(
  objects: PrintObject[],
  bedMin: [number, number] | null,
  bedMax: [number, number] | null,
): BedFrame {
  if (bedMin && bedMax && bedMax[0] > bedMin[0] && bedMax[1] > bedMin[1]) {
    return { minX: bedMin[0], minY: bedMin[1], maxX: bedMax[0], maxY: bedMax[1] };
  }
  const pts = objects.flatMap((o) => (o.polygon.length ? o.polygon : o.center ? [o.center] : []));
  if (!pts.length) return { minX: 0, minY: 0, maxX: 220, maxY: 220 };
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const margin = 20;
  return {
    minX: Math.min(...xs) - margin,
    minY: Math.min(...ys) - margin,
    maxX: Math.max(...xs) + margin,
    maxY: Math.max(...ys) + margin,
  };
}

/** A bed point in SVG coordinates (Y flipped so the back of the bed is at the top). */
export function toSvg([x, y]: [number, number], f: BedFrame): [number, number] {
  return [x - f.minX, f.maxY - y];
}

export function svgPoints(polygon: [number, number][], f: BedFrame) {
  return polygon
    .map((p) => toSvg(p, f))
    .map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`)
    .join(' ');
}

/** Center of an object: Klipper's, or the average of its outline. */
export function objectCenter(o: PrintObject): [number, number] | null {
  if (o.center) return o.center;
  if (!o.polygon.length) return null;
  const n = o.polygon.length;
  return [o.polygon.reduce((s, p) => s + p[0], 0) / n, o.polygon.reduce((s, p) => s + p[1], 0) / n];
}

/** Slicer names are long ("Benchy.stl_id_0_copy_0"); this keeps the readable part. */
export function displayName(name: string) {
  return (
    name
      .replace(/_id_\d+_copy_\d+$/i, '')
      .replace(/\.(stl|3mf|obj|step)$/i, '')
      .replace(/_/g, ' ')
      .trim() || name
  );
}

/**
 * Readable labels for every object; copies of the same model get a number ("Benchy 2") so
 * two parts never look the same in the list.
 */
export function objectLabels(objects: PrintObject[]): Map<string, string> {
  const base = objects.map((o) => displayName(o.name));
  const counts = new Map<string, number>();
  base.forEach((b) => counts.set(b, (counts.get(b) ?? 0) + 1));
  const seen = new Map<string, number>();
  return new Map(
    objects.map((o, i) => {
      const b = base[i];
      if ((counts.get(b) ?? 0) < 2) return [o.name, b];
      const n = (seen.get(b) ?? 0) + 1;
      seen.set(b, n);
      return [o.name, `${b} ${n}`];
    }),
  );
}
