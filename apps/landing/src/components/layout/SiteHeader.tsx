/**
 * Top navigation header for the public marketing site.
 *
 * Per Wave 13: this is a thin wrapper over `<AppNav>` from `@domio/ui`.
 * The primary nav list comes from `nav-sitemap.ts`
 * (`ALL_LANDING_NODES` filtered by `primary: true`), and we override
 * the BEM class names with the existing `.site-header*` selectors so
 * the Wave 12 site CSS continues to apply.
 *
 * Adding a new top-level landing surface means adding one node in
 * `nav-sitemap.ts` with `primary: true`.
 */

import type { JSX } from 'react';
import { AppNav, type NavNode } from '@domio/ui';
import { ALL_LANDING_NODES, landingNodeById } from '../../lib/nav-sitemap';

const PRIMARY_LANDING_NODES: ReadonlyArray<NavNode> = ALL_LANDING_NODES.filter(
  (node) => node.primary === true && node.surface === 'landing',
).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

function resolveActivePrimary(nodes: ReadonlyArray<NavNode>, currentPath: string): string | null {
  if (nodes.length === 0) return null;
  let bestId: string | null = null;
  let bestLen = -1;
  for (const node of nodes) {
    if (node.href === currentPath) return node.id;
    if (currentPath.startsWith(`${node.href}/`) && node.href.length > bestLen) {
      bestId = node.id;
      bestLen = node.href.length;
    }
  }
  return bestId;
}

export interface SiteHeaderProps {
  readonly currentPath?: string;
}

export function SiteHeader({ currentPath = '/' }: SiteHeaderProps): JSX.Element {
  return (
    <AppNav
      currentPath={currentPath}
      activeSurface="landing"
      brandLabel="Domio"
      brandHref={landingNodeById('home')?.href ?? '/'}
      signInHref={landingNodeById('login')?.href ?? '/login'}
      signInLabel="Sign in"
      primaryNodes={PRIMARY_LANDING_NODES}
      primaryNodeActive={resolveActivePrimary}
      classNames={{
        header: 'site-header',
        inner: 'site-header__inner',
        brand: 'site-header__brand',
        brandMark: 'site-header__mark',
        brandWordmark: 'site-header__wordmark',
        nav: 'site-header__nav',
        list: 'site-header__list',
        item: 'site-header__item',
        link: 'site-header__link',
        linkActive: 'site-header__link--active',
        cta: 'site-header__cta',
        signin: 'site-header__signin',
      }}
    />
  );
}

export default SiteHeader;
