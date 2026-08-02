/**
 * Phase 07 — Accessibility audit worker.
 *
 * Deterministic, pure functions that audit a theme's tokens against
 * the §4.7 / feature #44 acceptance criteria:
 *
 *  - WCAG 2.x contrast audit on every `role: content` token against
 *    every `role: background` token.  Returns a structured
 *    `ContrastFinding[]` with severity (BLOCK / WARN) and a suggested
 *    compliant pair (auto-suggest compliance).
 *  - APCA for `prefers-contrast: more` — body-text Lc ≥ 60 threshold.
 *  - Colorblind (CVD) safety simulation — Brettel/Vienot/Mollon
 *    dichromacy matrices for deuteranopia, protanopia, tritanopia.
 *    Verifies that the palette remains identifiable under each.
 *  - Colorblind-safe palette suggestion with ≥ 30° hue spacing in
 *    OKLCH (preserving brand identity via hue preservation).
 *  - Decorative / semantic distinction — `role: decorative` tokens
 *    are never contrast-checked.
 *
 * The worker entry point (not implemented here) wraps the audit
 * functions in a NATS consumer that publishes the result on
 * `a11y.audit.completed`.
 *
 * NOTE: the audit is intentionally deterministic and pure so it
 * can be tested without any network I/O.  The implementation is
 * the stability boundary; production may swap APCA for the
 * official `apca-w3` package later.
 */

import {
  hexToOklch,
  oklchToHex,
  wcagContrast,
  apcaContrast,
  deltaEOklch,
  clampToGamut,
} from '@domio/tokens';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type Severity = 'BLOCK' | 'WARN' | 'INFO';

export type CvdType = 'deuteranopia' | 'protanopia' | 'tritanopia';

/** A token's resolved color value as sRGB hex. */
export interface AuditColor {
  readonly tokenId: string;
  readonly hex: string;
  readonly role: 'content' | 'background' | 'decorative' | 'interactive' | 'brand';
}

/** A single WCAG / APCA contrast finding. */
export interface ContrastFinding {
  readonly kind: 'wcag' | 'apca';
  readonly severity: Severity;
  readonly fgTokenId: string;
  readonly bgTokenId: string;
  readonly ratio: number;
  readonly threshold: number;
  readonly suggestion: { fgHex: string; bgHex: string } | null;
}

/** A CVD safety finding. */
export interface CvdFinding {
  readonly kind: 'cvd';
  readonly severity: Severity;
  readonly cvsType: CvdType;
  readonly ambiguousPair: readonly [string, string];
  readonly deltaE: number;
}

/** A union of all possible a11y findings. */
export type A11yFinding = ContrastFinding | CvdFinding;

/** A complete audit result. */
export interface AuditResult {
  readonly contrast: readonly ContrastFinding[];
  readonly cvd: readonly CvdFinding[];
  readonly cvSafePalette: readonly { readonly hex: string; readonly L: number; readonly C: number; readonly H: number }[];
  readonly decorativeSkipped: readonly string[];
  readonly prefersContrastMore: { readonly bodyTokensFailing: readonly string[] };
}

// ---------------------------------------------------------------------------
// Input shape
// ---------------------------------------------------------------------------

export interface AuditInput {
  readonly colors: readonly AuditColor[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hexToSrgb(hex: string): { r: number; g: number; b: number } {
  const v = hex.replace('#', '').toLowerCase();
  return {
    r: parseInt(v.slice(0, 2), 16) / 255,
    g: parseInt(v.slice(2, 4), 16) / 255,
    b: parseInt(v.slice(4, 6), 16) / 255,
  };
}

// ---------------------------------------------------------------------------
// CVD simulation (Brettel / Vienot / Mollon, severity = 1.0)
// ---------------------------------------------------------------------------

type Mat3 = readonly [
  readonly [number, number, number],
  readonly [number, number, number],
  readonly [number, number, number],
];

const DEUTERANOPIA: Mat3 = [
  [0.431864902, 0.735493085, -0.167357984],
  [0.106337762, 0.856589968, 0.03707233],
  [0.015701805, 0.114720203, 0.869577992],
];
const PROTANOPIA: Mat3 = [
  [0.152593845, 1.052258217, -0.204852062],
  [0.114985733, 0.786691839, 0.098322428],
  [-0.003885416, 0.05498658, 0.948898836],
];
const TRITANOPIA: Mat3 = [
  [1.255876775, -0.076944824, -0.178931951],
  [-0.078372535, 0.930487073, 0.147885462],
  [0.004731298, 0.691427763, 0.303840939],
];

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function linearToSrgb(c: number): number {
  return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

function matApply(m: Mat3, r: number, g: number, b: number): [number, number, number] {
  return [
    m[0][0] * r + m[0][1] * g + m[0][2] * b,
    m[1][0] * r + m[1][1] * g + m[1][2] * b,
    m[2][0] * r + m[2][1] * g + m[2][2] * b,
  ];
}

export function simulateCvd(hex: string, kind: CvdType): string {
  const { r, g, b } = hexToSrgb(hex);
  const lr = srgbToLinear(r);
  const lg = srgbToLinear(g);
  const lb = srgbToLinear(b);
  const matrix =
    kind === 'deuteranopia' ? DEUTERANOPIA : kind === 'protanopia' ? PROTANOPIA : TRITANOPIA;
  const [sr, sg, sb] = matApply(matrix, lr, lg, lb);
  const toHex = (n: number): string =>
    Math.round(Math.max(0, Math.min(1, linearToSrgb(n))) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${toHex(sr)}${toHex(sg)}${toHex(sb)}`;
}

// ---------------------------------------------------------------------------
// WCAG audit
// ---------------------------------------------------------------------------

const WCAG_AA_NORMAL = 4.5;
const WCAG_AA_LARGE = 3;
const WCAG_AAA_NORMAL = 7;

function isLargeText(role: string): boolean {
  // "large" per WCAG = ≥ 18 pt regular or 14 pt bold; this audit
  // applies the AA-Large threshold to heading-like roles.
  return role === 'interactive';
}

function suggestCompliantPair(
  fg: AuditColor,
  bg: AuditColor,
  threshold: number,
): { fgHex: string; bgHex: string } | null {
  // Try progressively darker fg (raise lightness toward bg lightness,
  // preserving hue) until threshold is met.  Bail if no quick fix
  // found within a small chroma-preserving walk.
  const fgOklch = hexToOklch(fg.hex);
  const bgOklch = hexToOklch(bg.hex);
  const fgRgb = hexToSrgb(fg.hex);
  const bgRgb = hexToSrgb(bg.hex);
  if (wcagContrast([fgRgb.r, fgRgb.g, fgRgb.b], [bgRgb.r, bgRgb.g, bgRgb.b]) >= threshold) {
    return { fgHex: fg.hex, bgHex: bg.hex };
  }
  // Step fg lightness in increments of 0.05 toward the bg lightness
  // direction.  Cap at 60 iterations; if we can't reach the threshold
  // we return null (the user must pick manually).
  const Lstep = bgOklch[0] > fgOklch[0] ? -0.05 : 0.05;
  let L = fgOklch[0];
  for (let i = 0; i < 60; i++) {
    L += Lstep;
    if (L < 0 || L > 1) break;
    const [cL, cC, cH] = clampToGamut(L, fgOklch[1], fgOklch[2]);
    const hex = oklchToHex(cL, cC, cH);
    if (!hex) continue;
    const rgb = hexToSrgb(hex);
    if (wcagContrast([rgb.r, rgb.g, rgb.b], [bgRgb.r, bgRgb.g, bgRgb.b]) >= threshold) {
      return { fgHex: hex, bgHex: bg.hex };
    }
  }
  return null;
}

function auditWcag(colors: readonly AuditColor[]): ContrastFinding[] {
  const out: ContrastFinding[] = [];
  const bgs = colors.filter((c) => c.role === 'background');
  const fgs = colors.filter((c) => c.role === 'content' || c.role === 'interactive');
  const decoratives = new Set(
    colors.filter((c) => c.role === 'decorative').map((c) => c.tokenId),
  );
  for (const fg of fgs) {
    if (decoratives.has(fg.tokenId)) continue;
    for (const bg of bgs) {
      if (decoratives.has(bg.tokenId)) continue;
      const fgRgb = hexToSrgb(fg.hex);
      const bgRgb = hexToSrgb(bg.hex);
      const ratio = wcagContrast(
        [fgRgb.r, fgRgb.g, fgRgb.b],
        [bgRgb.r, bgRgb.g, bgRgb.b],
      );
      const threshold = isLargeText(fg.role) ? WCAG_AA_LARGE : WCAG_AA_NORMAL;
      if (ratio < threshold) {
        out.push({
          kind: 'wcag',
          severity: 'BLOCK',
          fgTokenId: fg.tokenId,
          bgTokenId: bg.tokenId,
          ratio,
          threshold,
          suggestion: suggestCompliantPair(fg, bg, threshold),
        });
      } else if (ratio < WCAG_AAA_NORMAL && !isLargeText(fg.role)) {
        out.push({
          kind: 'wcag',
          severity: 'WARN',
          fgTokenId: fg.tokenId,
          bgTokenId: bg.tokenId,
          ratio,
          threshold: WCAG_AAA_NORMAL,
          suggestion: null,
        });
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// APCA audit (prefers-contrast: more)
// ---------------------------------------------------------------------------

const APCA_BODY_THRESHOLD = 60;

function auditApca(colors: readonly AuditColor[]): ContrastFinding[] {
  const out: ContrastFinding[] = [];
  const bgs = colors.filter((c) => c.role === 'background');
  const body = colors.filter((c) => c.role === 'content');
  for (const fg of body) {
    for (const bg of bgs) {
      const fgRgb = hexToSrgb(fg.hex);
      const bgRgb = hexToSrgb(bg.hex);
      const lc = apcaContrast(
        [fgRgb.r, fgRgb.g, fgRgb.b],
        [bgRgb.r, bgRgb.g, bgRgb.b],
      );
      if (Math.abs(lc) < APCA_BODY_THRESHOLD) {
        out.push({
          kind: 'apca',
          severity: 'WARN',
          fgTokenId: fg.tokenId,
          bgTokenId: bg.tokenId,
          ratio: lc,
          threshold: APCA_BODY_THRESHOLD,
          suggestion: null,
        });
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// CVD audit
// ---------------------------------------------------------------------------

const CVD_DELTAE_THRESHOLD = 10;
const CVD_TYPES: readonly CvdType[] = ['deuteranopia', 'protanopia', 'tritanopia'];

function auditCvd(colors: readonly AuditColor[]): CvdFinding[] {
  const out: CvdFinding[] = [];
  const palette = colors.filter(
    (c) => c.role === 'content' || c.role === 'interactive' || c.role === 'brand',
  );
  for (const kind of CVD_TYPES) {
    const simulated: { tokenId: string; oklch: readonly [number, number, number] }[] = [];
    for (const c of palette) {
      const sim = simulateCvd(c.hex, kind);
      const oklch = hexToOklch(sim);
      simulated.push({ tokenId: c.tokenId, oklch });
    }
    for (let i = 0; i < simulated.length; i++) {
      for (let j = i + 1; j < simulated.length; j++) {
        const a = simulated[i]!;
        const b = simulated[j]!;
        const dE = deltaEOklch(a.oklch, b.oklch);
        if (dE <= CVD_DELTAE_THRESHOLD) {
          out.push({
            kind: 'cvd',
            severity: 'BLOCK',
            cvsType: kind,
            ambiguousPair: [a.tokenId, b.tokenId],
            deltaE: dE,
          });
        }
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// CV-safe palette suggestion (≥ 30° OKLCH hue spacing)
// ---------------------------------------------------------------------------

export function suggestCvSafePalette(
  colors: readonly AuditColor[],
): readonly { hex: string; L: number; C: number; H: number }[] {
  if (colors.length === 0) return [];
  const oklchPalette = colors.map((c) => {
    const [L, C, H] = hexToOklch(c.hex);
    return { hex: c.hex, L, C, H };
  });
  if (oklchPalette.length === 1) return oklchPalette;

  // Sort by hue to get a canonical order, then re-seed hues with at
  // least the larger of 30° or ideal equal spacing.
  const sorted = [...oklchPalette].sort((a, b) => a.H - b.H);
  const n = sorted.length;
  const targetSpacing = Math.max(30, 360 / n);
  const result: { hex: string; L: number; C: number; H: number }[] = [];
  let currentHue = sorted[0]!.H % 360;
  for (let i = 0; i < n; i++) {
    const seed = sorted[i]!;
    const newH = ((currentHue % 360) + 360) % 360;
    // Preserve L/C from seed where possible; clamp into sRGB gamut.
    const [cL, cC] = clampToGamut(seed.L, seed.C, newH) as unknown as [
      number,
      number,
      number,
    ];
    const hex = oklchToHex(cL, cC, newH) ?? seed.hex;
    result.push({ hex, L: cL, C: cC, H: newH });
    currentHue += targetSpacing;
  }
  return result;
}

// ---------------------------------------------------------------------------
// prefers-contrast: more summary
// ---------------------------------------------------------------------------

function prefersContrastMore(colors: readonly AuditColor[]): {
  bodyTokensFailing: readonly string[];
} {
  const failing = new Set<string>();
  const apca = auditApca(colors);
  for (const f of apca) {
    if (Math.abs(f.ratio) < APCA_BODY_THRESHOLD) failing.add(f.fgTokenId);
  }
  return { bodyTokensFailing: [...failing] };
}

// ---------------------------------------------------------------------------
// Main audit
// ---------------------------------------------------------------------------

export function auditAccessibility(input: AuditInput): AuditResult {
  const wcagFindings = auditWcag(input.colors);
  const apcaFindings = auditApca(input.colors);
  const cvdFindings = auditCvd(input.colors);
  const cvSafePalette = suggestCvSafePalette(
    input.colors.filter((c) => c.role !== 'decorative'),
  );
  const decorativeSkipped = input.colors
    .filter((c) => c.role === 'decorative')
    .map((c) => c.tokenId);
  return {
    contrast: [...wcagFindings, ...apcaFindings],
    cvd: cvdFindings,
    cvSafePalette,
    decorativeSkipped,
    prefersContrastMore: prefersContrastMore(input.colors),
  };
}