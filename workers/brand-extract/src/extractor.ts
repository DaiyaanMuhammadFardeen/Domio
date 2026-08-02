/**
 * Phase 07 — URL → brand kit extractor.
 *
 * The extractor is a deterministic, pure function that takes a
 * pre-fetched HTML payload (the actual HTTP fetch is performed by the
 * NATS-publisher or by a separate fetcher worker) and produces a
 * candidate brand kit with:
 *
 *  - Logo URLs (light/dark/mono) — `<link rel="icon">`, `<meta
 *    property="og:image">`, etc.  The list is reduced to the highest
 *    confidence matches.
 *  - Color palette — parsed from inline CSS, `<meta name="theme-color">`
 *    tags, and any inline `style="color: …"` declarations on the
 *    landing page.
 *  - Font families — extracted from inline `@font-face` declarations
 *    and any `font-family` CSS at the body level.
 *  - Confidence scores per category (0..1).
 *  - Attribution — `og:site_name`, `og:title`, etc.
 *
 * The extraction is intentionally a pure function so it can be tested
 * without any network I/O.  The worker entry point (not implemented
 * here) wraps `extractBrandKit` in a NATS consumer that publishes
 * the result on `brand.extract.completed`.
 *
 * NOTE: the implementation is intentionally lightweight; production
 * should swap this for a HTML parser (parse5 / linkedom) and a real
 * color-clustering pass.  The public function signature is the
 * stability boundary.
 */

import { oklchToHex, srgbToOklch } from '@domio/tokens';
import { validateTokenId } from '@domio/tokens';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type LogoVariant = 'light' | 'dark' | 'mono';

export interface ExtractedLogo {
  readonly variant: LogoVariant;
  readonly url: string;
  readonly confidence: number;
}

export interface ExtractedPaletteColor {
  readonly hex: string;
  readonly occurrences: number;
  readonly source: string;
  readonly confidence: number;
}

export interface ExtractedFont {
  readonly family: string;
  readonly occurrences: number;
  readonly confidence: number;
}

export interface BrandExtractionResult {
  readonly attribution: Record<string, string>;
  readonly logos: readonly ExtractedLogo[];
  readonly palette: readonly ExtractedPaletteColor[];
  readonly fonts: readonly ExtractedFont[];
  readonly imageryRules: {
    readonly allowedSources: readonly string[];
    readonly minResolution: { width: number; height: number };
  };
  readonly confidenceScores: {
    readonly logos: number;
    readonly palette: number;
    readonly fonts: number;
  };
  readonly stages: readonly string[];
}

// ---------------------------------------------------------------------------
// Extraction primitives
// ---------------------------------------------------------------------------

const STAGE_FETCH = 'fetch';
const STAGE_PARSE = 'parse';
const STAGE_COLORS = 'colors';
const STAGE_FONTS = 'fonts';
const STAGE_LOGO = 'logo';

const HEX_FROM_SRGB = (r: number, g: number, b: number): string => {
  const toHex = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v * 255))).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
};

function parseHex(input: string): { r: number; g: number; b: number } | null {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(input.trim());
  if (!m) return null;
  const v = m[1]!;
  return {
    r: parseInt(v.slice(0, 2), 16) / 255,
    g: parseInt(v.slice(2, 4), 16) / 255,
    b: parseInt(v.slice(4, 6), 16) / 255,
  };
}

function parseRgb(input: string): { r: number; g: number; b: number } | null {
  const m = /rgba?\(([^)]+)\)/i.exec(input);
  if (!m) return null;
  const parts = m[1]!.split(',').map((s) => s.trim());
  if (parts.length < 3) return null;
  const toFloat = (s: string): number => {
    const n = parseFloat(s);
    if (Number.isFinite(n)) return n;
    if (s.endsWith('%')) return parseFloat(s) / 100;
    return NaN;
  };
  const r = toFloat(parts[0]!);
  const g = toFloat(parts[1]!);
  const b = toFloat(parts[2]!);
  if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) return null;
  return { r, g, b };
}

function extractColors(html: string): Map<string, { source: string; count: number }> {
  const out = new Map<string, { source: string; count: number }>();

  // <meta name="theme-color" content="#fa3322">
  const themeColorRe = /<meta\s+name=["']theme-color["']\s+content=["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = themeColorRe.exec(html)) !== null) {
    addColor(out, m[1]!, 'theme-color');
  }

  // <meta name="msapplication-TileColor" content="#fa3322">
  const tileColorRe = /<meta\s+name=["']msapplication-TileColor["']\s+content=["']([^"']+)["']/gi;
  while ((m = tileColorRe.exec(html)) !== null) {
    addColor(out, m[1]!, 'tile-color');
  }

  // Inline style="color: #fa3322" or "background-color: …"
  const styleRe = /style\s*=\s*["']([^"']+)["']/gi;
  while ((m = styleRe.exec(html)) !== null) {
    const s = m[1]!;
    const colorRe = /(?:color|background(?:-color)?)\s*:\s*([^;]+)/gi;
    let cm: RegExpExecArray | null;
    while ((cm = colorRe.exec(s)) !== null) {
      addColor(out, cm[1]!, 'inline-style');
    }
  }

  // Embedded CSS: <style>…</style>
  const cssRe = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  while ((m = cssRe.exec(html)) !== null) {
    const css = m[1]!;
    const hexRe = /#[0-9a-fA-F]{6}\b/g;
    let hm: RegExpExecArray | null;
    while ((hm = hexRe.exec(css)) !== null) {
      addColor(out, hm[0], 'embedded-css');
    }
  }

  return out;
}

function addColor(out: Map<string, { source: string; count: number }>, raw: string, source: string): void {
  const hex = parseHex(raw) ? raw.trim().toLowerCase() : null;
  const rgb = hex ? null : parseRgb(raw);
  if (!hex && !rgb) return;
  const key = hex ?? HEX_FROM_SRGB(rgb!.r, rgb!.g, rgb!.b);
  const existing = out.get(key);
  if (existing) {
    out.set(key, { source: existing.source, count: existing.count + 1 });
  } else {
    out.set(key, { source, count: 1 });
  }
}

function extractFonts(html: string): Map<string, number> {
  const out = new Map<string, number>();
  const ffRe = /font-family\s*:\s*([^;}\n]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = ffRe.exec(html)) !== null) {
    const raw = m[1]!;
    // Strip outer quotes and take the first family.
    const first = raw.split(',')[0]!.replace(/['"]/g, '').trim();
    if (!first) continue;
    out.set(first, (out.get(first) ?? 0) + 1);
  }
  return out;
}

function extractLogos(html: string, baseUrl: string): ExtractedLogo[] {
  const out: ExtractedLogo[] = [];
  const linkRe = /<link[^>]+rel=["'](?:icon|apple-touch-icon|shortcut icon)["'][^>]*href=["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(html)) !== null) {
    const url = resolveUrl(m[1]!, baseUrl);
    // Default to "light" until we know better; an icon is usually
    // designed for light backgrounds.
    out.push({ variant: 'light', url, confidence: 0.6 });
  }

  const ogRe = /<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/gi;
  while ((m = ogRe.exec(html)) !== null) {
    const url = resolveUrl(m[1]!, baseUrl);
    out.push({ variant: 'light', url, confidence: 0.8 });
  }

  // Deduplicate by URL.
  const seen = new Map<string, ExtractedLogo>();
  for (const l of out) {
    if (!seen.has(l.url)) seen.set(l.url, l);
  }
  return [...seen.values()].slice(0, 5);
}

function resolveUrl(maybe: string, base: string): string {
  if (/^https?:/i.test(maybe)) return maybe;
  if (maybe.startsWith('//')) return `https:${maybe}`;
  if (maybe.startsWith('/')) {
    try {
      const u = new URL(base);
      return `${u.protocol}//${u.host}${maybe}`;
    } catch {
      return maybe;
    }
  }
  return maybe;
}

function extractAttribution(html: string): Record<string, string> {
  const out: Record<string, string> = {};
  const grab = (name: string, value: string): void => {
    out[name] = value;
  };
  const meta = (re: RegExp, key: string): void => {
    const m = re.exec(html);
    if (m && m[1]) grab(key, m[1]);
  };
  meta(/<meta\s+property=["']og:site_name["']\s+content=["']([^"']+)["']/i, 'siteName');
  meta(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i, 'title');
  meta(/<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i, 'description');
  const titleRe = /<title>([^<]+)<\/title>/i;
  const tm = titleRe.exec(html);
  if (tm && tm[1]) grab('title', tm[1].trim());
  return out;
}

function buildPaletteTokens(
  palette: readonly ExtractedPaletteColor[],
): readonly { tokenId: string; hex: string }[] {
  const out: { tokenId: string; hex: string }[] = [];
  const seen = new Set<string>();
  for (const c of palette.slice(0, 8)) {
    const base = c.hex.replace('#', '').toLowerCase();
    let tokenId = `color.brand.${base.slice(0, 6)}`;
    if (!validateTokenId(tokenId).valid) continue;
    let suffix = 2;
    while (seen.has(tokenId)) {
      tokenId = `color.brand.${base.slice(0, 4)}${suffix}`;
      suffix++;
    }
    seen.add(tokenId);
    out.push({ tokenId, hex: c.hex });
  }
  return out;
}

export function paletteTokensToTokenIds(palette: readonly ExtractedPaletteColor[]): readonly { tokenId: string; hex: string }[] {
  return buildPaletteTokens(palette);
}

// ---------------------------------------------------------------------------
// Main extractor
// ---------------------------------------------------------------------------

export interface ExtractionInput {
  readonly url: string;
  readonly html: string;
}

export function extractBrandKit(input: ExtractionInput): BrandExtractionResult {
  const stages: string[] = [STAGE_FETCH, STAGE_PARSE, STAGE_COLORS, STAGE_FONTS, STAGE_LOGO];

  const attribution = extractAttribution(input.html);
  const allowedSources = [new URL(input.url).host];
  const colors = extractColors(input.html);
  const fonts = extractFonts(input.html);
  const logos = extractLogos(input.html, input.url);

  const palette: ExtractedPaletteColor[] = [];
  for (const [hex, { source, count }] of colors) {
    const rgb = parseHex(hex);
    if (!rgb) continue;
    const oklch = srgbToOklch(rgb.r, rgb.g, rgb.b);
    if (!oklch) continue;
    const hexL = oklchToHex(oklch[0], oklch[1], oklch[2]);
    if (!hexL) continue;
    palette.push({
      hex: hexL,
      occurrences: count,
      source,
      confidence: Math.min(1, count / 5),
    });
  }
  palette.sort((a, b) => b.occurrences - a.occurrences);

  const extractedFonts: ExtractedFont[] = [];
  for (const [family, count] of fonts) {
    extractedFonts.push({
      family,
      occurrences: count,
      confidence: Math.min(1, count / 10),
    });
  }
  extractedFonts.sort((a, b) => b.occurrences - a.occurrences);

  const confidenceScores = {
    logos: logos.length > 0 ? logos.reduce((acc, l) => acc + l.confidence, 0) / logos.length : 0,
    palette: palette.length > 0 ? palette.reduce((acc, c) => acc + c.confidence, 0) / palette.length : 0,
    fonts: extractedFonts.length > 0 ? extractedFonts.reduce((acc, f) => acc + f.confidence, 0) / extractedFonts.length : 0,
  };

  return {
    attribution,
    logos: logos.slice(0, 5),
    palette: palette.slice(0, 8),
    fonts: extractedFonts.slice(0, 5),
    imageryRules: {
      allowedSources,
      minResolution: { width: 1200, height: 630 },
    },
    confidenceScores,
    stages,
  };
}