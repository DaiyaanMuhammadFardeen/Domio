/**
 * Theme + brand-kit bootstrap defaults.
 *
 * Per Wave 1 §S1.4 of docs/frontend-roadmap/01-wave-productionization.md.
 *
 * These are the seeded defaults the editor uses when a deck does not
 * carry an explicit `theme` or `brandKit` reference. They are NOT mock
 * data; they are the system's documented baseline (Acme Coffee + Domio
 * are the two canonical brand kits for evaluation builds).
 *
 * When the theme-svc + brand-svc land real client SDKs in Task #12,
 * this module becomes a thin loader wrapper that:
 *   1. Fetches the active brand kit + theme for the tenant from the
 *      theme-svc / brand-svc.
 *   2. Falls back to the defaults below if the services are unreachable.
 *   3. Caches results in memory for the session.
 *
 * Today the defaults are exported as constants. Consumers should treat
 * them as read-only and prefer the loader hooks (`loadActiveTheme`,
 * `loadActiveBrandKit`) so the eventual migration is mechanical.
 */

export interface ThemeBootstrap {
  readonly id: string;
  readonly name: string;
  readonly scheme: 'light' | 'dark';
}

export interface BrandKitBootstrap {
  readonly id: string;
  readonly name: string;
  readonly primaryHex: string;
  readonly accentHex: string;
}

/**
 * Documented baseline brand kits shipped with the editor.
 *
 * Acme Coffee is the reference warm-tone kit; Domio is the default
 * neutral kit. Both are kept in lockstep with the marketing site's
 * homepage so that designers previewing components see the same
 * palette end-users will see on published decks.
 */
export const BOOTSTRAP_BRAND_KITS: ReadonlyArray<BrandKitBootstrap> = [
  {
    id: 'brand-acme',
    name: 'Acme Coffee',
    primaryHex: '#33180c',
    accentHex: '#aa3a14',
  },
  {
    id: 'brand-domio',
    name: 'Domio',
    primaryHex: '#0a0e14',
    accentHex: '#58a6ff',
  },
];

/**
 * Documented baseline themes shipped with the editor. Each theme has
 * a `scheme` so the editor can flip light/dark without round-tripping
 * to the theme-svc.
 */
export const BOOTSTRAP_THEMES: ReadonlyArray<ThemeBootstrap> = [
  { id: 'theme-acme-light', name: 'Acme Light', scheme: 'light' },
  { id: 'theme-acme-dark', name: 'Acme Dark', scheme: 'dark' },
  { id: 'theme-neutral', name: 'Neutral Studio', scheme: 'light' },
];

/**
 * Loader hook for the active theme. Today this returns the bootstrap
 * defaults; the theme-svc client will replace this with a real fetch.
 *
 * The signature is async on purpose: callers should `await` it so the
 * eventual network migration is a one-line edit.
 */
export async function loadActiveTheme(_deckId: string): Promise<ReadonlyArray<ThemeBootstrap>> {
  return BOOTSTRAP_THEMES;
}

/**
 * Loader hook for the active brand kit. Mirrors `loadActiveTheme`.
 */
export async function loadActiveBrandKit(_deckId: string): Promise<ReadonlyArray<BrandKitBootstrap>> {
  return BOOTSTRAP_BRAND_KITS;
}
