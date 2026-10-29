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
 * Color per kind (KINDS order), readable on the dark camera-like background of the viewer.
 * Provisional: the contrast check comes with the full viewer (plan, step G.5).
 */
export const KIND_COLORS = [
  '#ff6b4a', // outer wall
  '#ffc145', // inner wall
  '#b98cff', // infill
  '#4aa8ff', // solid
  '#46d39a', // support
  '#a0a6ad', // skirt / brim
  '#ff5fa2', // prime tower
  '#8a949e', // other
];
