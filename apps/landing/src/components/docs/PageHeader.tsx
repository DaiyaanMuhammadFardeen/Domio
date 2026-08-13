/**
 * Page header for a docs page — title, section crumb, and the
 * breadcrumbs that lead back to the docs index.
 *
 * Per Wave 13: now uses the generic `<Breadcrumbs>` from
 * `@domio/ui`. The `.docs-breadcrumbs*` BEM classes are aliased
 * onto the generic element so existing CSS still applies.
 */

import type { JSX } from 'react';
import { Breadcrumbs } from '@domio/ui';
import type { NavNode } from '@domio/ui';
import { type DocsPage, type DocsSection } from '../../lib/docs-tree';

export interface PageHeaderProps {
  readonly section: DocsSection;
  readonly page: DocsPage;
}

function buildChain(section: DocsSection, page: DocsPage): ReadonlyArray<NavNode> {
  const docsNode: NavNode = {
    id: 'docs-index',
    surface: 'landing',
    category: 'docs',
    label: 'Docs',
    href: '/docs',
  };
  const sectionNode: NavNode = {
    id: `docs-section-${section.id}`,
    surface: 'landing',
    category: 'docs',
    label: section.title,
    href: `/docs/${section.id}`,
  };
  const pageNode: NavNode = {
    id: `docs-page-${section.id}-${page.slug}`,
    surface: 'landing',
    category: 'docs',
    label: page.title,
    href: `/docs/${section.id}/${page.slug}`,
  };
  const out: NavNode[] = [docsNode, sectionNode];
  if (page.slug !== 'index') out.push(pageNode);
  return Object.freeze(out);
}

export function PageHeader({ section, page }: PageHeaderProps): JSX.Element {
  const chain = buildChain(section, page);

  return (
    <header className="docs-page-header" data-testid="docs-page-header">
      <Breadcrumbs items={chain} className="docs-breadcrumbs" testId="docs-breadcrumbs" />
      <h1 className="docs-page-header__title">{page.title}</h1>
      <p className="docs-page-header__section-eyebrow">{section.title}</p>
    </header>
  );
}

export default PageHeader;
