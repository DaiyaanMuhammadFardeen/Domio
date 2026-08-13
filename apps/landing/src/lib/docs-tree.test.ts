/**
 * Sanity tests for the docs tree.
 *
 * Guards against the catalogue drifting below the documented surface
 * area (12 sections, 5+ pages each) and against any page losing its
 * required fields.
 */

import { describe, expect, it } from 'vitest';
import { DOCS_TREE, type DocsSection } from './docs-tree';

const EXPECTED_SECTION_IDS: ReadonlyArray<string> = [
  'getting-started',
  'editor',
  'viewer',
  'presenter',
  'audience',
  'sharing',
  'ai',
  'analytics',
  'marketplace',
  'enterprise',
  'agentic',
  'api-reference',
];

describe('docs-tree', () => {
  it('exports exactly the 12 documented section ids, in order', () => {
    expect(DOCS_TREE).toHaveLength(12);
    const ids = DOCS_TREE.map((s) => s.id);
    expect(ids).toEqual(EXPECTED_SECTION_IDS);
  });

  it('every section has a non-empty title and id', () => {
    for (const section of DOCS_TREE) {
      expect(section.id.length).toBeGreaterThan(0);
      expect(section.title.length).toBeGreaterThan(0);
    }
  });

  it('every section has at least 5 pages', () => {
    for (const section of DOCS_TREE) {
      expect(
        section.pages.length,
        `section ${section.id} should have 5+ pages`,
      ).toBeGreaterThanOrEqual(5);
    }
  });

  it('every page has a non-empty slug, title, and body', () => {
    for (const section of DOCS_TREE) {
      for (const page of section.pages) {
        expect(page.slug.length, `page slug in ${section.id} should be non-empty`).toBeGreaterThan(0);
        expect(page.title.length, `page title in ${section.id} should be non-empty`).toBeGreaterThan(0);
        expect(page.body_md.length, `page body in ${section.id} should be non-empty`).toBeGreaterThan(0);
      }
    }
  });

  it('every page has a unique slug within its section', () => {
    for (const section of DOCS_TREE) {
      const slugs = section.pages.map((p) => p.slug);
      const set = new Set(slugs);
      expect(set.size, `section ${section.id} should have unique slugs`).toBe(slugs.length);
    }
  });

  it('every section exposes an index page', () => {
    for (const section of DOCS_TREE) {
      const hasIndex = section.pages.some((p) => p.slug === 'index');
      expect(hasIndex, `section ${section.id} should have an index page`).toBe(true);
    }
  });

  it('sections collectively expose at least 60 pages', () => {
    const totalPages = DOCS_TREE.reduce((sum: number, s: DocsSection) => sum + s.pages.length, 0);
    expect(totalPages).toBeGreaterThanOrEqual(60);
  });
});
