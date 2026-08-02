/**
 * @domio/tokens — Color space conversions.
 *
 * Pure helpers to convert between sRGB (linearized), OKLCH (perceptual),
 * and back.  No I/O, no allocations beyond the return value.
 *
 * The OKLCH math follows the CSS Color 4 spec
 * (https://www.w3.org/TR/css-color-4/#color-spaces).  Input channels
 * are expected to be in [0, 1] for sRGB.  OKLCH is (L in [0,1],
 * C in [0,~0.4], H in [0,360)).
 */

// ---------------------------------------------------------------------------
// sRGB → linear sRGB (gamma decode)
// ---------------------------------------------------------------------------

/**
 * sRGB companding inverse (gamma decode).
 *
 * Mirrors CSS Color 4 §5.2.1 sRGB-to-linear-sRGB transformation.
 */
export function srgbToLinear(c: number): number {
  if (c <= 0.04045) {
    return c / 12.92;
  }
  return Math.pow((c + 0.055) / 1.055, 2.4);
}

/**
 * Linear sRGB → sRGB (gamma encode).
 */
export function linearToSrgb(c: number): number {
  if (c <= 0.0031308) {
    return 12.92 * c;
  }
  return 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

// ---------------------------------------------------------------------------
// OKLab matrix (Björn Ottosson, 2020)
// ---------------------------------------------------------------------------

/**
 * Linear sRGB → OKLab (L, a, b).  L ∈ [0, 1], a/b unbounded but
 * typically within [-0.4, 0.4].
 *
 * https://bottosson.github.io/posts/oklab/
 */
export function linearSrgbToOklab(
  r: number,
  g: number,
  b: number,
): readonly [number, number, number] {
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;
  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);
  return [
    0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
    1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
    0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_,
  ];
}

/**
 * OKLab (L, a, b) → linear sRGB.
 */
export function oklabToLinearSrgb(
  L: number,
  a: number,
  b: number,
): readonly [number, number, number] {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;
  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
  ];
}

// ---------------------------------------------------------------------------
// OKLab ↔ OKLCH
// ---------------------------------------------------------------------------

/**
 * OKLab (L, a, b) → OKLCH (L, C, H).  H in degrees [0, 360).
 */
export function oklabToOklch(
  L: number,
  a: number,
  b: number,
): readonly [number, number, number] {
  const C = Math.sqrt(a * a + b * b);
  let H = (Math.atan2(b, a) * 180) / Math.PI;
  if (H < 0) H += 360;
  return [L, C, H];
}

/**
 * OKLCH (L, C, H) → OKLab (L, a, b).
 */
export function oklchToOklab(
  L: number,
  C: number,
  H: number,
): readonly [number, number, number] {
  const Hrad = (H * Math.PI) / 180;
  return [L, Math.cos(Hrad) * C, Math.sin(Hrad) * C];
}

// ---------------------------------------------------------------------------
// High-level sRGB ↔ OKLCH
// ---------------------------------------------------------------------------

export interface SrgbChannel {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

/**
 * sRGB (0–1) → OKLCH (L 0–1, C 0–~0.4, H 0–360°).
 */
export function srgbToOklch(r: number, g: number, b: number): readonly [number, number, number] {
  const lr = srgbToLinear(r);
  const lg = srgbToLinear(g);
  const lb = srgbToLinear(b);
  const [L, a, bv] = linearSrgbToOklab(lr, lg, lb);
  return oklabToOklch(L, a, bv);
}

/**
 * OKLCH → sRGB (0–1).  Returns null if out of gamut (clamping required
 * to render); caller decides whether to chroma-reduce and retry.
 */
export function oklchToSrgb(L: number, C: number, H: number): SrgbChannel | null {
  const [, a, b] = oklchToOklab(L, C, H);
  const [lr, lg, lb] = oklabToLinearSrgb(L, a, b);
  // Use a small tolerance to absorb float round-trip error.
  const EPS = 1e-6;
  if (lr < -EPS || lg < -EPS || lb < -EPS ||
      lr > 1 + EPS || lg > 1 + EPS || lb > 1 + EPS) {
    return null;
  }
  return {
    r: clamp01(linearToSrgb(Math.max(0, Math.min(1, lr)))),
    g: clamp01(linearToSrgb(Math.max(0, Math.min(1, lg)))),
    b: clamp01(linearToSrgb(Math.max(0, Math.min(1, lb)))),
  };
}

/**
 * sRGB hex string (`#rrggbb`) → OKLCH.
 */
export function hexToOklch(hex: string): readonly [number, number, number] {
  const v = hex.replace('#', '');
  const r = parseInt(v.slice(0, 2), 16) / 255;
  const g = parseInt(v.slice(2, 4), 16) / 255;
  const b = parseInt(v.slice(4, 6), 16) / 255;
  return srgbToOklch(r, g, b);
}

/**
 * OKLCH → sRGB hex string (`#rrggbb`).
 */
export function oklchToHex(L: number, C: number, H: number): string | null {
  const rgb = oklchToSrgb(L, C, H);
  if (rgb === null) return null;
  const toHex = (n: number) =>
    Math.round(n * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`;
}

// ---------------------------------------------------------------------------
// Gamut clamping (binary search on chroma)
// ---------------------------------------------------------------------------

/**
 * Reduce chroma until the OKLCH triple falls inside the sRGB gamut.
 * Used for "preserving brand identity" in the dark/light pair worker
 * (TH-04 risk in §7) — high-chroma brand colors need chroma-reduced
 * variants to render correctly.
 */
export function clampToGamut(
  L: number,
  C: number,
  H: number,
  maxIterations = 12,
): readonly [number, number, number] {
  if (oklchToSrgb(L, C, H) !== null) {
    return [L, C, H];
  }
  let low = 0;
  let high = C;
  for (let i = 0; i < maxIterations; i++) {
    const mid = (low + high) / 2;
    if (oklchToSrgb(L, mid, H) !== null) {
      low = mid;
    } else {
      high = mid;
    }
    if (high - low < 0.0005) break;
  }
  return [L, low, H];
}

// ---------------------------------------------------------------------------
// OKLCH ΔE (perceptual color distance)
// ---------------------------------------------------------------------------

/**
 * ΔE in OKLab (Euclidean) — used as a perceptual color distance metric.
 * Equivalent to ΔE_OK on small differences; commonly used as a perceptual
 * distance threshold (≤ 5 ≈ "near brand").
 */
export function deltaEOklch(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
): number {
  const dL = a[0] - b[0];
  const dC = a[1] - b[1];
  let dH = a[2] - b[2];
  // Hue is circular; take the shorter path.
  if (dH > 180) dH -= 360;
  if (dH < -180) dH += 360;
  return Math.sqrt(dL * dL + dC * dC + dH * dH);
}

// ---------------------------------------------------------------------------
// WCAG 2 contrast helpers
// ---------------------------------------------------------------------------

function relLuminanceSrgb(r: number, g: number, b: number): number {
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}

/**
 * WCAG 2.x contrast ratio between two sRGB colors (0–1 floats).
 * Returns a number in [1, 21].
 */
export function wcagContrast(
  fg: readonly [number, number, number],
  bg: readonly [number, number, number],
): number {
  const L1 = relLuminanceSrgb(fg[0], fg[1], fg[2]);
  const L2 = relLuminanceSrgb(bg[0], bg[1], bg[2]);
  const lighter = Math.max(L1, L2);
  const darker = Math.min(L1, L2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * APCA (WCAG 3 draft) lightness contrast for sRGB colors.
 *
 * Returns a signed Lc value; magnitude ≥ 60 is the threshold for body
 * text under `prefers-contrast: more`.  Implementation follows the SAPC
 * reference at https://github.com/Myndex/SAPC.
 *
 * Note: APCA is approximate — production should ship the official
 * `apca-w3` package; this in-tree version is sufficient for unit tests
 * and the lint service's offline audit.
 */
export function apcaContrast(
  fg: readonly [number, number, number],
  bg: readonly [number, number, number],
): number {
  const Lfg = relLuminanceSrgb(fg[0], fg[1], fg[2]);
  const Lbg = relLuminanceSrgb(bg[0], bg[1], bg[2]);
  const mainTRC = 2.4;
  const normBG = Math.pow(Lbg, mainTRC);
  const normFG = Math.pow(Lfg, mainTRC);
  let outputContrast = (Math.pow(normBG, 0.56) - Math.pow(normFG, 0.57)) * 1.14;
  if (Math.abs(outputContrast) < 0.1) outputContrast = 0;
  if (outputContrast > 0) outputContrast -= 0.027;
  else outputContrast += 0.027;
  return outputContrast * 100;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clamp01(n: number): number {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}