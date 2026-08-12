/**
 * routing — typed URL builders for every Domio app surface.
 *
 * Per Wave 1 §S1.10 of docs/frontend-roadmap/01-wave-productionization.md.
 *
 * Every `<Link href>` in every app must use one of these builders.
 * The ESLint rule `domio/no-raw-href` rejects string-literal href values
 * in component files.
 *
 * Apps (one builder per app surface):
 *   - editor       (apps/editor)
 *   - viewer       (apps/viewer)
 *   - presenter    (apps/presenter)
 *   - dashboard    (apps/dashboard)
 *   - joinWeb      (apps/join-web)
 *   - adminConsole (apps/admin-console)
 *   - creatorConsole (apps/creator-console)
 *   - marketplaceWeb  (apps/marketplace-web)
 *   - landing      (apps/landing)
 *
 * Each builder returns a string path. The host app's `next.config.mjs`
 * `basePath` (or rewrite) is appended by callers if needed.
 */

const DEFAULT_PORTS: Readonly<Record<string, number>> = {
  editor: 3100,
  viewer: 3200,
  presenter: 3300,
  dashboard: 3000,
  joinWeb: 3400,
  adminConsole: 3500,
  creatorConsole: 3600,
  marketplaceWeb: 3700,
  landing: 3800,
  magicLinkLanding: 3900,
};

/**
 * Returns the local dev URL for an app, e.g. `http://localhost:3100/...`.
 * Useful for cross-app links during development.
 */
export function localUrl(app: keyof typeof DEFAULT_PORTS, path: string): string {
  const port = DEFAULT_PORTS[app];
  const normalized = path.startsWith('/') ? path : `/${path}`;
  if (typeof window !== 'undefined') {
    // Same-origin — emit a relative path so SSR/CSR match.
    if (window.location.port === String(port)) {
      return normalized;
    }
  }
  return `http://localhost:${port}${normalized}`;
}

// ---------------------------------------------------------------------------
// Editor
// ---------------------------------------------------------------------------

export interface EditorRouteOptions {
  /** Open a specific left-rail panel on mount. */
  panel?: string;
  /** Optional slide index (0-based) to scroll to. */
  slide?: number;
}

export function editor(deckId: string, opts: EditorRouteOptions = {}): string {
  const params = new URLSearchParams();
  if (opts.panel) params.set('panel', opts.panel);
  if (typeof opts.slide === 'number') params.set('slide', String(opts.slide));
  const qs = params.toString();
  const base = `/editor/${encodeURIComponent(deckId)}`;
  return qs.length > 0 ? `${base}?${qs}` : base;
}

// ---------------------------------------------------------------------------
// Viewer
// ---------------------------------------------------------------------------

export interface ViewerRouteOptions {
  /** Slide index (0-based). */
  slide?: number;
  /** Enable scroll mode. */
  mode?: 'stage' | 'scroll';
  /** Optional share token for permissioned views. */
  token?: string;
}

export function viewer(deckId: string, opts: ViewerRouteOptions = {}): string {
  const params = new URLSearchParams();
  // `slide` is encoded as a path segment when given, so no `?slide=`
  // query is appended.
  if (opts.mode && opts.mode !== 'stage') params.set('mode', opts.mode);
  if (opts.token) params.set('token', opts.token);
  const qs = params.toString();
  const slideSegment =
    typeof opts.slide === 'number' ? `/${opts.slide}` : '';
  const base = `/${encodeURIComponent(deckId)}${slideSegment}`;
  return qs.length > 0 ? `${base}?${qs}` : base;
}

// ---------------------------------------------------------------------------
// Presenter
// ---------------------------------------------------------------------------

export function presenter(sessionId: string): string {
  return `/session/${encodeURIComponent(sessionId)}`;
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export type DashboardRoute =
  | 'overview'
  | 'deck'
  | 'deck-detail'
  | 'live'
  | 'ab'
  | 'heatmap'
  | 'benchmarks'
  | 'crm'
  | 'team'
  | 'export'
  | 'funnel'
  | 'cohorts'
  | 'kpis'
  | 'sentiment'
  | 'csat'
  | 'alerts'
  | 'graph';

export function dashboard(
  route: DashboardRoute,
  params: Record<string, string> = {},
): string {
  switch (route) {
    case 'overview':
      return '/overview';
    case 'deck':
      return '/deck';
    case 'deck-detail':
      return `/deck/${encodeURIComponent(params['id'] ?? '')}`;
    case 'live':
      return '/live';
    case 'ab':
      return '/ab';
    case 'heatmap':
      return '/heatmap';
    case 'benchmarks':
      return '/benchmarks';
    case 'crm':
      return '/crm';
    case 'team':
      return '/team';
    case 'export':
      return '/export';
    case 'funnel':
      return '/funnel';
    case 'cohorts':
      return '/cohorts';
    case 'kpis':
      return '/kpis';
    case 'sentiment':
      return '/sentiment';
    case 'csat':
      return '/csat';
    case 'alerts':
      return '/alerts';
    case 'graph':
      return '/graph';
  }
}

// ---------------------------------------------------------------------------
// Join Web
// ---------------------------------------------------------------------------

export function joinWeb(code: string): string {
  return `/j/${encodeURIComponent(code)}`;
}

export function joinFeedback(sessionId: string): string {
  return `/feedback/${encodeURIComponent(sessionId)}`;
}

export function joinHandout(token: string): string {
  return `/h/${encodeURIComponent(token)}`;
}

// ---------------------------------------------------------------------------
// Admin Console
// ---------------------------------------------------------------------------

export type AdminRoute =
  | 'home'
  | 'brand-locks'
  | 'takedowns'
  | 'trust'
  | 'payouts'
  | 'sso'
  | 'scim'
  | 'dlp'
  | 'audit'
  | 'residency'
  | 'legal-hold'
  | 'retention'
  | 'seats'
  | 'api-keys'
  | 'webhooks'
  | 'sdk'
  | 'plugins'
  | 'plugin-detail'
  | 'component-sdk'
  | 'rendering'
  | 'mcp'
  | 'mcp-tools'
  | 'mcp-permissions'
  | 'mcp-audit'
  | 'api-explorer'
  | 'change-feed'
  | 'agent-handoff'
  | 'usage'
  | 'rate-limits'
  | 'custom-domains';

export function adminConsole(
  route: AdminRoute,
  params: Record<string, string> = {},
): string {
  switch (route) {
    case 'home':
      return '/';
    case 'brand-locks':
      return '/brand-locks';
    case 'takedowns':
      return '/takedowns';
    case 'trust':
      return '/trust';
    case 'payouts':
      return '/payouts';
    case 'sso':
      return '/sso';
    case 'scim':
      return '/scim';
    case 'dlp':
      return '/dlp';
    case 'audit':
      return '/audit';
    case 'residency':
      return '/residency';
    case 'legal-hold':
      return '/legal-hold';
    case 'retention':
      return '/retention';
    case 'seats':
      return '/seats';
    case 'api-keys':
      return '/api-keys';
    case 'webhooks':
      return '/webhooks';
    case 'sdk':
      return '/sdk';
    case 'plugins':
      return '/plugins';
    case 'plugin-detail':
      return `/plugins/${encodeURIComponent(params['id'] ?? '')}`;
    case 'component-sdk':
      return '/component-sdk';
    case 'rendering':
      return '/rendering';
    case 'mcp':
      return '/mcp';
    case 'mcp-tools':
      return '/mcp/tools';
    case 'mcp-permissions':
      return '/mcp/permissions';
    case 'mcp-audit':
      return '/mcp/audit';
    case 'api-explorer':
      return '/api-explorer';
    case 'change-feed':
      return '/change-feed';
    case 'agent-handoff':
      return '/agent-handoff';
    case 'usage':
      return '/billing/usage';
    case 'rate-limits':
      return '/billing/rate-limits';
    case 'custom-domains':
      return '/custom-domains';
  }
}

// ---------------------------------------------------------------------------
// Creator Console
// ---------------------------------------------------------------------------

export type CreatorRoute =
  | 'listings'
  | 'listings-create'
  | 'analytics'
  | 'statements'
  | 'payouts'
  | 'settings'
  | 'reviews'
  | 'onboarding';

export function creatorConsole(route: CreatorRoute): string {
  switch (route) {
    case 'listings':
      return '/listings';
    case 'listings-create':
      return '/listings/create';
    case 'analytics':
      return '/analytics';
    case 'statements':
      return '/statements';
    case 'payouts':
      return '/payouts';
    case 'settings':
      return '/settings';
    case 'reviews':
      return '/reviews';
    case 'onboarding':
      return '/onboarding';
  }
}

// ---------------------------------------------------------------------------
// Marketplace Web
// ---------------------------------------------------------------------------

export type MarketplaceRoute =
  | 'home'
  | 'search'
  | 'listing'
  | 'theme'
  | 'checkout'
  | 'checkout-success'
  | 'library'
  | 'sellers'
  | 'creator';

export function marketplaceWeb(
  route: MarketplaceRoute,
  params: Record<string, string> = {},
): string {
  switch (route) {
    case 'home':
      return '/';
    case 'search':
      return `/search${params['q'] ? `?q=${encodeURIComponent(params['q'])}` : ''}`;
    case 'listing':
      return `/listing/${encodeURIComponent(params['slug'] ?? '')}`;
    case 'theme':
      return `/theme/${encodeURIComponent(params['slug'] ?? '')}`;
    case 'checkout':
      return `/checkout${params['listing'] ? `?listing=${encodeURIComponent(params['listing'])}` : ''}`;
    case 'checkout-success':
      return '/checkout/success';
    case 'library':
      return '/library';
    case 'sellers':
      return '/sellers';
    case 'creator':
      return `/creators/${encodeURIComponent(params['handle'] ?? '')}`;
  }
}

// ---------------------------------------------------------------------------
// Landing
// ---------------------------------------------------------------------------

export type LandingRoute =
  | 'home'
  | 'features'
  | 'feature'
  | 'pricing'
  | 'signup'
  | 'login'
  | 'forgot-password'
  | 'docs'
  | 'changelog'
  | 'demos'
  | 'trust'
  | 'status'
  | 'help'
  | 'community'
  | 'blog'
  | 'blog-post'
  | 'careers'
  | 'cli'
  | 'plugins-sdk';

export function landing(
  route: LandingRoute,
  params: Record<string, string> = {},
): string {
  switch (route) {
    case 'home':
      return '/';
    case 'features':
      return '/features';
    case 'feature':
      return `/features/${encodeURIComponent(params['slug'] ?? '')}`;
    case 'pricing':
      return '/pricing';
    case 'signup':
      return '/signup';
    case 'login':
      return '/login';
    case 'forgot-password':
      return '/forgot-password';
    case 'docs':
      return `/docs/${(params['slug'] ?? '').replace(/^\/+/, '')}`.replace(
        /\/$/,
        '',
      );
    case 'changelog':
      return '/changelog';
    case 'demos':
      return '/demos';
    case 'trust':
      return '/trust';
    case 'status':
      return '/status';
    case 'help':
      return '/help';
    case 'community':
      return '/community';
    case 'blog':
      return '/blog';
    case 'blog-post':
      return `/blog/${encodeURIComponent(params['slug'] ?? '')}`;
    case 'careers':
      return '/careers';
    case 'cli':
      return '/cli';
    case 'plugins-sdk':
      return '/plugins-sdk';
  }
}

// ---------------------------------------------------------------------------
// Convenience composite builders
// ---------------------------------------------------------------------------

/** Builds a deck share link for an audience viewer. */
export function deckShare(deckId: string, opts: ViewerRouteOptions = {}): string {
  return viewer(deckId, opts);
}

/** Builds a presenter handoff URL with an optional token. */
export function presenterWithToken(sessionId: string, token: string): string {
  return `${presenter(sessionId)}?token=${encodeURIComponent(token)}`;
}