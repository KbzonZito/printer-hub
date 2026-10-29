import { describe, expect, it } from 'vitest';
import { contrast, deltaE, PLATE, TOOL_FALLBACK, visibleOnPlate } from './colors';
import { KIND_COLORS, KINDS } from './kinds';

describe('viewer colors', () => {
  it('every line kind stands out on the plate (≥ 3:1)', () => {
    for (const [i, c] of KIND_COLORS.entries())
      expect(contrast(c, PLATE), KINDS[i]).toBeGreaterThanOrEqual(3);
  });

  it('line kinds are clearly different from each other (ΔE ≥ 20)', () => {
    const close: string[] = [];
    for (let i = 0; i < KIND_COLORS.length; i++)
      for (let j = i + 1; j < KIND_COLORS.length; j++) {
        const d = deltaE(KIND_COLORS[i], KIND_COLORS[j]);
        if (d < 20) close.push(`${KINDS[i]}/${KINDS[j]} ${d.toFixed(1)}`);
      }
    expect(close).toEqual([]);
  });

  it('lightens dark filament colors so they show on the plate', () => {
    for (const c of ['#000000', '#1a1a1a', '#202060', ...TOOL_FALLBACK])
      expect(contrast(visibleOnPlate(c), PLATE)).toBeGreaterThanOrEqual(3);
    expect(visibleOnPlate('#ffffff')).toBe('#ffffff');
    expect(visibleOnPlate('nonsense')).toBe('#cccccc');
  });
});
