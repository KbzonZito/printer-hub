import { describe, expect, it } from 'vitest';
import { formatCost, gramsFromLength, presetFor, printCost } from './cost';

const presets = [
  { id: 'pla', name: 'PLA', nozzle: 210, bed: 60, price: 20 },
  { id: 'petg', name: 'PETG', nozzle: 240, bed: 75 },
];

describe('cost', () => {
  it('matches the preset by material name', () => {
    expect(presetFor(presets, 'PLA;PLA')?.id).toBe('pla');
    expect(presetFor(presets, 'pla silk')?.id).toBe('pla');
    expect(presetFor(presets, 'ABS')).toBeUndefined();
    expect(presetFor(presets, undefined)).toBeUndefined();
  });

  it('converts length to grams (1 m of 1.75 mm PLA ≈ 3 g)', () => {
    expect(gramsFromLength(1000, 'PLA')).toBeCloseTo(2.98, 2);
  });

  it('uses the slicer weight, else the length', () => {
    expect(printCost(presets, { type: 'PLA', grams: 50 })).toBeCloseTo(1);
    expect(printCost(presets, { type: 'PLA', lengthMm: 10_000 })).toBeCloseTo(0.597, 3);
  });

  it('is null without a price or without filament', () => {
    expect(printCost(presets, { type: 'PETG', grams: 50 })).toBeNull();
    expect(printCost(presets, { type: 'PLA' })).toBeNull();
  });

  it('formats with the currency symbol', () => {
    expect(formatCost(1.5, '$', 'en')).toBe('$1.50');
    expect(formatCost(1234, '$', 'es')).toBe('$1234');
  });
});
