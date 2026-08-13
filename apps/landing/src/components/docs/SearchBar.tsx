/**
 * Local search bar for the docs sidebar.
 *
 * Per Wave 12 §S12.4 the search index is local — we run a substring
 * match across every page title and body and surface the top hits
 * beneath the input. Selecting a hit navigates to its URL.
 */

'use client';

import { useMemo, useState, type JSX } from 'react';
import { landing } from '@domio/ui';
import { searchDocs } from '../../lib/docs-search';
import { DOCS_TREE } from '../../lib/docs-tree';

const SECTION_TITLE: Readonly<Record<string, string>> = Object.freeze(
  DOCS_TREE.reduce<Record<string, string>>((acc, section) => {
    acc[section.id] = section.title;
    return acc;
  }, {}),
);

export interface SearchBarProps {
  readonly placeholder?: string;
  readonly maxResults?: number;
}

export function SearchBar({
  placeholder = 'Search docs…',
  maxResults = 8,
}: SearchBarProps): JSX.Element {
  const [query, setQuery] = useState('');

  const hits = useMemo(() => {
    if (query.trim().length === 0) return [];
    return searchDocs(query).slice(0, maxResults);
  }, [query, maxResults]);

  return (
    <div className="docs-search" data-testid="docs-search">
      <label className="docs-search__label" htmlFor="docs-search-input">
        Search
      </label>
      <input
        id="docs-search-input"
        type="search"
        className="docs-search__input"
        placeholder={placeholder}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        data-testid="docs-search-input"
        autoComplete="off"
        spellCheck={false}
      />
      {query.trim().length > 0 ? (
        <ul className="docs-search__results" data-testid="docs-search-results">
          {hits.length === 0 ? (
            <li className="docs-search__empty">No results.</li>
          ) : (
            hits.map((hit) => {
              const href = landing('docs', { slug: `${hit.section}/${hit.page.slug}` });
              const sectionTitle = SECTION_TITLE[hit.section] ?? hit.section;
              return (
                <li key={`${hit.section}/${hit.page.slug}`} className="docs-search__hit">
                  <a className="docs-search__hit-link" href={href} data-testid="docs-search-hit">
                    <span className="docs-search__hit-title">{hit.page.title}</span>
                    <span className="docs-search__hit-section">{sectionTitle}</span>
                  </a>
                </li>
              );
            })
          )}
        </ul>
      ) : null}
    </div>
  );
}

export default SearchBar;
