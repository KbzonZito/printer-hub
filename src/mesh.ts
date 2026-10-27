// Bed mesh helpers: range, flatness and the heatmap color of each point.

export interface BedMesh {
  profile: string;
  /** Rows from the front of the bed (mesh_min Y) to the back; columns from left to right. */
  matrix: number[][];
  min: [number, number];
  max: [number, number];
}

export function meshStats(matrix: number[][]) {
  const values = matrix.flat();
  if (!values.length) return null;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  return { lo, hi, range: hi - lo };
}

/** How flat the bed is, from the highest to the lowest point (mm). */
export function flatness(range: number): 'good' | 'ok' | 'bad' {
  return range <= 0.1 ? 'good' : range <= 0.25 ? 'ok' : 'bad';
}

/**
 * Diverging color: blue below zero, neutral at zero, red above, scaled by the largest
 * deviation so the same mesh always looks the same whatever its offset.
 */
export function meshColor(value: number, maxAbs: number) {
  const t = maxAbs > 0 ? Math.max(-1, Math.min(1, value / maxAbs)) : 0;
  const hue = t < 0 ? 215 : 8;
  const strength = Math.abs(t);
  return `hsl(${hue} ${30 + strength * 55}% ${62 - strength * 18}%)`;
}
