// Colors of the G-code viewer, which always has a dark background (like the camera viewer),
// so lines look the same in the light and dark themes.

export const PLATE = '#1b1d21';

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1, 7), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const lin = (c: number) => {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

export function luminance(hex: string) {
  const [r, g, b] = rgb(hex).map(lin);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** CIE Lab, to measure how different two colors look (ΔE). */
export function lab(hex: string): [number, number, number] {
  const [r, g, b] = rgb(hex).map(lin);
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const x = f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047);
  const y = f(0.2126 * r + 0.7152 * g + 0.0722 * b);
  const z = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

export function deltaE(a: string, b: string) {
  const [l1, a1, b1] = lab(a);
  const [l2, a2, b2] = lab(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}

/** Lightens a color until it stands out on the plate (3:1), e.g. black filament. */
export function visibleOnPlate(hex: string): string {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return '#cccccc';
  let [r, g, b] = rgb(hex);
  for (let i = 0; i < 20 && contrast(toHex(r, g, b), PLATE) < 3; i++) {
    r += (255 - r) * 0.15;
    g += (255 - g) * 0.15;
    b += (255 - b) * 0.15;
  }
  return toHex(r, g, b);
}

function toHex(r: number, g: number, b: number) {
  return `#${[r, g, b].map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`;
}

/** Colors for tools without a filament_colour (or before it arrives at the end of the file). */
export const TOOL_FALLBACK = ['#ff8a50', '#4fc3f7', '#aed581', '#f06292', '#ffd54f', '#ba68c8'];
