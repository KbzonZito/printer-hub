import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { KIND_INDEX } from './kinds';
import { layerAtOffset, type GcodeLayer } from './model';
import { GcodeParser, type ParserOptions } from './parser';

const enc = new TextEncoder();

function parse(input: string | Uint8Array, chunk = 0, opts?: ParserOptions) {
  const data = typeof input === 'string' ? enc.encode(input) : input;
  const p = new GcodeParser(opts);
  const layers: GcodeLayer[] = [];
  if (!chunk) layers.push(...p.push(data));
  else
    for (let i = 0; i < data.length; i += chunk)
      layers.push(...p.push(data.subarray(i, i + chunk)));
  const end = p.finish();
  return { layers: [...layers, ...end.layers], summary: end.summary };
}

const pts = (l: GcodeLayer) => Array.from(l.points);
const fixture = readFileSync(new URL('./fixtures/creality-print-block.gcode', import.meta.url));

describe('GcodeParser with a real Creality Print file', () => {
  const { layers, summary } = parse(new Uint8Array(fixture));

  it('reads the header and finds every layer', () => {
    expect(summary.slicer).toBe('Creality_Print V5.1.7.10471');
    expect(summary.layersHint).toBe(102);
    expect(layers).toHaveLength(102);
    expect(layers[0].z).toBeCloseTo(0.2);
    expect(layers[0].height).toBeCloseTo(0.2);
    expect(layers[101].z).toBeCloseTo(20.4);
    expect(summary.maxZ).toBeCloseTo(20.4);
  });

  it('knows the object, the tool, its color and the line kinds', () => {
    expect(summary.objects).toEqual(['BLOCK.STL_1_ID_0_COPY_0']);
    expect(summary.tools).toEqual([0]);
    expect(summary.toolColors).toEqual(['#ffffff']);
    for (const k of ['outerWall', 'innerWall', 'solid'] as const)
      expect(summary.kinds & (1 << KIND_INDEX[k])).toBeTruthy();
    // Every polyline of the model belongs to the object.
    expect(layers[50].polyObject.every((o) => o === 1)).toBe(true);
  });

  it('keeps the print on the bed, the object around its center (130, 130)', () => {
    // The purge line runs along the bed edges (X0 → Y0 → X150), so the bounds reach 0.
    const b = summary.bounds!;
    expect(b.minX).toBeGreaterThanOrEqual(0);
    expect(b.maxX).toBeLessThan(260);
    expect(b.minY).toBeGreaterThanOrEqual(0);
    expect(b.maxY).toBeLessThan(260);
    const p = pts(layers[50]);
    for (let i = 0; i < p.length; i++) expect(Math.abs(p[i] - 130)).toBeLessThan(40);
    // The purge line is part of the first layer.
    expect(pts(layers[0]).slice(0, 6)).toEqual([0, 150, 0, 0, 150, 0]);
  });

  it('orders layers by their position in the file', () => {
    for (let i = 1; i < layers.length; i++) {
      expect(layers[i].start).toBe(layers[i - 1].end);
      expect(layers[i].z).toBeGreaterThan(layers[i - 1].z);
    }
    expect(layerAtOffset(layers, layers[40].start + 10)).toBe(40);
    expect(layerAtOffset(layers, 0)).toBe(0);
    expect(layerAtOffset(layers, fixture.length)).toBe(101);
  });

  it('gives the same model whatever the chunk size', () => {
    for (const size of [1009, 7 * 1024, 64 * 1024]) {
      const r = parse(new Uint8Array(fixture), size);
      expect(r.layers).toHaveLength(102);
      expect(r.summary.points).toBe(summary.points);
      expect(pts(r.layers[30])).toEqual(pts(layers[30]));
      expect(Array.from(r.layers[30].polyOffset)).toEqual(Array.from(layers[30].polyOffset));
    }
  });
});

describe('GcodeParser cases', () => {
  it('reads numbers without a leading zero', () => {
    const { layers } = parse(';LAYER_CHANGE\n;Z:.2\nG1 X1 Y1\nG1 X1.5 Y-.5 E.3\n');
    expect(layers[0].z).toBeCloseTo(0.2);
    expect(pts(layers[0])).toEqual([1, 1, 1.5, -0.5]);
  });

  it('handles relative (M83) and absolute (M82 + G92) extrusion', () => {
    const rel = parse('M83\nG1 X0 Y0\nG1 X10 Y0 E1\nG1 X20 Y0 E-1\nG1 X30 Y0 E1\n');
    expect(rel.layers[0].polyStart.length).toBe(2); // the retracting move breaks the line
    const abs = parse('M82\nG1 X0 Y0\nG1 X10 Y0 E5\nG92 E0\nG1 X20 Y0 E1\nG1 X30 Y0 E1\n');
    // E goes 5 → (reset) 0 → 1 → 1: the last move doesn't extrude.
    expect(pts(abs.layers[0])).toEqual([0, 0, 10, 0, 20, 0]);
    expect(Array.from(abs.layers[0].travel)).toEqual([20, 0, 30, 0]);
  });

  it('turns arcs into points on the circle', () => {
    // Counter-clockwise half circle of radius 10 around (10, 0).
    const { layers } = parse('M83\nG1 X0 Y0\nG3 X20 Y0 I10 J0 E1\n', 0, { arcTolerance: 0.01 });
    const p = pts(layers[0]);
    expect(p.length / 2).toBeGreaterThan(20);
    for (let i = 0; i < p.length; i += 2)
      expect(Math.hypot(p[i] - 10, p[i + 1])).toBeCloseTo(10, 4);
    // Counter-clockwise from (0, 0) goes below the center (negative Y).
    expect(Math.min(...p.filter((_, i) => i % 2 === 1))).toBeCloseTo(-10, 1);
    expect(p.slice(-2)).toEqual([20, 0]);
  });

  it('supports the radius form of arcs and clockwise direction', () => {
    const { layers } = parse('M83\nG1 X0 Y0\nG2 X20 Y0 R10 E1\n');
    const ys = pts(layers[0]).filter((_, i) => i % 2 === 1);
    expect(Math.max(...ys)).toBeCloseTo(10, 1); // clockwise from (0,0) to (20,0) goes up
  });

  it('finds layers from Z when there are no layer comments, ignoring Z hops', () => {
    const g = [
      'M83',
      'G1 Z0.2',
      'G1 X0 Y0',
      'G1 X10 Y0 E1',
      'G1 Z0.6', // hop
      'G1 X20 Y20',
      'G1 Z0.2',
      'G1 X30 Y20 E1',
      'G1 Z0.4',
      'G1 X0 Y0',
      'G1 X10 Y0 E1',
    ].join('\n');
    const { layers } = parse(g);
    expect(layers.map((l) => l.z)).toEqual([0.2, 0.4]);
    expect(layers[0].polyStart.length).toBe(2);
  });

  it('reads Cura layers, taking the height from the first extrusion', () => {
    const g =
      ';LAYER:0\nG0 X0 Y0 Z0.3\n;TYPE:WALL-OUTER\nG1 X10 Y0 E1\n;LAYER:1\nG0 Z0.5\nG1 X0 Y0 E2\n';
    const { layers } = parse(g);
    expect(layers.map((l) => l.z)).toEqual([0.3, 0.5]);
    expect(layers[0].polyKind[0]).toBe(KIND_INDEX.outerWall);
  });

  it('adds a purge line before the first layer comment to the first layer', () => {
    const g =
      'M83\nG1 X0 Y0 Z0.3\nG1 X50 Y0 E5\n;LAYER_CHANGE\n;Z:0.2\nG1 X60 Y0 E1\n;LAYER_CHANGE\n;Z:0.4\nG1 X0 Y0 E1\n';
    const { layers } = parse(g);
    expect(layers).toHaveLength(2);
    expect(layers[0].z).toBeCloseTo(0.2);
    expect(layers[0].polyStart.length).toBe(1);
  });

  it('tags polylines with their kind, tool and object', () => {
    const g = [
      'EXCLUDE_OBJECT_DEFINE NAME=part_a CENTER=10,10',
      'EXCLUDE_OBJECT_DEFINE NAME=part_b',
      'M83',
      ';LAYER_CHANGE',
      'T1',
      'EXCLUDE_OBJECT_START NAME=part_b',
      ';TYPE:Sparse infill',
      'G1 X0 Y0',
      'G1 X10 Y0 E1',
      'EXCLUDE_OBJECT_END NAME=part_b',
      ';TYPE:Support',
      'G1 X20 Y0 E1',
    ].join('\n');
    const { layers, summary } = parse(g);
    const l = layers[0];
    expect(summary.objects).toEqual(['PART_A', 'PART_B']);
    expect(summary.tools).toEqual([1]);
    expect(Array.from(l.polyObject)).toEqual([2, 0]);
    expect(Array.from(l.polyTool)).toEqual([1, 1]);
    expect(Array.from(l.polyKind)).toEqual([KIND_INDEX.infill, KIND_INDEX.support]);
  });

  it('ignores comments, lower case and Windows line endings', () => {
    const g = 'm83\r\ng1 x0 y0 ; start\r\nG1 X5 Y5 E1 ; move\r\n; G1 X99 Y99 E1\r\n';
    const { layers } = parse(g);
    expect(pts(layers[0])).toEqual([0, 0, 5, 5]);
  });

  it('can start in the middle of a file (live mode, D11)', () => {
    const tail = 'G1 X1 Y1 E1\n;LAYER_CHANGE\n;Z:5\nG1 X2 Y2\nG1 X3 Y3 E1\n';
    const { layers } = parse(tail, 0, { startOffset: 1000, waitForLayer: true });
    expect(layers).toHaveLength(1);
    expect(layers[0].z).toBe(5);
    expect(layers[0].start).toBe(1000 + tail.indexOf(';LAYER_CHANGE'));
  });

  it('drops points closer than the minimum distance', () => {
    const { layers } = parse('M83\nG1 X0 Y0\nG1 X0.001 Y0 E.01\nG1 X10 Y0 E1\n');
    expect(pts(layers[0])).toEqual([0, 0, 10, 0]);
  });
});

describe('GcodeParser with the simulator G-code (scripts/gen-gcode.mjs)', () => {
  it('reads every layer, object, tool and color the generator wrote', async () => {
    // @ts-expect-error plain JS module without types
    const { generateGcode } = await import('../../scripts/gen-gcode.mjs');
    const buf: Uint8Array = generateGcode(1, { tools: 2 });
    const { layers, summary } = parse(new Uint8Array(buf), 4096);
    expect(layers).toHaveLength(summary.layersHint!);
    expect(summary.objects).toHaveLength(3);
    expect(summary.tools).toEqual([0, 1]);
    expect(summary.toolColors).toEqual(['#FF7A1A', '#2D9CDB']);
    // Z hops don't create layers; layers go up 0.2 mm at a time.
    expect(layers[5].z - layers[4].z).toBeCloseTo(0.2);
  });
});

describe('GcodeParser.seek (live mode, D11)', () => {
  it('draws the layers of a range in the middle of the file with the header modes', () => {
    const data = new Uint8Array(fixture);
    const full = parse(data);
    const p = new GcodeParser();
    // Header (M83, objects), then a range around layer 60.
    p.push(data.subarray(0, 64 * 1024));
    const from = full.layers[58].start + 500; // in the middle of layer 58
    const to = full.layers[63].start + 100; // a bit into layer 63
    p.seek(from);
    const got = [...p.push(data.subarray(from, to))];
    // Layer 58 is skipped (started before the range); 59–62 are complete; 63 is cut, so the
    // caller drops the last layer unless the range reached the end of the file.
    expect(got.map((l) => l.z)).toEqual(full.layers.slice(59, 63).map((l) => l.z));
    expect(pts(got[0])).toEqual(pts(full.layers[59]));
    expect(Array.from(got[1].polyOffset)).toEqual(Array.from(full.layers[60].polyOffset));
    expect(p.peekSummary().objects).toEqual(['BLOCK.STL_1_ID_0_COPY_0']);
  });
});
