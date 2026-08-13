/**
 * Sanity tests for the blog data layer.
 *
 * Wave 12 §S12.10 — Blog. Ensures the data feed has the shape the
 * /blog index, /blog/[slug] pages, and /blog/rss.xml endpoint rely on.
 */

import { describe, expect, it } from 'vitest';
import { BLOG_POSTS, BLOG_CATEGORIES } from './blog-data';

describe('blog-data', () => {
  it('exports at least 10 posts', () => {
    expect(BLOG_POSTS.length).toBeGreaterThanOrEqual(10);
  });

  it('exports exactly 4 categories', () => {
    expect(BLOG_CATEGORIES.length).toBe(4);
  });

  it('exports 4 known categories in the documented order', () => {
    expect(BLOG_CATEGORIES).toEqual([
      'engineering',
      'product',
      'customer-stories',
      'company',
    ]);
  });

  it('posts are sorted newest-first', () => {
    for (let i = 1; i < BLOG_POSTS.length; i++) {
      const prev = BLOG_POSTS[i - 1]!.published_at_iso;
      const cur = BLOG_POSTS[i]!.published_at_iso;
      expect(
        Date.parse(prev),
        `post ${i - 1} (${prev}) should be >= post ${i} (${cur})`,
      ).toBeGreaterThanOrEqual(Date.parse(cur));
    }
  });

  it('every post is dated within 2026', () => {
    for (const post of BLOG_POSTS) {
      const year = new Date(post.published_at_iso).getUTCFullYear();
      expect(year, `${post.slug} should be 2026`).toBe(2026);
    }
  });

  it('every post has a unique slug', () => {
    const slugs = BLOG_POSTS.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('every post has an author with a name + role + initials', () => {
    for (const post of BLOG_POSTS) {
      expect(post.author.name.length).toBeGreaterThan(0);
      expect(post.author.role.length).toBeGreaterThan(0);
      expect(post.author.avatar_initials.length).toBeGreaterThan(0);
    }
  });

  it('every post has at least one tag', () => {
    for (const post of BLOG_POSTS) {
      expect(post.tags.length, `${post.slug} tags`).toBeGreaterThan(0);
    }
  });

  it('every post has a non-empty body', () => {
    for (const post of BLOG_POSTS) {
      expect(post.body_md.length, `${post.slug} body`).toBeGreaterThan(0);
    }
  });

  it('every post has a non-empty excerpt and title', () => {
    for (const post of BLOG_POSTS) {
      expect(post.title.length, `${post.slug} title`).toBeGreaterThan(0);
      expect(post.excerpt.length, `${post.slug} excerpt`).toBeGreaterThan(0);
    }
  });

  it('every post category is one of the 4 known categories', () => {
    const allowed = new Set<string>(BLOG_CATEGORIES);
    for (const post of BLOG_POSTS) {
      expect(allowed.has(post.category), `${post.slug} category`).toBe(true);
    }
  });

  it('posts cover every category', () => {
    const seen = new Set(BLOG_POSTS.map((p) => p.category));
    for (const cat of BLOG_CATEGORIES) {
      expect(seen.has(cat), `category ${cat} should have at least one post`).toBe(
        true,
      );
    }
  });

  it('reading_minutes is positive for every post', () => {
    for (const post of BLOG_POSTS) {
      expect(post.reading_minutes, `${post.slug} reading_minutes`).toBeGreaterThan(
        0,
      );
    }
  });
});