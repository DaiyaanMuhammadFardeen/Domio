/**
 * Sanity tests for the Help center KB catalogue.
 *
 * Guards against regressions where the catalogue is trimmed below the
 * documented surface area or where a category stops claiming at least
 * two articles. The `searchArticles` test verifies the local index
 * still matches the documented contract.
 */

import { describe, expect, it } from 'vitest';
import {
  KB_ARTICLES,
  KB_CATEGORIES,
  articleBySlug,
  categoryForSlug,
  searchArticles,
  type KbArticle,
  type KbCategory,
} from './help-data';

describe('help-data', () => {
  it('ships 15 or more articles covering every support surface', () => {
    expect(KB_ARTICLES.length).toBeGreaterThanOrEqual(15);
  });

  it('exposes 5 or more top-level categories', () => {
    expect(KB_CATEGORIES.length).toBeGreaterThanOrEqual(5);
  });

  it('every category has at least 2 articles in its slug list', () => {
    for (const category of KB_CATEGORIES) {
      expect(category.article_slugs.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('every article slug listed by a category resolves to an article', () => {
    for (const category of KB_CATEGORIES) {
      for (const slug of category.article_slugs) {
        const article = articleBySlug(slug);
        expect(article, `category ${category.id} listed missing slug ${slug}`).toBeDefined();
        expect(article!.category_id).toBe(category.id);
      }
    }
  });

  it('every article has the required fields populated', () => {
    for (const article of KB_ARTICLES) {
      expect(article.slug.length).toBeGreaterThan(0);
      expect(article.title.length).toBeGreaterThan(0);
      expect(article.summary.length).toBeGreaterThan(0);
      expect(article.category_id.length).toBeGreaterThan(0);
      expect(article.body_md.length).toBeGreaterThan(0);
      expect(Array.isArray(article.related_slugs)).toBe(true);
      expect(article.updated_at_iso).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    }
  });

  it('every related_slugs entry points at an existing article', () => {
    for (const article of KB_ARTICLES) {
      for (const related of article.related_slugs) {
        const target = articleBySlug(related);
        expect(target, `${article.slug} -> ${related}`).toBeDefined();
      }
    }
  });

  it('categoryForSlug resolves a known slug back to its category', () => {
    const category = categoryForSlug('create-first-deck');
    expect(category).toBeDefined();
    expect(category!.id).toBe('getting-started');
  });

  it('articleBySlug returns undefined for an unknown slug', () => {
    expect(articleBySlug('does-not-exist')).toBeUndefined();
  });

  it('searchArticles returns an empty list for whitespace queries', () => {
    expect(searchArticles('')).toEqual([]);
    expect(searchArticles('   ')).toEqual([]);
  });

  it('searchArticles finds articles by title match', () => {
    const hits = searchArticles('create your first deck');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]!.slug).toBe('create-first-deck');
  });

  it('searchArticles finds articles by summary match', () => {
    const hits = searchArticles('shareable');
    expect(hits.length).toBeGreaterThan(0);
  });

  it('searchArticles finds articles by body content match', () => {
    const hits = searchArticles('operational transforms');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]!.slug).toBe('sync-conflict-resolution');
  });

  it('searchArticles orders hits by score, not by index', () => {
    const hits = searchArticles('SSO');
    expect(hits.length).toBeGreaterThan(0);
    const firstHit = hits[0]!;
    expect(firstHit.category_id).toBe('enterprise');
  });

  it('every category id is referenced by at least one article', () => {
    const referenced = new Set(KB_ARTICLES.map((a) => a.category_id));
    for (const category of KB_CATEGORIES) {
      expect(referenced.has(category.id), `category ${category.id} has no articles`).toBe(true);
    }
  });

  it('category and article type exports exist for downstream typing', () => {
    const cat: KbCategory = KB_CATEGORIES[0]!;
    const art: KbArticle = KB_ARTICLES[0]!;
    expect(typeof cat.id).toBe('string');
    expect(typeof art.slug).toBe('string');
  });
});
