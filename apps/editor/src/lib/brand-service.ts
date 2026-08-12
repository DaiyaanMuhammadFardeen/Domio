/**
 * brand-service — typed client for the editor's Theme & Brand panel.
 *
 * Per Wave 2 §S2.5 of docs/frontend-roadmap/02-wave-editor-surface.md.
 *
 * Wraps the brand/extract, theme/generate-dark, lint/style, and
 * brand/kits endpoints. The real backend clients will replace these
 * with the generated SDK once the contracts ship; until then, the
 * client surfaces a `bootstrap` mode that returns deterministic
 * offline fallbacks so the panel renders without crashing.
 */

import {
  BOOTSTRAP_BRAND_KITS,
  BOOTSTRAP_THEMES,
  type BrandKitBootstrap,
  type ThemeBootstrap,
} from './theme-bootstrap';

// ─── Shared types ───────────────────────────────────────────────────────────

export interface DesignToken {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly description?: string;
}

export interface ColorScale {
  readonly id: string;
  readonly label: string;
  readonly stops: readonly DesignToken[];
}

export interface TypographyScale {
  readonly id: string;
  readonly label: string;
  readonly fontFamily: string;
  readonly fontSizePx: number;
  readonly lineHeight: number;
  readonly fontWeight: number;
  readonly letterSpacingEm: number;
}

export interface SpacingScale {
  readonly id: string;
  readonly label: string;
  readonly stops: readonly DesignToken[];
}

export interface RadiusScale {
  readonly id: string;
  readonly label: string;
  readonly stops: readonly DesignToken[];
}

export interface ShadowScale {
  readonly id: string;
  readonly label: string;
  readonly stops: readonly DesignToken[];
}

export interface BrandKitDetail extends BrandKitBootstrap {
  readonly colors: readonly ColorScale[];
  readonly typography: readonly TypographyScale[];
  readonly spacing: readonly SpacingScale[];
  readonly radius: readonly RadiusScale[];
  readonly shadows: readonly ShadowScale[];
}

export interface ThemeDetail extends ThemeBootstrap {
  readonly tokens: Record<string, string>;
  readonly isDark: boolean;
  readonly generatedAtMs?: number;
}

export interface ExtractedBrandKit {
  readonly sourceUrl: string;
  readonly primaryHex: string;
  readonly accentHex: string;
  readonly secondaryHexes: readonly string[];
  readonly fontFamilies: readonly string[];
  readonly suggestedKitName: string;
}

export interface LintIssue {
  readonly elementId: string;
  readonly elementName: string;
  readonly property: string;
  readonly currentValue: string;
  readonly expectedValue: string;
  readonly tokenId: string;
  readonly severity: 'error' | 'warning';
}

export interface LintReport {
  readonly brandKitId: string;
  readonly issues: readonly LintIssue[];
  readonly scannedElementCount: number;
  readonly scannedAtMs: number;
}

// ─── Defaults / bootstrap ───────────────────────────────────────────────────

export const DEFAULT_BRAND_KITS: ReadonlyArray<BrandKitDetail> = [
  {
    ...BOOTSTRAP_BRAND_KITS[0]!,
    colors: [
      {
        id: 'color.brand.primary',
        label: 'Primary',
        stops: [
          { id: '50', label: '50', value: BOOTSTRAP_BRAND_KITS[0]!.primaryHex },
          { id: '500', label: '500', value: BOOTSTRAP_BRAND_KITS[0]!.primaryHex },
          { id: '900', label: '900', value: BOOTSTRAP_BRAND_KITS[0]!.primaryHex },
        ],
      },
      {
        id: 'color.brand.accent',
        label: 'Accent',
        stops: [
          { id: '50', label: '50', value: BOOTSTRAP_BRAND_KITS[0]!.accentHex },
          { id: '500', label: '500', value: BOOTSTRAP_BRAND_KITS[0]!.accentHex },
          { id: '900', label: '900', value: BOOTSTRAP_BRAND_KITS[0]!.accentHex },
        ],
      },
    ],
    typography: [
      {
        id: 'type.heading',
        label: 'Heading',
        fontFamily: 'Inter',
        fontSizePx: 32,
        lineHeight: 1.2,
        fontWeight: 700,
        letterSpacingEm: -0.01,
      },
      {
        id: 'type.body',
        label: 'Body',
        fontFamily: 'Inter',
        fontSizePx: 16,
        lineHeight: 1.5,
        fontWeight: 400,
        letterSpacingEm: 0,
      },
      {
        id: 'type.caption',
        label: 'Caption',
        fontFamily: 'Inter',
        fontSizePx: 12,
        lineHeight: 1.4,
        fontWeight: 500,
        letterSpacingEm: 0.02,
      },
    ],
    spacing: [
      {
        id: 'space',
        label: 'Spacing',
        stops: [
          { id: '1', label: '1×', value: '4px' },
          { id: '2', label: '2×', value: '8px' },
          { id: '3', label: '3×', value: '12px' },
          { id: '4', label: '4×', value: '16px' },
          { id: '6', label: '6×', value: '24px' },
          { id: '8', label: '8×', value: '32px' },
        ],
      },
    ],
    radius: [
      {
        id: 'radius',
        label: 'Radius',
        stops: [
          { id: 'none', label: 'None', value: '0px' },
          { id: 'sm', label: 'SM', value: '4px' },
          { id: 'md', label: 'MD', value: '8px' },
          { id: 'lg', label: 'LG', value: '16px' },
          { id: 'pill', label: 'Pill', value: '999px' },
        ],
      },
    ],
    shadows: [
      {
        id: 'shadow',
        label: 'Shadow',
        stops: [
          { id: 'sm', label: 'SM', value: '0 1px 2px rgba(0,0,0,0.1)' },
          { id: 'md', label: 'MD', value: '0 4px 8px rgba(0,0,0,0.15)' },
          { id: 'lg', label: 'LG', value: '0 10px 24px rgba(0,0,0,0.2)' },
        ],
      },
    ],
  },
  {
    ...BOOTSTRAP_BRAND_KITS[1]!,
    colors: [
      {
        id: 'color.brand.primary',
        label: 'Primary',
        stops: [
          { id: '50', label: '50', value: '#3a4252' },
          { id: '500', label: '500', value: BOOTSTRAP_BRAND_KITS[1]!.primaryHex },
          { id: '900', label: '900', value: '#000000' },
        ],
      },
      {
        id: 'color.brand.accent',
        label: 'Accent',
        stops: [
          { id: '50', label: '50', value: '#a0c4ff' },
          { id: '500', label: '500', value: BOOTSTRAP_BRAND_KITS[1]!.accentHex },
          { id: '900', label: '900', value: '#0a3a8c' },
        ],
      },
    ],
    typography: [
      {
        id: 'type.heading',
        label: 'Heading',
        fontFamily: 'IBM Plex Sans',
        fontSizePx: 32,
        lineHeight: 1.2,
        fontWeight: 700,
        letterSpacingEm: -0.01,
      },
      {
        id: 'type.body',
        label: 'Body',
        fontFamily: 'IBM Plex Sans',
        fontSizePx: 16,
        lineHeight: 1.5,
        fontWeight: 400,
        letterSpacingEm: 0,
      },
      {
        id: 'type.caption',
        label: 'Caption',
        fontFamily: 'IBM Plex Mono',
        fontSizePx: 12,
        lineHeight: 1.4,
        fontWeight: 500,
        letterSpacingEm: 0.02,
      },
    ],
    spacing: [
      {
        id: 'space',
        label: 'Spacing',
        stops: [
          { id: '1', label: '1×', value: '4px' },
          { id: '2', label: '2×', value: '8px' },
          { id: '3', label: '3×', value: '12px' },
          { id: '4', label: '4×', value: '16px' },
          { id: '6', label: '6×', value: '24px' },
          { id: '8', label: '8×', value: '32px' },
        ],
      },
    ],
    radius: [
      {
        id: 'radius',
        label: 'Radius',
        stops: [
          { id: 'none', label: 'None', value: '0px' },
          { id: 'sm', label: 'SM', value: '2px' },
          { id: 'md', label: 'MD', value: '6px' },
          { id: 'lg', label: 'LG', value: '12px' },
          { id: 'pill', label: 'Pill', value: '999px' },
        ],
      },
    ],
    shadows: [
      {
        id: 'shadow',
        label: 'Shadow',
        stops: [
          { id: 'sm', label: 'SM', value: '0 1px 2px rgba(0,0,0,0.25)' },
          { id: 'md', label: 'MD', value: '0 4px 8px rgba(0,0,0,0.35)' },
          { id: 'lg', label: 'LG', value: '0 10px 24px rgba(0,0,0,0.5)' },
        ],
      },
    ],
  },
];

export const DEFAULT_THEMES: ReadonlyArray<ThemeDetail> = [
  {
    ...BOOTSTRAP_THEMES[0]!,
    isDark: false,
    tokens: {
      'color.bg': '#ffffff',
      'color.fg': '#1a1a1a',
      'color.accent': '#aa3a14',
      'color.muted': '#7d8590',
      'color.border': '#e0e0e0',
    },
  },
  {
    ...BOOTSTRAP_THEMES[1]!,
    isDark: true,
    tokens: {
      'color.bg': '#1a120c',
      'color.fg': '#f5e8de',
      'color.accent': '#aa3a14',
      'color.muted': '#a59a8e',
      'color.border': '#3a2a20',
    },
  },
  {
    ...BOOTSTRAP_THEMES[2]!,
    isDark: false,
    tokens: {
      'color.bg': '#f7f7f8',
      'color.fg': '#1a1a1a',
      'color.accent': '#58a6ff',
      'color.muted': '#7d8590',
      'color.border': '#d0d7de',
    },
  },
];

// ─── HTTP plumbing ──────────────────────────────────────────────────────────

const DEFAULT_API_BASE: string =
  (typeof process !== 'undefined'
    ? (process.env['NEXT_PUBLIC_API_URL'] as string | undefined)
    : undefined) ?? 'http://localhost:8080';

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  return (await res.json()) as T;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  return (await res.json()) as T;
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * List brand kits with full token detail.
 *
 * Falls back to `DEFAULT_BRAND_KITS` on network failure so the panel
 * always has something to render.
 */
export async function fetchBrandKits(baseUrl: string = DEFAULT_API_BASE): Promise<ReadonlyArray<BrandKitDetail>> {
  try {
    const remote = await getJson<ReadonlyArray<BrandKitDetail>>(`${baseUrl}/v1/brand/kits`);
    if (Array.isArray(remote) && remote.length > 0) return remote;
  } catch {
    // fall through to bootstrap
  }
  return DEFAULT_BRAND_KITS;
}

/**
 * Look up a single brand kit by id from the full list.
 */
export async function fetchBrandKit(
  kitId: string,
  baseUrl: string = DEFAULT_API_BASE,
): Promise<BrandKitDetail | null> {
  const kits = await fetchBrandKits(baseUrl);
  return kits.find((k) => k.id === kitId) ?? null;
}

/**
 * Fetch full theme detail for a theme id.
 */
export async function fetchTheme(
  themeId: string,
  baseUrl: string = DEFAULT_API_BASE,
): Promise<ThemeDetail | null> {
  try {
    const remote = await getJson<ThemeDetail>(`${baseUrl}/v1/theme/${encodeURIComponent(themeId)}`);
    if (remote && remote.id === themeId) return remote;
  } catch {
    // fall through to bootstrap
  }
  return DEFAULT_THEMES.find((t) => t.id === themeId) ?? null;
}

/**
 * List themes with full token detail.
 */
export async function fetchThemes(baseUrl: string = DEFAULT_API_BASE): Promise<ReadonlyArray<ThemeDetail>> {
  try {
    const remote = await getJson<ReadonlyArray<ThemeDetail>>(`${baseUrl}/v1/theme`);
    if (Array.isArray(remote) && remote.length > 0) return remote;
  } catch {
    // fall through
  }
  return DEFAULT_THEMES;
}

/**
 * POST /v1/brand/extract — given a URL, scrape + return a brand kit
 * suggestion (primary + accent + 3 font choices).
 *
 * When the backend isn't reachable, returns a deterministic mock based
 * on the URL hash so designers can preview the dialog offline.
 */
export async function extractBrandFromUrl(
  sourceUrl: string,
  baseUrl: string = DEFAULT_API_BASE,
): Promise<ExtractedBrandKit> {
  try {
    return await postJson<ExtractedBrandKit>(`${baseUrl}/v1/brand/extract`, { url: sourceUrl });
  } catch {
    // Bootstrap fallback — deterministic mock derived from URL.
    const seed = hashString(sourceUrl);
    const palettes: ReadonlyArray<readonly [string, string]> = [
      ['#0a2540', '#00a4ef'],
      ['#5b21b6', '#ec4899'],
      ['#15803d', '#facc15'],
      ['#7c2d12', '#f97316'],
      ['#0f172a', '#38bdf8'],
    ];
    const palette = palettes[seed % palettes.length]!;
    const fonts: ReadonlyArray<readonly string[]> = [
      ['Inter', 'IBM Plex Sans', 'JetBrains Mono'],
      ['Roboto', 'Lato', 'Fira Code'],
      ['Source Sans Pro', 'Merriweather', 'IBM Plex Mono'],
      ['Manrope', 'Work Sans', 'Inconsolata'],
    ];
    const family = fonts[seed % fonts.length]!;
    const secondary = ['#f5f5f5', '#0f172a', '#d4d4d4'];
    const nameFromUrl = (() => {
      try {
        const u = new URL(sourceUrl);
        return u.hostname.replace(/^www\./, '').split('.')[0] ?? 'Brand';
      } catch {
        return 'Brand';
      }
    })();
    return {
      sourceUrl,
      primaryHex: palette[0],
      accentHex: palette[1],
      secondaryHexes: secondary,
      fontFamilies: family,
      suggestedKitName: `${capitalize(nameFromUrl)} Kit`,
    };
  }
}

/**
 * POST /v1/theme/generate-dark — take a light theme id and return a
 * dark variant generated from it.
 */
export async function generateDarkTheme(
  sourceThemeId: string,
  baseUrl: string = DEFAULT_API_BASE,
): Promise<ThemeDetail> {
  try {
    return await postJson<ThemeDetail>(`${baseUrl}/v1/theme/generate-dark`, { themeId: sourceThemeId });
  } catch {
    // Bootstrap fallback — derive dark from light by inverting fg/bg.
    const source = DEFAULT_THEMES.find((t) => t.id === sourceThemeId) ?? DEFAULT_THEMES[0]!;
    const tokens: Record<string, string> = {};
    for (const [k, v] of Object.entries(source.tokens)) {
      if (k === 'color.bg') tokens[k] = '#0a0e14';
      else if (k === 'color.fg') tokens[k] = '#e6edf3';
      else if (k === 'color.border') tokens[k] = '#30363d';
      else if (k === 'color.muted') tokens[k] = '#7d8590';
      else tokens[k] = v;
    }
    return {
      id: `${source.id}-dark-generated`,
      name: `${source.name} (Dark, auto)`,
      scheme: 'dark',
      isDark: true,
      tokens,
      generatedAtMs: Date.now(),
    };
  }
}

/**
 * POST /v1/lint/style — scan the deck's elements and flag any whose
 * colors / fonts / spacing don't match the active brand kit.
 *
 * When the backend isn't reachable, returns an empty report so the
 * panel renders a "no issues" state.
 */
export async function lintStyle(
  brandKitId: string,
  elements: ReadonlyArray<{ readonly id: string; readonly name: string; readonly fill?: string | undefined; readonly fontFamily?: string | undefined }>,
  baseUrl: string = DEFAULT_API_BASE,
): Promise<LintReport> {
  try {
    return await postJson<LintReport>(`${baseUrl}/v1/lint/style`, { brandKitId, elements });
  } catch {
    // Bootstrap fallback — deterministic lint based on element fills.
    const kit = DEFAULT_BRAND_KITS.find((k) => k.id === brandKitId);
    const allowed = new Set<string>();
    if (kit) {
      for (const scale of kit.colors) {
        for (const stop of scale.stops) allowed.add(stop.value.toLowerCase());
      }
      allowed.add(kit.primaryHex.toLowerCase());
      allowed.add(kit.accentHex.toLowerCase());
    }
    const issues: LintIssue[] = [];
    for (const el of elements) {
      if (el.fill && !allowed.has(el.fill.toLowerCase())) {
        issues.push({
          elementId: el.id,
          elementName: el.name,
          property: 'fill',
          currentValue: el.fill,
          expectedValue: kit?.primaryHex ?? '#000000',
          tokenId: 'color.brand.primary',
          severity: 'warning',
        });
      }
    }
    return {
      brandKitId,
      issues,
      scannedElementCount: elements.length,
      scannedAtMs: Date.now(),
    };
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
