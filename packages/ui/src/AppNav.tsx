/**
 * AppNav — the smart header that knows every Domio surface.
 *
 * Per Wave 13. Renders the primary navigation list for the current
 * surface plus the cross-app switcher. Every href is resolved through
 * `NAV_GRAPH` so all routes are typed and port-aware.
 *
 * Replaces the per-app hardcoded nav arrays (e.g. landing's
 * `SiteHeader`, dashboard's `Sidebar`, admin-console's layout
 * chrome). The BEM class names are deliberately generic so existing
 * CSS in every app keeps working:
 *
 *   .app-nav                    — root <header>
 *   .app-nav__inner             — flex container
 *   .app-nav__brand             — wordmark wrapper
 *   .app-nav__brand-mark        — "D" mark
 *   .app-nav__brand-wordmark    — "Domio" text
 *   .app-nav__nav               — <nav> wrapper around primary nav
 *   .app-nav__list              — <ul> of primary links
 *   .app-nav__item              — <li>
 *   .app-nav__link              — <a> (active adds `--active` modifier)
 *   .app-nav__surface           — cross-app switcher <nav>
 *   .app-nav__surface-list      — switcher <ul>
 *   .app-nav__surface-link      — switcher <a>
 *   .app-nav__cta               — sign-in / create-account CTA
 */

import type { JSX } from 'react';
import type { NavNode, NavSurface } from './nav-graph.js';
import { primaryNav, surfaceRoots, nodeByHref } from './nav-resolver.js';

/**
 * Optional BEM-class overrides. Pass these so the same `<AppNav>` can
 * drop into existing site CSS without re-declaring selectors. Each
 * `linkActive` value is appended to `link` via `--active` when the
 * active node is the current primary entry.
 */
export interface AppNavClassNames {
  readonly header?: string;
  readonly inner?: string;
  readonly brand?: string;
  readonly brandMark?: string;
  readonly brandWordmark?: string;
  readonly nav?: string;
  readonly list?: string;
  readonly item?: string;
  readonly link?: string;
  readonly linkActive?: string;
  readonly cta?: string;
  readonly signin?: string;
}

export interface AppNavProps {
  readonly currentPath?: string;
  readonly activeSurface: NavSurface;
  /** Optional label override for the wordmark. */
  readonly brandLabel?: string;
  /** Sign-in CTA href. Defaults to landing's /login. */
  readonly signInHref?: string;
  /** Sign-in CTA label. Defaults to "Sign in". */
  readonly signInLabel?: string;
  /** Override the brand href (default `/`). */
  readonly brandHref?: string;
  /** Hide the cross-app switcher (e.g. join-web session screens). */
  readonly hideSurfaceSwitcher?: boolean;
  /**
   * Override the default primary nav list (which is `primaryNav(activeSurface)`).
   * Use this when the calling site has a richer primary list than what
   * `NAV_GRAPH` declares (e.g. landing's data-driven sitemap).
   */
  readonly primaryNodes?: ReadonlyArray<NavNode>;
  /**
   * Override the active-primary resolver. Default uses `findActivePrimary`
   * which performs a longest-prefix match followed by a `nodeByHref` lookup.
   */
  readonly primaryNodeActive?: (nodes: ReadonlyArray<NavNode>, path: string) => string | null;
  /** Per-surface BEM class overrides. */
  readonly classNames?: AppNavClassNames;
}

export function AppNav({
  currentPath = '/',
  activeSurface,
  brandLabel = 'Domio',
  signInHref = '/login',
  signInLabel = 'Sign in',
  brandHref = '/',
  hideSurfaceSwitcher = false,
  primaryNodes,
  primaryNodeActive,
  classNames,
}: AppNavProps): JSX.Element {
  const fallback = primaryNav(activeSurface);
  const primary = primaryNodes ?? fallback;
  const roots = surfaceRoots();

  // Best-effort: resolve the current primary node so we can highlight
  // it via aria-current. If the active surface has no nodes (empty
  // graph for that surface), nothing is highlighted.
  const activePrimaryId = primaryNodeActive
    ? primaryNodeActive(primary, currentPath)
    : findActivePrimary(primary, currentPath);

  const cls = (name: keyof AppNavClassNames, fallback: string): string => {
    const override = classNames?.[name];
    return override ?? fallback;
  };

  const headerCls = cls('header', 'app-nav');
  const innerCls = cls('inner', 'app-nav__inner');
  const brandCls = cls('brand', 'app-nav__brand');
  const brandMarkCls = cls('brandMark', 'app-nav__brand-mark');
  const brandWordmarkCls = cls('brandWordmark', 'app-nav__brand-wordmark');
  const navCls = cls('nav', 'app-nav__nav');
  const listCls = cls('list', 'app-nav__list');
  const itemCls = cls('item', 'app-nav__item');
  const linkCls = cls('link', 'app-nav__link');
  const linkActiveSuffix = ` ${cls('linkActive', 'app-nav__link--active')}`;
  const ctaCls = cls('cta', 'app-nav__cta');
  const signinCls = cls('signin', 'app-nav__signin');

  return (
    <header className={headerCls} data-testid="app-nav">
      <div className={innerCls}>
        <a href={brandHref} className={brandCls} aria-label={`${brandLabel} home`}>
          <span className={brandMarkCls} aria-hidden="true">D</span>
          <span className={brandWordmarkCls}>{brandLabel}</span>
        </a>

        <nav className={navCls} aria-label="Primary">
          <ul className={listCls}>
            {primary.map((node) => (
              <li key={node.id} className={itemCls}>
                <a
                  className={node.id === activePrimaryId ? `${linkCls}${linkActiveSuffix}` : linkCls}
                  href={node.href}
                  aria-current={node.id === activePrimaryId ? 'page' : undefined}
                  data-testid={`app-nav-link-${node.id}`}
                >
                  {node.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        {!hideSurfaceSwitcher ? (
          <nav className="app-nav__surface" aria-label="Switch surface">
            <ul className="app-nav__surface-list">
              {roots
                .filter((root) => root.surface !== activeSurface)
                .map((root) => (
                  <li key={root.surface} className="app-nav__surface-item">
                    <a
                      className="app-nav__surface-link"
                      href={root.href}
                      data-testid={`app-nav-surface-${root.surface}`}
                    >
                      {root.label}
                    </a>
                  </li>
                ))}
            </ul>
          </nav>
        ) : null}

        <div className={ctaCls}>
          <a
            className={signinCls}
            href={signInHref}
            data-testid="app-nav-signin"
          >
            {signInLabel}
          </a>
        </div>
      </div>
    </header>
  );
}

function findActivePrimary(
  primary: ReadonlyArray<NavNode>,
  currentPath: string,
): string | null {
  if (primary.length === 0) return null;
  // Exact match wins; otherwise longest prefix match.
  let bestId: string | null = null;
  let bestLen = -1;
  for (const node of primary) {
    if (node.href === currentPath) return node.id;
    if (currentPath.startsWith(`${node.href}/`) && node.href.length > bestLen) {
      bestId = node.id;
      bestLen = node.href.length;
    }
  }
  if (bestId) return bestId;
  // Fall back to href resolver so dashboards like `/overview` get
  // matched even if not in the primary nav.
  const byHref = nodeByHref(currentPath);
  return byHref?.id ?? null;
}