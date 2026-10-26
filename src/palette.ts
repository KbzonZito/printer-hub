import {
  argbFromHex,
  DynamicScheme,
  Hct,
  hexFromArgb,
  MaterialDynamicColors as C,
  SchemeContent,
  SchemeExpressive,
  SchemeFidelity,
  SchemeFruitSalad,
  SchemeMonochrome,
  SchemeNeutral,
  SchemeRainbow,
  SchemeTonalSpot,
  SchemeVibrant,
} from '@material/material-color-utilities';
import { useEffect, useState } from 'react';
import { isNative, PrinterMonitor } from './native';
import type { PaletteStyle, Settings } from './store';

// Material 3 dynamic color: builds the app's color tokens from a seed color and a scheme
// style, the same way Android derives them from the wallpaper.

export const DEFAULT_SEED = '#ff7a2f';

export const SEED_PRESETS = [
  '#ff7a2f',
  '#e53935',
  '#d81b60',
  '#8e24aa',
  '#5e35b1',
  '#1e88e5',
  '#00897b',
  '#43a047',
  '#c0ca33',
  '#fdd835',
  '#6d4c41',
  '#607d8b',
];

export const PALETTE_STYLES: PaletteStyle[] = [
  'tonalSpot',
  'neutral',
  'vibrant',
  'expressive',
  'fidelity',
  'content',
  'rainbow',
  'fruitSalad',
  'monochrome',
];

const SCHEMES: Record<PaletteStyle, new (hct: Hct, dark: boolean, contrast: number) => DynamicScheme> =
  {
    tonalSpot: SchemeTonalSpot,
    neutral: SchemeNeutral,
    vibrant: SchemeVibrant,
    expressive: SchemeExpressive,
    fidelity: SchemeFidelity,
    content: SchemeContent,
    rainbow: SchemeRainbow,
    fruitSalad: SchemeFruitSalad,
    monochrome: SchemeMonochrome,
  };

export function buildScheme(seed: string, style: PaletteStyle, dark: boolean) {
  return new SCHEMES[style](Hct.fromInt(argbFromHex(seed)), dark, 0);
}

/** Primary, secondary and tertiary colors, for previews. */
export function previewColors(seed: string, style: PaletteStyle, dark: boolean) {
  const s = buildScheme(seed, style, dark);
  return [C.primary, C.secondary, C.tertiary].map((c) => hexFromArgb(c.getArgb(s)));
}

function tokens(seed: string, style: PaletteStyle, dark: boolean) {
  const s = buildScheme(seed, style, dark);
  const map = {
    '--bg': C.surface,
    '--surface': C.surfaceContainer,
    '--surface-2': C.surfaceContainerHigh,
    '--surface-3': C.surfaceContainerHighest,
    '--border': C.outlineVariant,
    '--text': C.onSurface,
    '--muted': C.onSurfaceVariant,
    '--accent': C.primary,
    '--on-accent': C.onPrimary,
    '--accent-soft': C.secondaryContainer,
    '--on-accent-soft': C.onSecondaryContainer,
    '--danger': C.error,
    '--on-danger': C.onError,
    '--danger-soft': C.errorContainer,
  };
  return Object.entries(map)
    .map(([name, color]) => `${name}:${hexFromArgb(color.getArgb(s))};`)
    .join('');
}

/** Overrides the static tokens in styles.css with ones generated from the seed. */
export function applyPalette(seed: string, style: PaletteStyle) {
  let el = document.getElementById('palette') as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement('style');
    el.id = 'palette';
    document.head.appendChild(el);
  }
  const dark = tokens(seed, style, true);
  const light = tokens(seed, style, false);
  el.textContent =
    `:root{${dark}}` +
    `@media (prefers-color-scheme: light){:root:not([data-theme='dark']){${light}}}` +
    `:root[data-theme='light']{${light}}`;
}

let systemColor: Promise<string | null> | null = null;
const CACHE_KEY = 'printer-hub:system-color';

function cachedSystemColor() {
  try {
    return localStorage.getItem(CACHE_KEY);
  } catch {
    return null;
  }
}

/** Android's Material You accent, or null when unavailable (browser, Android < 12). */
export function useSystemColor() {
  // The last known color avoids a flash of the default palette on startup.
  const [color, setColor] = useState<string | null>(() => (isNative ? cachedSystemColor() : null));
  useEffect(() => {
    if (!isNative) return;
    systemColor ??= PrinterMonitor.getSystemColor()
      .then((r) => r.color ?? null)
      .catch(() => null);
    systemColor.then((c) => {
      setColor(c);
      try {
        if (c) localStorage.setItem(CACHE_KEY, c);
        else localStorage.removeItem(CACHE_KEY);
      } catch {
        /* storage unavailable */
      }
    });
  }, []);
  return color;
}

/** The seed color the settings resolve to. */
export function useSeedColor(settings: Settings) {
  const system = useSystemColor();
  return settings.color === 'device' ? (system ?? DEFAULT_SEED) : settings.color;
}
