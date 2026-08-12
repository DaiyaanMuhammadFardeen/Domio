/**
 * SEO service tests.
 *
 * Per Wave 3 §S3.1 + §S3.9 of docs/frontend-roadmap/03-wave-viewer-publishing.md.
 */

import { describe, it, expect } from 'vitest';
import { bootstrapSeoForDeck } from './seo-service';

describe('seo-service', () => {
  it('bootstrapSeoForDeck synthesizes a deterministic bundle', async () => {
    const seo = await bootstrapSeoForDeck('demo', 'Pitch Deck');
    expect(seo.deckId).toBe('demo');
    expect(seo.title).toBe('Pitch Deck');
    expect(seo.description).toContain('Pitch Deck');
    expect(seo.canonicalUrl).toContain('/demo');
    expect(seo.ogImageUrl).toBeTruthy();
    expect(seo.robots).toBe('index,follow');
  });

  it('ogImageUrl points at /api/og/{deckId}', async () => {
    const seo = await bootstrapSeoForDeck('abc', 'Title');
    expect(seo.ogImageUrl).toContain('/abc');
  });
});