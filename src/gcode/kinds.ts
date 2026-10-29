// Line kinds: slicers name them differently (";TYPE:Outer wall", "External perimeter",
// "WALL-OUTER"…), so they're grouped into a few categories with one color each.

export const KINDS = [
  'outerWall',
  'innerWall',
  'infill',
  'solid',
  'support',
  'skirt',
  'tower',
  'other',
] as const;

export type Kind = (typeof KINDS)[number];

/** Index of each kind, as stored in GcodeLayer.polyKind. */
export const KIND_INDEX = Object.fromEntries(KINDS.map((k, i) => [k, i])) as Record<Kind, number>;

const RULES: [RegExp, Kind][] = [
  [/^(outer wall|external perimeter|wall-outer)$/, 'outerWall'],
  [/(wall|perimeter)/, 'innerWall'],
  [/^(sparse infill|internal infill|fill)$/, 'infill'],
  [/(solid|surface|bridge|gap|ironing|skin)/, 'solid'],
  [/support/, 'support'],
  [/(skirt|brim)/, 'skirt'],
  [/(prime tower|wipe tower|prime-tower)/, 'tower'],
];

/** Category for a ";TYPE:" value. */
export function kindFromType(type: string): number {
  const t = type.trim().toLowerCase();
  for (const [re, kind] of RULES) if (re.test(t)) return KIND_INDEX[kind];
  return KIND_INDEX.other;
}

/**
 * Color per kind (KINDS order) on the viewer's dark plate. Checked by colors.test.ts: at least
 * 3:1 against the plate (WCAG non-text contrast) and clearly different from each other.
 */
export const KIND_COLORS = [
  '#ff7043', // outer wall: orange
  '#ffd54f', // inner wall: yellow
  '#ba68c8', // infill: purple
  '#4fc3f7', // solid: sky blue
  '#66bb6a', // support: green
  '#b0bec5', // skirt / brim: light grey
  '#f06292', // prime tower: pink
  '#a1887f', // other: brown-grey
];
