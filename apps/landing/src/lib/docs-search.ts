/**
 * Local full-text search for the docs site.
 *
 * The docs index is small enough (12 sections × ~5 pages) to live in
 * memory and run on every keystroke. We score pages by counting
 * substring matches across the title, body, and section id, then
 * surface the top hits in score order.
 *
 * Per the Wave 12 §S12.4 spec:
 *   - Search uses simple substring match.
 *   - Score = number of matches.
 *   - Results include the section id, the matching page, and the score.
 */

import { DOCS_TREE, type DocsPage, type DocsSection } from './docs-tree';

export interface DocsSearchHit {
  readonly section: string;
  readonly page: DocsPage;
  readonly score: number;
}

export const SECTION_ID_TO_TITLE: Readonly<Record<string, string>> = Object.freeze(
  DOCS_TREE.reduce<Record<string, string>>((acc, section) => {
    acc[section.id] = section.title;
    return acc;
  }, {}),
);

/**
 * Returns true when the query is meaningful enough to search against.
 * Empty strings and pure whitespace return false; everything else is
 * trimmed and lower-cased before being scored.
 */
export function isMeaningfulQuery(query: string): boolean {
  return query.trim().length > 0;
}

function normalise(query: string): string {
  return query.trim().toLowerCase();
}

/**
 * Counts case-insensitive occurrences of `needle` inside `haystack`.
 * Both inputs are lower-cased before counting.
 */
function countOccurrences(haystack: string, needle: string): number {
  if (needle.length === 0) return 0;
  const lowerHay = haystack.toLowerCase();
  let count = 0;
  let index = lowerHay.indexOf(needle);
  while (index !== -1) {
    count += 1;
    index = lowerHay.indexOf(needle, index + needle.length);
  }
  return count;
}

/**
 * Scores a single page by counting how many times the query appears
 * in the title, body, or section id. Title hits are weighted double
 * because users usually type query terms that match titles.
 */
function scorePage(query: string, section: DocsSection, page: DocsPage): number {
  const titleHits = countOccurrences(page.title, query);
  const bodyHits = countOccurrences(page.body_md, query);
  const sectionHits = countOccurrences(section.id, query);
  const sectionTitleHits = countOccurrences(section.title, query);
  return titleHits * 2 + bodyHits + sectionHits + sectionTitleHits;
}

/**
 * Search the docs index for `query`.
 *
 * Returns hits in score-descending order. Empty or whitespace-only
 * queries return an empty array.
 */
export function searchDocs(query: string): ReadonlyArray<DocsSearchHit> {
  if (!isMeaningfulQuery(query)) return [];
  const needle = normalise(query);
  if (needle.length === 0) return [];

  const hits: DocsSearchHit[] = [];
  for (const section of DOCS_TREE) {
    for (const page of section.pages) {
      const score = scorePage(needle, section, page);
      if (score > 0) {
        hits.push({ section: section.id, page, score });
      }
    }
  }

  hits.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    // Stable tiebreak: section order, then page order.
    const sectionDiff = DOCS_TREE.findIndex((s) => s.id === a.section) -
      DOCS_TREE.findIndex((s) => s.id === b.section);
    if (sectionDiff !== 0) return sectionDiff;
    const aPageIndex = DOCS_TREE
      .find((s) => s.id === a.section)!
      .pages.findIndex((p) => p.slug === a.page.slug);
    const bPageIndex = DOCS_TREE
      .find((s) => s.id === b.section)!
      .pages.findIndex((p) => p.slug === b.page.slug);
    return aPageIndex - bPageIndex;
  });

  return hits;
}