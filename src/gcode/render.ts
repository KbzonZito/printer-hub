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

/**
 * The fitted view with the user's zoom on top (usePanZoom: scale and offset around the
 * center of a w × h frame).
 */
export function zoomedView(
  base: View,
  pz: { scale: number; x: number; y: number },
  w: number,
  h: number,
): View {
  return {
    scale: base.scale * pz.scale,
    tx: w / 2 + (base.tx - w / 2) * pz.scale + pz.x,
    ty: h / 2 + (base.ty - h / 2) * pz.scale + pz.y,
  };
}

/** Screen position (CSS pixels) of a bed point. */
export const toScreen = (v: View, x: number, y: number) => [
  x * v.scale + v.tx,
  -y * v.scale + v.ty,
];

/** Lines colored by kind (perimeter, infill…) or by tool / filament (multicolor prints). */
export type ColorBy = 'kind' | 'tool';

/** One Path2D per kind or tool, built once per layer and mode. */
const paths = {
  kind: new WeakMap<GcodeLayer, Path2D[]>(),
  tool: new WeakMap<GcodeLayer, Path2D[]>(),
};

function layerPaths(layer: GcodeLayer, groups: number, by: ColorBy): Path2D[] {
  let cached = paths[by].get(layer);
  if (cached) return cached;
  cached = Array.from({ length: groups }, () => new Path2D());
  const { points, polyStart } = layer;
  const group = by === 'kind' ? layer.polyKind : layer.polyTool;
  const n = polyStart.length;
  for (let p = 0; p < n; p++) {
    const from = polyStart[p];
    const to = p + 1 < n ? polyStart[p + 1] : points.length / 2;
    const path = cached[group[p]] ?? cached[cached.length - 1];
    path.moveTo(points[from * 2], points[from * 2 + 1]);
    for (let i = from + 1; i < to; i++) path.lineTo(points[i * 2], points[i * 2 + 1]);
  }
  paths[by].set(layer, cached);
  return cached;
}

export interface DrawOptions {
  /** One color per kind or per tool (see `by`). */
  colors: string[];
  by?: ColorBy;
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
  const ps = layerPaths(layer, opts.colors.length, opts.by ?? 'kind');
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

/** Moves without extrusion, as thin dashed lines. */
export function drawTravel(
  ctx: CanvasRenderingContext2D,
  layer: GcodeLayer,
  view: View,
  dpr: number,
  color: string,
) {
  const t = layer.travel;
  if (!t.length) return;
  setView(ctx, view, dpr);
  const px = 1 / (view.scale * dpr);
  ctx.lineWidth = px;
  ctx.setLineDash([4 * px, 4 * px]);
  ctx.strokeStyle = color;
  ctx.beginPath();
  for (let i = 0; i < t.length; i += 4) {
    ctx.moveTo(t[i], t[i + 1]);
    ctx.lineTo(t[i + 2], t[i + 3]);
  }
  ctx.stroke();
  ctx.setLineDash([]);
}

export interface LiveOptions {
  colors: string[];
  by: ColorBy;
  /** File byte being printed: polylines starting after it are still to come (drawn faint). */
  doneOffset: number | null;
  /** Objects (polyObject values) excluded from the print, drawn dashed and grey. */
  excluded: Set<number>;
}

/**
 * The layer being printed: what's done in full color, what's left faint and excluded parts
 * dashed. Not cached (it changes as the print advances); one layer is cheap to draw.
 */
export function drawLayerLive(
  ctx: CanvasRenderingContext2D,
  layer: GcodeLayer,
  view: View,
  dpr: number,
  opts: LiveOptions,
) {
  setView(ctx, view, dpr);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const px = 1 / (view.scale * dpr);
  const width = Math.max(0.42, px);
  const { points, polyStart, polyOffset, polyObject } = layer;
  const group = opts.by === 'kind' ? layer.polyKind : layer.polyTool;
  // One path per style and color, filled in a single pass over the polylines.
  const done = new Map<number, Path2D>();
  const todo = new Map<number, Path2D>();
  const excluded = new Path2D();
  const n = polyStart.length;
  for (let p = 0; p < n; p++) {
    const from = polyStart[p];
    const to = p + 1 < n ? polyStart[p + 1] : points.length / 2;
    let path: Path2D;
    if (opts.excluded.has(polyObject[p])) path = excluded;
    else {
      const map = opts.doneOffset != null && polyOffset[p] >= opts.doneOffset ? todo : done;
      path = map.get(group[p]) ?? new Path2D();
      map.set(group[p], path);
    }
    path.moveTo(points[from * 2], points[from * 2 + 1]);
    for (let i = from + 1; i < to; i++) path.lineTo(points[i * 2], points[i * 2 + 1]);
  }
  ctx.lineWidth = width;
  ctx.globalAlpha = 0.25;
  for (const [g, path] of todo) {
    ctx.strokeStyle = opts.colors[g] ?? opts.colors[opts.colors.length - 1];
    ctx.stroke(path);
  }
  ctx.globalAlpha = 1;
  for (const [g, path] of done) {
    ctx.strokeStyle = opts.colors[g] ?? opts.colors[opts.colors.length - 1];
    ctx.stroke(path);
  }
  ctx.globalAlpha = 0.6;
  ctx.setLineDash([3 * px, 3 * px]);
  ctx.lineWidth = Math.max(px, width * 0.5);
  ctx.strokeStyle = '#9aa0a6';
  ctx.stroke(excluded);
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
}

/** The nozzle: a ring at its X/Y position, the same size at any zoom. */
export function drawNozzle(
  ctx: CanvasRenderingContext2D,
  view: View,
  dpr: number,
  x: number,
  y: number,
  color: string,
) {
  const [sx, sy] = toScreen(view, x, y);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.beginPath();
  ctx.arc(sx, sy, 7, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = color;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(sx, sy, 2.5, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
}
