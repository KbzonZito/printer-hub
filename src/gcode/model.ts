// The parsed G-code: per-layer typed arrays, compact enough for files of tens of MB on a phone.
// See docs/plans/vista-previa-gcode.md (D4).

export interface GcodeLayer {
  /** Height of the layer (mm) and its thickness, when the slicer says. */
  z: number;
  height: number | null;
  /** Byte range in the file, to find the layer the printer is on (virtual_sdcard.file_position). */
  start: number;
  end: number;
  /** x, y pairs of the extrusion polylines, one after another. */
  points: Float32Array;
  /** First point (pair index) of each polyline. */
  polyStart: Uint32Array;
  /** File byte where each polyline starts. */
  polyOffset: Uint32Array;
  /** Line kind (kinds.ts), tool (T0…) and object (EXCLUDE_OBJECT_START, 0 = none) of each polyline. */
  polyKind: Uint8Array;
  polyTool: Uint8Array;
  polyObject: Uint16Array;
  /** Moves without extrusion: x1, y1, x2, y2 per segment. */
  travel: Float32Array;
}

export interface GcodeSummary {
  slicer: string | null;
  /** From the header ("; total layer number: 650"), known before the layers arrive. */
  layersHint: number | null;
  layerHeight: number | null;
  maxZ: number | null;
  /** Area covered by extrusion. */
  bounds: { minX: number; minY: number; maxX: number; maxY: number } | null;
  /** Object names in EXCLUDE_OBJECT order; polyObject = index + 1. */
  objects: string[];
  /** Tools used, and their colors from "; filament_colour = #…;#…" (end of the file). */
  tools: number[];
  toolColors: string[];
  /** Kinds present (bit per KINDS index). */
  kinds: number;
  bytes: number;
  points: number;
}

/** Index of the layer that contains a file byte (last layer starting at or before it). */
export function layerAtOffset(layers: GcodeLayer[], offset: number): number {
  let lo = 0;
  let hi = layers.length - 1;
  if (hi < 0) return -1;
  if (offset < layers[0].start) return 0;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (layers[mid].start <= offset) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** Bytes a layer takes in memory. */
export function layerBytes(l: GcodeLayer) {
  return (
    l.points.byteLength +
    l.polyStart.byteLength +
    l.polyOffset.byteLength +
    l.polyKind.byteLength +
    l.polyTool.byteLength +
    l.polyObject.byteLength +
    l.travel.byteLength
  );
}

/** The ArrayBuffers of a layer, to transfer it from the worker without copying. */
export function layerBuffers(l: GcodeLayer): ArrayBuffer[] {
  return [l.points, l.polyStart, l.polyOffset, l.polyKind, l.polyTool, l.polyObject, l.travel].map(
    (a) => a.buffer as ArrayBuffer,
  );
}
