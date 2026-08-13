/**
 * Page header for a docs page — title, section crumb, and the
 * breadcrumbs that lead back to the docs index.
 *
 * Server component. Renders both the breadcrumbs and the H1 so the
 * route file can stay declarative.
 */

import type { JSX } from 'react';
import { landing } from '@domio/ui';
import { DOCS_TREE, type DocsPage, type DocsSection } from '../../lib/docs-tree';

export interface PageHeaderProps {
  readonly section: DocsSection;
  readonly page: DocsPage;
}

function findSectionById(sectionId: string): DocsSection | undefined {
  return DOCS_TREE.find((s) => s.id === sectionId);
}

export function PageHeader({ section, page }: PageHeaderProps): JSX.Element {
  // Re-find the section by id so the type narrows when callers only
  // hand us a flat page reference.
  const canonical = findSectionById(section.id) ?? section;

  return (
    <header className="docs-page-header" data-testid="docs-page-header">
      <nav className="docs-breadcrumbs" aria-label="Breadcrumbs">
        <ol className="docs-breadcrumbs__list">
          <li className="docs-breadcrumbs__item">
            <a className="docs-breadcrumbs__link" href={landing('docs')}>
              Docs
            </a>
          </li>
          <li className="docs-breadcrumbs__item" aria-hidden="true">
            <span className="docs-breadcrumbs__sep">/</span>
          </li>
          <li className="docs-breadcrumbs__item">
            <a
              className="docs-breadcrumbs__link"
              href={landing('docs', { slug: canonical.id })}
            >
              {canonical.title}
            </a>
          </li>
          {page.slug !== 'index' ? (
            <>
              <li className="docs-breadcrumbs__item" aria-hidden="true">
                <span className="docs-breadcrumbs__sep">/</span>
              </li>
              <li className="docs-breadcrumbs__item">
                <span className="docs-breadcrumbs__current">{page.title}</span>
              </li>
            </>
          ) : null}
        </ol>
      </nav>
      <h1 className="docs-page-header__title">{page.title}</h1>
      <p className="docs-page-header__section-eyebrow">{canonical.title}</p>
    </header>
  );
}

export default PageHeader;