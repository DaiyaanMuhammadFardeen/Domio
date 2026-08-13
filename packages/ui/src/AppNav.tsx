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
}

export function AppNav({
  currentPath = '/',
  activeSurface,
  brandLabel = 'Domio',
  signInHref = '/login',
  signInLabel = 'Sign in',
  brandHref = '/',
  hideSurfaceSwitcher = false,
}: AppNavProps): JSX.Element {
  const primary = primaryNav(activeSurface);
  const roots = surfaceRoots();

  // Best-effort: resolve the current primary node so we can highlight
  // it via aria-current. If the active surface has no nodes (empty
  // graph for that surface), nothing is highlighted.
  const activePrimaryId = findActivePrimary(primary, currentPath);

  return (
    <header className="app-nav" data-testid="app-nav">
      <div className="app-nav__inner">
        <a href={brandHref} className="app-nav__brand" aria-label={`${brandLabel} home`}>
          <span className="app-nav__brand-mark" aria-hidden="true">D</span>
          <span className="app-nav__brand-wordmark">{brandLabel}</span>
        </a>

        <nav className="app-nav__nav" aria-label="Primary">
          <ul className="app-nav__list">
            {primary.map((node) => (
              <li key={node.id} className="app-nav__item">
                <a
                  className={`app-nav__link${node.id === activePrimaryId ? ' app-nav__link--active' : ''}`}
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

        <div className="app-nav__cta">
          <a
            className="app-nav__signin"
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