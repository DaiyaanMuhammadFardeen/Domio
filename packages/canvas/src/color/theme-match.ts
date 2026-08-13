/**
 * Theme matching — find the closest theme token to a sampled color. The
 * full theming engine lands in P07; this is the MVP "paste to match
 * destination" hook (see docs/development_phases/phase-03 §D.3).
 */

import { deltaE, rgbToHex, type Rgb } from './spaces.js';
import { hexToRgb } from './spaces.js';

export interface ThemeToken {
  name: string;
  value: string;
}

export interface ThemeMatchResult {
  token: ThemeToken | null;
  delta: number;
  /** True when the sampled color is out-of-gamut (Δ > 2.3). */
  outOfPalette: boolean;
}

export function matchTheme(sampled: Rgb, tokens: ThemeToken[]): ThemeMatchResult {
  let best: ThemeMatchResult = { token: null, delta: Infinity, outOfPalette: true };
  for (const token of tokens) {
    const rgb = hexToRgb(token.value);
    if (!rgb) continue;
    const d = deltaE(sampled, rgb);
    if (d < best.delta) {
      best = { token, delta: d, outOfPalette: d > 2.3 };
    }
  }
  return best;
}

export function fallbackPalette(): ThemeToken[] {
  return [
    { name: 'fg', value: '#0F172A' },
    { name: 'bg', value: '#FFFFFF' },
    { name: 'accent', value: '#60A5FA' },
    { name: 'muted', value: '#94A3B8' },
    { name: 'success', value: '#22C55E' },
    { name: 'danger', value: '#EF4444' },
  ];
}

export function describeColor(rgb: Rgb): string {
  return rgbToHex(rgb);
}
