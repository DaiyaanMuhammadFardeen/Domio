/**
 * BreadcrumbsShell — wraps the page body with a `<Breadcrumbs>` rail
 * when the current route is non-root.
 *
 * Per Wave 13. The shell is a server component that consumes the
 * sitemap (`nav-sitemap.ts`) and renders the parent chain. If the
 * chain is just `[Home]`, the breadcrumbs collapse (Home is
 * self-referential; the page is at the root).
 */

import type { JSX, ReactNode } from 'react';
import { Breadcrumbs } from '@domio/ui';
import { landingBreadcrumbs } from '../../lib/nav-sitemap';

export interface BreadcrumbsShellProps {
  /**
   * The id of the current page in `nav-sitemap.ts`.
   */
  readonly currentId: string;
  readonly children: ReactNode;
}

export function BreadcrumbsShell({
  currentId,
  children,
}: BreadcrumbsShellProps): JSX.Element {
  const chain = landingBreadcrumbs(currentId);
  // Skip the trail when the page IS the home page (chain = [Home]).
  const visible = chain.length > 1 ? chain : [];

  return (
    <>
      {visible.length > 0 ? (
        <div className="breadcrumbs-shell" data-testid="breadcrumbs-shell">
          <Breadcrumbs items={visible} />
        </div>
      ) : null}
      {children}
    </>
  );
}

export default BreadcrumbsShell;
