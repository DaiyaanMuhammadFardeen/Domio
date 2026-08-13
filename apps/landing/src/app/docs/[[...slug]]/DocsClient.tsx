/**
 * Client-side wrapper for the docs route.
 *
 * The catch-all server route resolves the section + page from the
 * URL and hands them to this wrapper, which composes the sidebar,
 * search bar, page header, and rendered body. The wrapper itself is a
 * server component so the initial HTML ships fully formed; it only
 * nests the (already client-marked) SearchBar.
 */

import type { JSX } from 'react';
import { landing } from '@domio/ui';
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
  const index = flat.findIndex((entry) => entry.section.id === section.id && entry.page.slug === page.slug);
  const prev = index > 0 ? flat[index - 1] : undefined;
  const next = index >= 0 && index < flat.length - 1 ? flat[index + 1] : undefined;
  return (
    <div className="docs-pager__row" data-testid="docs-pager">
      {prev ? (
        <a
          className="docs-pager__link docs-pager__link--prev"
          href={landing('docs', { slug: `${prev.section.id}/${prev.page.slug}` })}
        >
          <span className="docs-pager__direction">← Previous</span>
          <span className="docs-pager__title">{prev.page.title}</span>
        </a>
      ) : (
        <span className="docs-pager__placeholder" />
      )}
      {next ? (
        <a
          className="docs-pager__link docs-pager__link--next"
          href={landing('docs', { slug: `${next.section.id}/${next.page.slug}` })}
        >
          <span className="docs-pager__direction">Next →</span>
          <span className="docs-pager__title">{next.page.title}</span>
        </a>
      ) : (
        <span className="docs-pager__placeholder" />
      )}
    </div>
  );
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