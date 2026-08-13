/**
 * Pager — prev / next navigation for long-form content (docs, blog).
 *
 * Per Wave 13. Renders two anchors at the bottom of a page that link
 * to the previous and next sibling nodes. When one of the slots is
 * `undefined` it renders as a disabled placeholder so the layout
 * stays consistent.
 *
 * BEM:
 *   .nav-pager                  — root
 *   .nav-pager__inner           — flex row
 *   .nav-pager__item            — single slot (prev / next)
 *   .nav-pager__item--prev      — left-aligned slot
 *   .nav-pager__item--next      — right-aligned slot
 *   .nav-pager__link            — anchor
 *   .nav-pager__label           — "Previous" / "Next"
 *   .nav-pager__title           — node label
 *   .nav-pager__placeholder      — disabled slot
 */

import type { JSX } from 'react';
import type { NavNode } from './nav-graph.js';

export interface PagerProps {
  readonly prev?: NavNode;
  readonly next?: NavNode;
  readonly testId?: string;
}

export function Pager({ prev, next, testId = 'nav-pager' }: PagerProps): JSX.Element | null {
  if (!prev && !next) return null;
  return (
    <nav
      className="nav-pager"
      aria-label="Pager"
      data-testid={testId}
    >
      <div className="nav-pager__inner">
        <div
          className={`nav-pager__item nav-pager__item--prev${prev ? '' : ' nav-pager__placeholder'}`}
          data-testid={`${testId}-prev`}
        >
          {prev ? (
            <a className="nav-pager__link" href={prev.href}>
              <span className="nav-pager__label">← Previous</span>
              <span className="nav-pager__title">{prev.label}</span>
            </a>
          ) : (
            <span className="nav-pager__link" aria-disabled="true">
              <span className="nav-pager__label">← Previous</span>
            </span>
          )}
        </div>
        <div
          className={`nav-pager__item nav-pager__item--next${next ? '' : ' nav-pager__placeholder'}`}
          data-testid={`${testId}-next`}
        >
          {next ? (
            <a className="nav-pager__link" href={next.href}>
              <span className="nav-pager__label">Next →</span>
              <span className="nav-pager__title">{next.label}</span>
            </a>
          ) : (
            <span className="nav-pager__link" aria-disabled="true">
              <span className="nav-pager__label">Next →</span>
            </span>
          )}
        </div>
      </div>
    </nav>
  );
}