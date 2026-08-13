/**
 * Theme marketplace service — Wave 9 §S9.7.
 *
 * Provides ThemeTokens / ThemeListing types and helpers for fetching
 * individual themes. Falls back to a deterministic seeded catalog if
 * the upstream API is unreachable.
 */

const API_BASE = process.env['NEXT_PUBLIC_API_BASE'] ?? 'http://localhost:8080';

/* ── Token + listing types ─────────────────────────────────────────── */

export interface ThemeColorTokens {
  primary: string;
  secondary: string;
  accent: string;
  bg: string;
  surface: string;
  fg: string;
}

export interface ThemeFontTokens {
  heading: string;
  body: string;
}

export interface ThemeSpacingTokens {
  xs: string;
  sm: string;
  md: string;
  lg: string;
  xl: string;
}

export interface ThemeTokens {
  color: ThemeColorTokens;
  fontFamily: ThemeFontTokens;
  spacing: ThemeSpacingTokens;
}

export interface ThemeListing {
  id: string;
  slug: string;
  title: string;
  description: string;
  tokens: ThemeTokens;
  price_cents: number;
  currency: string;
  is_free: boolean;
  tags: string[];
}

/* ── Seed fallback catalog ─────────────────────────────────────────── */

export const FALLBACK_THEMES: Readonly<Record<string, ThemeListing>> = {
  midnight: {
    id: 'theme_midnight',
    slug: 'midnight',
    title: 'Midnight',
    description:
      'A deep, low-light theme tuned for late-night decks — navy backgrounds, soft violet accents, and a serif body face for legibility on projectors.',
    tokens: {
      color: {
        primary: '#1e293b',
        secondary: '#334155',
        accent: '#a78bfa',
        bg: '#0f172a',
        surface: '#1e293b',
        fg: '#e2e8f0',
      },
      fontFamily: {
        heading: 'Georgia, "Times New Roman", serif',
        body: 'Inter, "Helvetica Neue", sans-serif',
      },
      spacing: {
        xs: '4px',
        sm: '8px',
        md: '16px',
        lg: '24px',
        xl: '40px',
      },
    },
    price_cents: 0,
    currency: 'USD',
    is_free: true,
    tags: ['dark', 'minimal', 'presentation'],
  },
  sunset: {
    id: 'theme_sunset',
    slug: 'sunset',
    title: 'Sunset',
    description:
      'Warm coral and amber palette inspired by dusk. Pairs bold display headings with a calm sans body for high-contrast, high-energy decks.',
    tokens: {
      color: {
        primary: '#fb923c',
        secondary: '#f97316',
        accent: '#ef4444',
        bg: '#fff7ed',
        surface: '#ffedd5',
        fg: '#7c2d12',
      },
      fontFamily: {
        heading: '"Space Grotesk", system-ui, sans-serif',
        body: '"DM Sans", system-ui, sans-serif',
      },
      spacing: {
        xs: '4px',
        sm: '10px',
        md: '20px',
        lg: '32px',
        xl: '56px',
      },
    },
    price_cents: 1500,
    currency: 'USD',
    is_free: false,
    tags: ['warm', 'energetic', 'marketing'],
  },
  forest: {
    id: 'theme_forest',
    slug: 'forest',
    title: 'Forest',
    description:
      'Earthy green palette with deep emerald and mossy neutrals. The default for sustainability reports, nature photography, and field-team updates.',
    tokens: {
      color: {
        primary: '#166534',
        secondary: '#15803d',
        accent: '#84cc16',
        bg: '#f0fdf4',
        surface: '#dcfce7',
        fg: '#14532d',
      },
      fontFamily: {
        heading: '"Playfair Display", Georgia, serif',
        body: '"Source Sans Pro", system-ui, sans-serif',
      },
      spacing: {
        xs: '6px',
        sm: '12px',
        md: '18px',
        lg: '28px',
        xl: '48px',
      },
    },
    price_cents: 2500,
    currency: 'USD',
    is_free: false,
    tags: ['organic', 'report', 'editorial'],
  },
  paper: {
    id: 'theme_paper',
    slug: 'paper',
    title: 'Paper',
    description:
      'A clean, white-and-ink theme for printed handouts and academic decks. High readability, soft grays, and a monospace for data callouts.',
    tokens: {
      color: {
        primary: '#111827',
        secondary: '#374151',
        accent: '#2563eb',
        bg: '#ffffff',
        surface: '#f9fafb',
        fg: '#111827',
      },
      fontFamily: {
        heading: '"IBM Plex Serif", Georgia, serif',
        body: '"IBM Plex Sans", system-ui, sans-serif',
      },
      spacing: {
        xs: '4px',
        sm: '8px',
        md: '16px',
        lg: '24px',
        xl: '40px',
      },
    },
    price_cents: 0,
    currency: 'USD',
    is_free: true,
    tags: ['light', 'minimal', 'print'],
  },
};

/* ── Helpers ───────────────────────────────────────────────────────── */

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  if (!res.ok) throw new Error(`theme-service: ${res.status}`);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

function buildFallback(slug: string): ThemeListing {
  const seed = FALLBACK_THEMES[slug];
  if (seed) return seed;
  // Deterministic fallback for any unknown slug — do not throw.
  return {
    id: `theme_${slug}`,
    slug,
    title: slug.charAt(0).toUpperCase() + slug.slice(1),
    description: `A preview of the "${slug}" theme. Apply it to a new deck to see how it looks in context.`,
    tokens: FALLBACK_THEMES.midnight!.tokens,
    price_cents: 0,
    currency: 'USD',
    is_free: true,
    tags: ['preview'],
  };
}

/* ── Public API ────────────────────────────────────────────────────── */

export async function getTheme(slug: string): Promise<ThemeListing | null> {
  try {
    return await apiFetch<ThemeListing>(`/v1/marketplace/themes/${encodeURIComponent(slug)}`);
  } catch {
    return buildFallback(slug);
  }
}

export async function listThemeSlugs(): Promise<string[]> {
  try {
    const res = await apiFetch<{ items: ThemeListing[] }>(`/v1/marketplace/themes`);
    return res.items.map((t) => t.slug);
  } catch {
    return Object.keys(FALLBACK_THEMES);
  }
}
