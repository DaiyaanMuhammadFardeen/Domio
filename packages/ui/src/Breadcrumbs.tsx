/**
 * Breadcrumbs — generic trail from root to current page.
 *
 * Per Wave 13. Renders a list of `NavNode` items separated by an
 * aria-hidden `/`. The last item is marked `aria-current="page"` and
 * rendered as a `<span>` (not a link).
 *
 * BEM:
 *   .nav-breadcrumbs             — root
 *   .nav-breadcrumbs__list       — <ol>
 *   .nav-breadcrumbs__item       — <li>
 *   .nav-breadcrumbs__link       — anchor
 *   .nav-breadcrumbs__current    — last item (span)
 *   .nav-breadcrumbs__sep        — separator between items
 */

import type { JSX } from 'react';
import type { NavNode } from './nav-graph.js';

export interface BreadcrumbsProps {
  /** Root → leaf chain. Already in display order (Home first). */
  readonly items: ReadonlyArray<NavNode>;
  /** Optional class on the root `<nav>` for per-surface BEM overrides. */
  readonly className?: string;
  /** Optional testid override (default `nav-breadcrumbs`). */
  readonly testId?: string;
}

export function Breadcrumbs({
  items,
  className,
  testId = 'nav-breadcrumbs',
}: BreadcrumbsProps): JSX.Element | null {
  if (items.length === 0) return null;
  const rootClass = className ? `nav-breadcrumbs ${className}` : 'nav-breadcrumbs';

  return (
    <nav className={rootClass} aria-label="Breadcrumbs" data-testid={testId}>
      <ol className="nav-breadcrumbs__list">
        {items.map((node, index) => {
          const isLast = index === items.length - 1;
          return (
            <li key={node.id} className="nav-breadcrumbs__item">
              {isLast ? (
                <span
                  className="nav-breadcrumbs__current"
                  aria-current="page"
                  data-testid={`${testId}-current`}
                >
                  {node.label}
                </span>
              ) : (
                <a
                  className="nav-breadcrumbs__link"
                  href={node.href}
                  data-testid={`${testId}-link-${node.id}`}
                >
                  {node.label}
                </a>
              )}
              {!isLast ? (
                <span className="nav-breadcrumbs__sep" aria-hidden="true">
                  /
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
