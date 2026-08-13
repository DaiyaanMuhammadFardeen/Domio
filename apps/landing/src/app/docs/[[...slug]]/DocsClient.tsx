/**
 * Client-side wrapper for the docs route.
 *
 * The catch-all server route resolves the section + page from the
 * URL and hands them to this wrapper, which composes the sidebar,
 * search bar, page header, and rendered body. The wrapper itself is a
 * server component so the initial HTML ships fully formed; it only
 * nests the (already client-marked) SearchBar.
 *
 * Per Wave 13: prev/next navigation now uses the generic `<Pager>`
 * from `@domio/ui`.
 */

import type { JSX } from 'react';
import { Pager } from '@domio/ui';
import { Sidebar } from '../../../components/docs/Sidebar';
import { SearchBar } from '../../../components/docs/SearchBar';
import { PageHeader } from '../../../components/docs/PageHeader';
import { DOCS_TREE, type DocsPage, type DocsSection } from '../../../lib/docs-tree';

export interface DocsClientProps {
  readonly section: DocsSection;
  readonly page: DocsPage;
  readonly slugSegments: ReadonlyArray<string>;
}

function renderBodyParagraphs(body_md: string): JSX.Element {
  // The Wave 12 spec keeps the body as plain text wrapped in <p> tags
  // (no MDX setup required). We split on blank lines so authors can
  // author multi-paragraph bodies from the data layer.
  const paragraphs = body_md
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  return (
    <>
      {paragraphs.map((para, index) => (
        <p key={index} className="docs-body__paragraph">
          {para}
        </p>
      ))}
    </>
  );
}

const DOCS_FLAT: ReadonlyArray<{ section: DocsSection; page: DocsPage }> = DOCS_TREE.flatMap(
  (section) => section.pages.map((page) => ({ section, page })),
);

function Paginator({ section, page }: { section: DocsSection; page: DocsPage }): JSX.Element {
  const flat = DOCS_FLAT;
  const index = flat.findIndex(
    (entry) => entry.section.id === section.id && entry.page.slug === page.slug,
  );
  const prevEntry = index > 0 ? flat[index - 1] : undefined;
  const nextEntry = index >= 0 && index < flat.length - 1 ? flat[index + 1] : undefined;
  const prev = prevEntry
    ? {
        id: `docs-page-${prevEntry.section.id}-${prevEntry.page.slug}`,
        surface: 'landing' as const,
        category: 'docs' as const,
        label: prevEntry.page.title,
        href: `/docs/${prevEntry.section.id}/${prevEntry.page.slug}`,
      }
    : undefined;
  const next = nextEntry
    ? {
        id: `docs-page-${nextEntry.section.id}-${nextEntry.page.slug}`,
        surface: 'landing' as const,
        category: 'docs' as const,
        label: nextEntry.page.title,
        href: `/docs/${nextEntry.section.id}/${nextEntry.page.slug}`,
      }
    : undefined;
  return <Pager {...(prev ? { prev } : {})} {...(next ? { next } : {})} />;
}

export function DocsClient({ section, page, slugSegments }: DocsClientProps): JSX.Element {
  return (
    <div className="docs-shell">
      <aside className="docs-shell__sidebar" data-testid="docs-shell-sidebar">
        <SearchBar />
        <Sidebar activeSlug={slugSegments} />
      </aside>
      <main className="docs-shell__main" data-testid="docs-shell-main">
        <article className="docs-article">
          <PageHeader section={section} page={page} />
          <div className="docs-body" data-testid="docs-body">
            {renderBodyParagraphs(page.body_md)}
          </div>
          <nav className="docs-pager" aria-label="Page navigation">
            <Paginator section={section} page={page} />
          </nav>
        </article>
      </main>
    </div>
  );
}

export default DocsClient;
