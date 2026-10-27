import type { TempPreset } from './store';

// Filament cost of a print, from the price per kg saved in the matching preheat preset.

/** g/cm³ of common materials; others use PLA's. */
const DENSITY: Record<string, number> = {
  PLA: 1.24,
  PETG: 1.27,
  ABS: 1.04,
  ASA: 1.07,
  TPU: 1.21,
  PA: 1.14,
  PC: 1.2,
};
const FILAMENT_DIAMETER_MM = 1.75;

/** The slicer may list one material per extruder ("PLA;PLA"); the first one is used. */
const firstMaterial = (type?: string) => type?.split(/[;,]/)[0]?.trim().toUpperCase() || '';

/** The preset whose name matches the material, e.g. "PLA" for "PLA" or "PLA Silk". */
export function presetFor(presets: TempPreset[], type?: string): TempPreset | undefined {
  const material = firstMaterial(type);
  if (!material) return undefined;
  return (
    presets.find((p) => p.name.trim().toUpperCase() === material) ??
    presets.find((p) => material.startsWith(p.name.trim().toUpperCase()))
  );
}

/** Grams for a filament length in mm. */
export function gramsFromLength(mm: number, type?: string) {
  const density = DENSITY[firstMaterial(type)] ?? DENSITY.PLA;
  const area = Math.PI * (FILAMENT_DIAMETER_MM / 2) ** 2; // mm²
  return ((mm * area) / 1000) * density;
}

/**
 * Cost of a print, or null when the material has no preset with a price. Uses the slicer's
 * weight when known, else the length (actual filament used in history).
 */
export function printCost(
  presets: TempPreset[],
  meta: { type?: string; grams?: number; lengthMm?: number },
): number | null {
  const price = presetFor(presets, meta.type)?.price;
  if (!price) return null;
  const grams = meta.grams || (meta.lengthMm ? gramsFromLength(meta.lengthMm, meta.type) : 0);
  return grams > 0 ? (grams / 1000) * price : null;
}

export function formatCost(value: number, currency: string, lang: string) {
  const digits = value >= 100 ? 0 : 2;
  const n = value.toLocaleString(lang, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  return `${currency}${n}`;
}
