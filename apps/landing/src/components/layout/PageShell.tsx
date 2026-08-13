/**
 * PageShell — composes the standard landing-page chrome:
 *   - `<Breadcrumbs>` (rendered by `BreadcrumbsShell`)
 *   - the page body
 *   - `<RelatedLinks>` footer (resolved through the global nav graph)
 *
 * Use this for any landing page that has a `nav-sitemap.ts` node.
 * Pages without graph entries (e.g. login) skip the shell.
 *
 * Per Wave 13. Keeps every landing consumer's breadcrumb / related-
 * links logic identical and centralized.
 */

import type { JSX, ReactNode } from 'react';
import { RelatedLinks, relatedFor } from '@domio/ui';
import { BreadcrumbsShell } from './BreadcrumbsShell';
import { landingNodeById } from '../../lib/nav-sitemap';

export interface PageShellProps {
  /** The id of the current page in `nav-sitemap.ts`. */
  readonly currentId: string;
  readonly children: ReactNode;
  /** Heading for the related-links rail (default "Related"). */
  readonly relatedTitle?: string;
  /** Optional class on the related-links rail. */
  readonly relatedClassName?: string;
  /** Disable the related-links footer for pages where it doesn't fit. */
  readonly hideRelated?: boolean;
  /**
   * Disable the standard breadcrumbs. Use this when the page renders
   * its own breadcrumbs (e.g. the docs PageHeader uses the generic
   * `<Breadcrumbs>` directly).
   */
  readonly hideBreadcrumbs?: boolean;
}

export function PageShell({
  currentId,
  children,
  relatedTitle = 'Related',
  relatedClassName,
  hideRelated = false,
  hideBreadcrumbs = false,
}: PageShellProps): JSX.Element {
  const node = landingNodeById(currentId);
  const related = node ? relatedFor(node) : [];

  if (hideBreadcrumbs) {
    return (
      <>
        {children}
        {!hideRelated ? (
          <RelatedLinks
            items={related}
            title={relatedTitle}
            {...(relatedClassName ? { className: relatedClassName } : {})}
            testId={`page-related-${currentId}`}
          />
        ) : null}
      </>
    );
  }

  return (
    <BreadcrumbsShell currentId={currentId}>
      {children}
      {!hideRelated ? (
        <RelatedLinks
          items={related}
          title={relatedTitle}
          {...(relatedClassName ? { className: relatedClassName } : {})}
          testId={`page-related-${currentId}`}
        />
      ) : null}
    </BreadcrumbsShell>
  );
}

export default PageShell;
