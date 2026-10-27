import { describe, expect, it } from 'vitest';
import { DEFAULT_SEED, PALETTE_STYLES, paletteTokens, SEED_PRESETS } from './palette';

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// WCAG AA for normal text: 4.5:1.
const PAIRS: [string, string][] = [
  ['--text', '--bg'],
  ['--text', '--surface-3'],
  ['--muted', '--bg'],
  ['--muted', '--surface-2'],
  ['--accent', '--bg'],
  ['--accent', '--surface'],
  ['--on-accent', '--accent'],
  ['--on-accent-soft', '--accent-soft'],
  ['--danger', '--surface'],
  ['--on-danger', '--danger'],
];

describe('palette contrast', () => {
  const seeds = [DEFAULT_SEED, ...SEED_PRESETS];
  for (const style of PALETTE_STYLES) {
    for (const dark of [false, true]) {
      it(`${style} ${dark ? 'dark' : 'light'} meets 4.5:1 for every seed`, () => {
        const failures: string[] = [];
        for (const seed of seeds) {
          const tk = paletteTokens(seed, style, dark) as Record<string, string>;
          for (const [fg, bg] of PAIRS) {
            const ratio = contrast(tk[fg], tk[bg]);
            if (ratio < 4.5) failures.push(`${seed} ${fg}/${bg} ${ratio.toFixed(2)}`);
          }
        }
        expect(failures).toEqual([]);
      });
    }
  }
});
