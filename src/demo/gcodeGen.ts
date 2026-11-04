// Synthetic G-code in Creality Print / OrcaSlicer style, for the demo printer, the simulator
// (scripts/mock-moonraker.mjs) and the parser benchmark: layer comments, ;TYPE:, labelled
// objects, many G2/G3 arcs, numbers without a leading zero, retractions, Z hops, wipes,
// G92 E0 per layer and filament_colour at the end. No imports, so Node can load it as is.

/** "0.377" → ".377", "-0.5" → "-.5", like Creality Print. */
const n = (v: number, digits = 3) =>
  Number(v.toFixed(digits))
    .toString()
    .replace(/^(-?)0\./, '$1.');

interface Shape {
  name: string;
  cx: number;
  cy: number;
  r?: number;
  w?: number;
  h?: number;
}

export const OBJECTS: Shape[] = [
  { name: 'cylinder.stl_id_0_copy_0', cx: 95, cy: 140, r: 22 },
  { name: 'cylinder.stl_id_0_copy_1', cx: 165, cy: 140, r: 22 },
  { name: 'box.stl_id_1_copy_0', cx: 130, cy: 80, w: 50, h: 26 },
];

function circle(out: string[], o: Shape, r: number, type: string, de: number) {
  out.push(`;TYPE:${type}`);
  out.push(`G1 X${n(o.cx + r)} Y${n(o.cy)} F12000`);
  // Four quarter arcs, counter-clockwise (I/J relative to the start point).
  const quarters = [
    [o.cx, o.cy + r, -r, 0],
    [o.cx - r, o.cy, 0, -r],
    [o.cx, o.cy - r, r, 0],
    [o.cx + r, o.cy, 0, r],
  ];
  for (const [x, y, i, j] of quarters) out.push(`G3 X${n(x)} Y${n(y)} I${n(i)} J${n(j)} E${n(de)}`);
}

function rect(out: string[], o: Shape, inset: number, type: string, de: number) {
  const w = o.w ?? 0;
  const h = o.h ?? 0;
  const x0 = o.cx - w / 2 + inset;
  const x1 = o.cx + w / 2 - inset;
  const y0 = o.cy - h / 2 + inset;
  const y1 = o.cy + h / 2 - inset;
  out.push(`;TYPE:${type}`);
  out.push(`G1 X${n(x0)} Y${n(y0)} F12000`);
  for (const [x, y] of [
    [x1, y0],
    [x1, y1],
    [x0, y1],
    [x0, y0],
  ])
    out.push(`G1 X${n(x)} Y${n(y)} E${n(de * 4)}`);
}

/** Zigzag infill inside a box, `step` mm apart, rotated every layer. */
function infill(
  out: string[],
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
  step: number,
  layer: number,
  type: string,
) {
  out.push(`;TYPE:${type}`);
  const vertical = layer % 2 === 1;
  const [a0, a1, b0, b1] = vertical ? [minX, maxX, minY, maxY] : [minY, maxY, minX, maxX];
  let flip = false;
  for (let a = a0; a <= a1; a += step) {
    const [s, e] = flip ? [b1, b0] : [b0, b1];
    const p = (b: number, aa: number) => (vertical ? `X${n(aa)} Y${n(b)}` : `X${n(b)} Y${n(aa)}`);
    out.push(`G1 ${p(s, a)} F12000`);
    out.push(`G1 ${p(e, a)} E${n((b1 - b0) * 0.033)} F6000`);
    flip = !flip;
  }
}

function layerGcode(layer: number, z: number, tools: number) {
  const out: string[] = [];
  out.push(
    ';LAYER_CHANGE',
    `;Z:${n(z, 2)}`,
    ';HEIGHT:.2',
    ';BEFORE_LAYER_CHANGE',
    `;${n(z, 2)}`,
    'G92 E0',
  );
  out.push('G1 E-.8 F2400', ';WIPE_START', 'G1 X100 Y100 E-.05', ';WIPE_END');
  out.push(`G1 Z${n(z + 0.4, 2)} F600`, `G1 Z${n(z, 2)}`); // Z hop
  OBJECTS.forEach((o, k) => {
    if (tools > 1) out.push(`T${k % tools}`);
    out.push(`EXCLUDE_OBJECT_START NAME=${o.name}`, 'G1 E.8 F2400');
    if (o.r) {
      const r = o.r;
      circle(out, o, r, 'Outer wall', 0.9);
      circle(out, o, r - 0.42, 'Inner wall', 0.88);
      circle(out, o, r - 0.84, 'Inner wall', 0.86);
      const s = (r - 1.2) * 0.7;
      infill(
        out,
        o.cx - s,
        o.cy - s,
        o.cx + s,
        o.cy + s,
        layer < 4 ? 0.45 : 2,
        layer,
        layer < 4 ? 'Bottom surface' : 'Sparse infill',
      );
    } else {
      rect(out, o, 0, 'Outer wall', 1.2);
      rect(out, o, 0.42, 'Inner wall', 1.15);
      infill(
        out,
        o.cx - (o.w ?? 0) / 2 + 1,
        o.cy - (o.h ?? 0) / 2 + 1,
        o.cx + (o.w ?? 0) / 2 - 1,
        o.cy + (o.h ?? 0) / 2 - 1,
        layer < 4 ? 0.45 : 2,
        layer,
        layer < 4 ? 'Bottom surface' : 'Sparse infill',
      );
    }
    out.push('G1 E-.8 F2400', `EXCLUDE_OBJECT_END NAME=${o.name}`);
  });
  return out.join('\n') + '\n';
}

/** The objects as Klipper reports them (exclude_object), for the simulator. */
export function objectDefinitions(): {
  name: string;
  center: [number, number];
  polygon: [number, number][];
}[] {
  return OBJECTS.map((o) => {
    const [hw, hh] = o.r ? [o.r, o.r] : [(o.w ?? 0) / 2, (o.h ?? 0) / 2];
    return {
      name: o.name.toUpperCase(),
      center: [o.cx, o.cy] as [number, number],
      polygon: [
        [o.cx - hw, o.cy - hh],
        [o.cx + hw, o.cy - hh],
        [o.cx + hw, o.cy + hh],
        [o.cx - hw, o.cy + hh],
      ],
    };
  });
}

/** About `megabytes` of G-code (it repeats layers until the size is reached). */
export function generateGcode(megabytes = 4, { tools = 1 } = {}): string {
  const target = megabytes * 1e6;
  // Size of a typical layer, to put the layer count in the header like Creality Print.
  const perLayer = layerGcode(10, 2, tools).length;
  const layers = Math.max(2, Math.round(target / perLayer));
  const head = [
    '; HEADER_BLOCK_START',
    '; generated by Printer Hub (src/demo/gcodeGen.ts)',
    `; total layer number: ${layers}`,
    `; max_z_height: ${n(layers * 0.2, 2)}`,
    '; HEADER_BLOCK_END',
    '',
    '; THUMBNAIL_BLOCK_START',
    '; thumbnail begin 96x96 6000',
    ...Array.from(
      { length: 80 },
      () => `; ${'iVBORw0KGgoAAAANSUhEUgAAAGAAAABgCAYAAADimHc4AAAAAXNSR0IArs4c6QAAIABJREFUeF7t'}`,
    ),
    '; thumbnail end',
    '; THUMBNAIL_BLOCK_END',
    '',
    '; layer_height = 0.2',
    ...OBJECTS.map((o) => `EXCLUDE_OBJECT_DEFINE NAME=${o.name} CENTER=${o.cx},${o.cy}`),
    'M140 S60',
    'M104 S220',
    'G28',
    'G90',
    'M83',
    'T0',
    'G1 Z.2 F600',
    'G1 X5 Y20 F6000',
    'G1 X5 Y200 E15 F1500', // purge line
    'G92 E0',
    '',
  ].join('\n');
  const parts = [head];
  for (let l = 1; l <= layers; l++) parts.push(layerGcode(l, 0.2 * l, tools));
  parts.push(
    [
      'M104 S0',
      'M140 S0',
      '; CONFIG_BLOCK_START',
      `; filament_colour = ${['#FF7A1A', '#2D9CDB', '#27AE60', '#EB5757'].slice(0, tools).join(';')}`,
      '; layer_height = 0.2',
      '; CONFIG_BLOCK_END',
      '',
    ].join('\n'),
  );
  return parts.join('');
}
