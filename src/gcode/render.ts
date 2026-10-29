import type { GcodeLayer } from './model';

// Draws a layer with Canvas 2D. Paths are built once per layer, in bed millimetres, and the
// canvas transform maps them to the screen (Y flipped: the back of the bed at the top).

export interface Frame {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Bed millimetres → CSS pixels: sx = x * scale + tx, sy = -y * scale + ty. */
export interface View {
  scale: number;
  tx: number;
  ty: number;
}

/** The view that fits `frame` in a w × h area with a margin. */
export function fitView(frame: Frame, w: number, h: number, margin = 16): View {
  const fw = frame.maxX - frame.minX || 1;
  const fh = frame.maxY - frame.minY || 1;
  const scale = Math.min((w - 2 * margin) / fw, (h - 2 * margin) / fh);
  return {
    scale,
    tx: (w - fw * scale) / 2 - frame.minX * scale,
    ty: (h - fh * scale) / 2 + frame.maxY * scale,
  };
}

/** One Path2D per line kind, built once per layer. */
const paths = new WeakMap<GcodeLayer, Path2D[]>();

function layerPaths(layer: GcodeLayer, kinds: number): Path2D[] {
  let cached = paths.get(layer);
  if (cached) return cached;
  cached = Array.from({ length: kinds }, () => new Path2D());
  const { points, polyStart, polyKind } = layer;
  const n = polyStart.length;
  for (let p = 0; p < n; p++) {
    const from = polyStart[p];
    const to = p + 1 < n ? polyStart[p + 1] : points.length / 2;
    const path = cached[polyKind[p]] ?? cached[cached.length - 1];
    path.moveTo(points[from * 2], points[from * 2 + 1]);
    for (let i = from + 1; i < to; i++) path.lineTo(points[i * 2], points[i * 2 + 1]);
  }
  paths.set(layer, cached);
  return cached;
}

export interface DrawOptions {
  colors: string[];
  /** Extrusion width in mm (lines never get thinner than one device pixel). */
  lineWidth?: number;
  alpha?: number;
  /** One color for everything (e.g. the faint layer below). */
  color?: string;
}

/** Applies the view (with the device pixel ratio) to the context. */
export function setView(ctx: CanvasRenderingContext2D, view: View, dpr: number) {
  ctx.setTransform(view.scale * dpr, 0, 0, -view.scale * dpr, view.tx * dpr, view.ty * dpr);
}

export function drawLayer(
  ctx: CanvasRenderingContext2D,
  layer: GcodeLayer,
  view: View,
  dpr: number,
  opts: DrawOptions,
) {
  setView(ctx, view, dpr);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(opts.lineWidth ?? 0.42, 1 / (view.scale * dpr));
  ctx.globalAlpha = opts.alpha ?? 1;
  const ps = layerPaths(layer, opts.colors.length);
  ps.forEach((path, k) => {
    ctx.strokeStyle = opts.color ?? opts.colors[k];
    ctx.stroke(path);
  });
  ctx.globalAlpha = 1;
}

/** Bed outline and a 10 mm grid. */
export function drawBed(
  ctx: CanvasRenderingContext2D,
  frame: Frame,
  view: View,
  dpr: number,
  colors: { plate: string; grid: string },
) {
  setView(ctx, view, dpr);
  ctx.fillStyle = colors.plate;
  ctx.fillRect(frame.minX, frame.minY, frame.maxX - frame.minX, frame.maxY - frame.minY);
  ctx.strokeStyle = colors.grid;
  ctx.lineWidth = 1 / (view.scale * dpr);
  ctx.beginPath();
  for (let x = Math.ceil(frame.minX / 10) * 10; x <= frame.maxX; x += 10) {
    ctx.moveTo(x, frame.minY);
    ctx.lineTo(x, frame.maxY);
  }
  for (let y = Math.ceil(frame.minY / 10) * 10; y <= frame.maxY; y += 10) {
    ctx.moveTo(frame.minX, y);
    ctx.lineTo(frame.maxX, y);
  }
  ctx.stroke();
}
