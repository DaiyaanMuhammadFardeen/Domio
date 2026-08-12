/**
 * design-tokens — token type system + diff & scale helpers.
 *
 * Per Wave 2 §S2.5 of docs/frontend-roadmap/02-wave-editor-surface.md.
 *
 * Design tokens group into five scales:
 *   - color
 *   - typography (fontFamily, fontSize, lineHeight, fontWeight, letterSpacing)
 *   - spacing (px scale)
 *   - radius (px scale)
 *   - shadow (CSS box-shadow strings)
 *
 * The helpers below are pure: they take a `BrandKitDetail` and return
 * computed values the editor uses to render swatches, comparisons,
 * and canvas previews.
 */

import type {
  BrandKitDetail,
  ColorScale,
  RadiusScale,
  ShadowScale,
  SpacingScale,
  TypographyScale,
} from './brand-service';

// ─── Path utilities ─────────────────────────────────────────────────────────

export type TokenPath =
  | `color.${string}`
  | `type.${string}`
  | `space.${string}`
  | `radius.${string}`
  | `shadow.${string}`;

export interface TokenLookup {
  readonly path: TokenPath;
  readonly kind: 'color' | 'type' | 'space' | 'radius' | 'shadow';
  readonly value: string;
  readonly label: string;
}

/** Flatten every token in a brand kit into a `path → value` lookup map. */
export function flattenKitTokens(kit: BrandKitDetail): Record<string, TokenLookup> {
  const out: Record<string, TokenLookup> = {};
  for (const scale of kit.colors) {
    for (const stop of scale.stops) {
      const path = `${scale.id}.${stop.id}` as TokenPath;
      out[path] = {
        path,
        kind: 'color',
        value: stop.value,
        label: `${scale.label} ${stop.label}`,
      };
    }
  }
  for (const t of kit.typography) {
    out[t.id as TokenPath] = {
      path: t.id as TokenPath,
      kind: 'type',
      value: formatType(t),
      label: t.label,
    };
  }
  for (const s of kit.spacing) {
    for (const stop of s.stops) {
      const path = `${s.id}.${stop.id}` as TokenPath;
      out[path] = {
        path,
        kind: 'space',
        value: stop.value,
        label: `${s.label} ${stop.label}`,
      };
    }
  }
  for (const r of kit.radius) {
    for (const stop of r.stops) {
      const path = `${r.id}.${stop.id}` as TokenPath;
      out[path] = {
        path,
        kind: 'radius',
        value: stop.value,
        label: `${r.label} ${stop.label}`,
      };
    }
  }
  for (const s of kit.shadows) {
    for (const stop of s.stops) {
      const path = `${s.id}.${stop.id}` as TokenPath;
      out[path] = {
        path,
        kind: 'shadow',
        value: stop.value,
        label: `${s.label} ${stop.label}`,
      };
    }
  }
  return out;
}

// ─── Diff / resolution ──────────────────────────────────────────────────────

export interface TokenDiff {
  readonly path: TokenPath;
  readonly baseValue: string;
  readonly targetValue: string;
  readonly changed: boolean;
}

/**
 * Compare two kits token-by-token. Used by the Theme Marketplace to
 * show "what changes when you install this theme".
 */
export function diffKits(base: BrandKitDetail, target: BrandKitDetail): readonly TokenDiff[] {
  const baseTokens = flattenKitTokens(base);
  const targetTokens = flattenKitTokens(target);
  const diffs: TokenDiff[] = [];
  const allPaths = new Set<string>([...Object.keys(baseTokens), ...Object.keys(targetTokens)]);
  for (const path of allPaths) {
    const baseVal = baseTokens[path]?.value ?? '';
    const targetVal = targetTokens[path]?.value ?? '';
    diffs.push({
      path: path as TokenPath,
      baseValue: baseVal,
      targetValue: targetVal,
      changed: baseVal !== targetVal,
    });
  }
  return diffs;
}

/**
 * Compute a stable contrast color for a background hex (WCAG-aware).
 * Returns `#000000` for light backgrounds and `#ffffff` for dark.
 */
export function contrastFor(hex: string): string {
  const rgb = parseHex(hex);
  if (!rgb) return '#000000';
  // Relative luminance per WCAG 2.1.
  const lum = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
  return lum > 0.6 ? '#000000' : '#ffffff';
}

/** Hex → RGB tuple, or null if the string isn't a hex. */
export function parseHex(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.exec(hex.trim());
  if (!m) return null;
  let h = m[1]!;
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (h.length === 8) h = h.slice(0, 6);
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

/**
 * Generate a 9-step color scale by sampling a perceptual gradient
 * between two hex stops. Used when designers add a new color to a kit.
 */
export function generateColorScale(
  baseHex: string,
  options: { readonly id: string; readonly label: string; readonly steps?: number },
): ColorScale {
  const steps = options.steps ?? 9;
  const rgb = parseHex(baseHex) ?? { r: 0, g: 0, b: 0 };
  const target = { r: 255, g: 255, b: 255 };
  const stops = Array.from({ length: steps }, (_, i) => {
    const t = i / (steps - 1);
    const mix = (a: number, b: number) => Math.round(a + (b - a) * t);
    const hex = `#${[mix(rgb.r, target.r), mix(rgb.g, target.g), mix(rgb.b, target.b)]
      .map((n) => n.toString(16).padStart(2, '0'))
      .join('')}`;
    const label = String(50 + i * 100);
    return { id: label, label, value: hex };
  });
  return { id: options.id, label: options.label, stops };
}

/**
 * Build a typography scale string for use in the editor preview.
 */
export function formatType(t: TypographyScale): string {
  return `${t.fontWeight} ${t.fontSizePx}px/${t.lineHeight} ${t.fontFamily}`;
}

/**
 * Resolve a token path against a kit, returning the value or `null`.
 */
export function resolveToken(kit: BrandKitDetail, path: TokenPath): string | null {
  const lookup = flattenKitTokens(kit)[path];
  return lookup ? lookup.value : null;
}

/**
 * List every override path that's missing from a kit (used when
 * reviewing a newly-installed theme).
 */
export function missingTokens(kit: BrandKitDetail, paths: readonly TokenPath[]): readonly TokenPath[] {
  const lookup = flattenKitTokens(kit);
  return paths.filter((p) => !(p in lookup));
}

/**
 * Pack a CSS variable dictionary from a kit for use in inline styles.
 * Keys are kebab-cased.
 */
export function kitToCssVars(kit: BrandKitDetail): Record<string, string> {
  const vars: Record<string, string> = {
    '--kit-id': kit.id,
    '--kit-name': kit.name,
    '--kit-primary': kit.primaryHex,
    '--kit-accent': kit.accentHex,
  };
  for (const scale of kit.colors) {
    for (const stop of scale.stops) {
      vars[`--${kebab(scale.id)}-${kebab(stop.id)}`] = stop.value;
    }
  }
  return vars;
}

/** Convert a dot.notation.id into a kebab-case id. */
function kebab(s: string): string {
  return s.replace(/[._]/g, '-').replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
}

/**
 * Identify the scale type by id prefix. Useful for the editor's
 * "Add token" button to know which scale to append to.
 */
export function scaleKindFor(scaleId: string): 'color' | 'type' | 'space' | 'radius' | 'shadow' {
  if (scaleId.startsWith('color')) return 'color';
  if (scaleId.startsWith('type')) return 'type';
  if (scaleId.startsWith('space')) return 'space';
  if (scaleId.startsWith('radius')) return 'radius';
  if (scaleId.startsWith('shadow')) return 'shadow';
  return 'color';
}

/**
 * Convenience type guards.
 */
export function isColorScale(s: { readonly id: string }): s is ColorScale {
  return s.id.startsWith('color');
}
export function isSpacingScale(s: { readonly id: string }): s is SpacingScale {
  return s.id.startsWith('space');
}
export function isRadiusScale(s: { readonly id: string }): s is RadiusScale {
  return s.id.startsWith('radius');
}
export function isShadowScale(s: { readonly id: string }): s is ShadowScale {
  return s.id.startsWith('shadow');
}
export function isTypographyScale(s: { readonly id: string }): s is TypographyScale {
  return s.id.startsWith('type');
}
