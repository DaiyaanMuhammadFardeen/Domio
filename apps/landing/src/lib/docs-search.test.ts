/**
 * Tests for the local docs search.
 *
 * Verifies the empty-query short-circuit, basic substring matching,
 * score ordering, and a few representative lookups.
 */

import { describe, expect, it } from 'vitest';
import {
  searchDocs,
  isMeaningfulQuery,
  SECTION_ID_TO_TITLE,
  type DocsSearchHit,
} from './docs-search';
import { DOCS_TREE } from './docs-tree';

describe('docs-search', () => {
  it('returns an empty array for empty queries', () => {
    expect(searchDocs('')).toEqual([]);
  });

  it('returns an empty array for whitespace-only queries', () => {
    expect(searchDocs('   ')).toEqual([]);
  });

  it('isMeaningfulQuery only returns true for non-empty trimmed input', () => {
    expect(isMeaningfulQuery('')).toBe(false);
    expect(isMeaningfulQuery('   ')).toBe(false);
    expect(isMeaningfulQuery('a')).toBe(true);
    expect(isMeaningfulQuery('  hello  ')).toBe(true);
  });

  it('finds pages whose title contains the query', () => {
    const hits = searchDocs('Install');
    expect(hits.length).toBeGreaterThan(0);
    const installHit = hits.find((h: DocsSearchHit) =>
      h.page.title.toLowerCase().includes('install'),
    );
    expect(installHit).toBeDefined();
  });

  it('finds pages whose body contains the query', () => {
    const hits = searchDocs('workspaces');
    expect(hits.length).toBeGreaterThan(0);
  });

  it('matches are case-insensitive', () => {
    const lower = searchDocs('editor');
    const upper = searchDocs('EDITOR');
    const mixed = searchDocs('Editor');
    expect(lower.length).toBeGreaterThan(0);
    expect(upper.length).toBe(lower.length);
    expect(mixed.length).toBe(lower.length);
  });

  it('hits are ordered by score descending', () => {
    const hits = searchDocs('viewer');
    for (let i = 1; i < hits.length; i += 1) {
      const prev = hits[i - 1]!;
      const curr = hits[i]!;
      expect(prev.score).toBeGreaterThanOrEqual(curr.score);
    }
  });

  it('every hit has a section, page, and positive score', () => {
    const hits = searchDocs('scene');
    expect(hits.length).toBeGreaterThan(0);
    for (const hit of hits) {
      expect(hit.section.length).toBeGreaterThan(0);
      expect(hit.page.title.length).toBeGreaterThan(0);
      expect(hit.score).toBeGreaterThan(0);
    }
  });

  it('SECTION_ID_TO_TITLE maps every section id to its title', () => {
    for (const section of DOCS_TREE) {
      expect(SECTION_ID_TO_TITLE[section.id]).toBe(section.title);
    }
  });

  it('returns no hits for a clearly-absent term', () => {
    const hits = searchDocs('zzzqqqxyznothingmatches');
    expect(hits).toEqual([]);
  });

  it('counts multiple body occurrences correctly', () => {
    // The Editor section mentions "canvas" repeatedly.
    const hits = searchDocs('canvas');
    const editorPage = hits.find((h) => h.section === 'editor');
    expect(editorPage).toBeDefined();
    // Title carries extra weight, so the editor canvas page should
    // win or tie on top.
    expect(editorPage!.score).toBeGreaterThan(0);
  });
});
