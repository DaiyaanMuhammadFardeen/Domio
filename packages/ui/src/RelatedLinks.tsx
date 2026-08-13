/**
 * RelatedLinks — rail of cross-link cards for the current page.
 *
 * Per Wave 13. Renders a list of `NavNode` items as cards linking to
 * adjacent pages (siblings + seeAlso). When `items` is empty, an
 * empty-state paragraph is rendered so the layout never collapses.
 *
 * BEM:
 *   .nav-related                — root
 *   .nav-related__heading       — section title
 *   .nav-related__list          — <ul>
 *   .nav-related__item          — <li>
 *   .nav-related__link          — <a>
 *   .nav-related__card          — card wrapper around link
 *   .nav-related__title         — node label
 *   .nav-related__tagline       — optional tagline
 *   .nav-related__empty         — empty state
 */

import type { JSX } from 'react';
import type { NavNode } from './nav-graph.js';

export interface RelatedLinksProps {
  readonly items: ReadonlyArray<NavNode>;
  /** Section heading (default "Related"). */
  readonly title?: string;
  /** Per-surface class for BEM overrides. */
  readonly className?: string;
  /** Test id root. Default `nav-related`. */
  readonly testId?: string;
}

export function RelatedLinks({
  items,
  title = 'Related',
  className,
  testId = 'nav-related',
}: RelatedLinksProps): JSX.Element {
  const rootClass = className ? `nav-related ${className}` : 'nav-related';

  return (
    <section className={rootClass} aria-labelledby={`${testId}-heading`} data-testid={testId}>
      <h2 id={`${testId}-heading`} className="nav-related__heading">
        {title}
      </h2>
      {items.length === 0 ? (
        <p className="nav-related__empty" data-testid={`${testId}-empty`}>
          No related links yet.
        </p>
      ) : (
        <ul className="nav-related__list">
          {items.map((node) => (
            <li
              key={node.id}
              className="nav-related__item"
              data-testid={`${testId}-item`}
              data-node-id={node.id}
            >
              <a
                className="nav-related__link"
                href={node.href}
                aria-label={`Read about ${node.label}`}
              >
                <span className="nav-related__card">
                  <span className="nav-related__title">{node.label}</span>
                  {node.tagline ? (
                    <span className="nav-related__tagline">{node.tagline}</span>
                  ) : null}
                  <span className="nav-related__arrow" aria-hidden="true">
                    →
                  </span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
