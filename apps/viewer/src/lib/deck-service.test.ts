/**
 * Viewer deck-service tests.
 *
 * Per Wave 3 §S3.1 of docs/frontend-roadmap/03-wave-viewer-publishing.md.
 */

import { describe, it, expect } from 'vitest';
import { fetchViewerDeck, fetchViewerSlide, computeDeepLinks, canonicalDeckUrl, scrollModeUrl } from './deck-service';

describe('deck-service', () => {
  it('fetchViewerDeck returns a deck resolution with bootstrap=true', async () => {
    const res = await fetchViewerDeck('demo-1');
    expect(res.bootstrap).toBe(true);
    expect(res.deck.id).toBeTruthy();
    expect(res.deck.slides.length).toBeGreaterThan(0);
  });

  it('fetchViewerSlide resolves a valid index', async () => {
    const res = await fetchViewerSlide('demo', 0);
    expect(res).not.toBeNull();
    expect(res!.slideIdx).toBe(0);
    expect(res!.slide).toBeTruthy();
  });

  it('fetchViewerSlide returns null for out-of-range index', async () => {
    const res = await fetchViewerSlide('demo', 9999);
    expect(res).toBeNull();
  });

  it('fetchViewerSlide returns null for negative index', async () => {
    const res = await fetchViewerSlide('demo', -1);
    expect(res).toBeNull();
  });

  it('computeDeepLinks returns prev + next for middle slides', async () => {
    const { deck } = await fetchViewerDeck('demo');
    if (deck.slides.length < 3) return;
    const links = computeDeepLinks(deck, 1);
    expect(links.length).toBe(2);
    expect(links[0]?.label).toContain('Slide 1');
    expect(links[1]?.label).toContain('Slide 3');
  });

  it('computeDeepLinks returns only next for first slide', async () => {
    const { deck } = await fetchViewerDeck('demo');
    if (deck.slides.length < 2) return;
    const links = computeDeepLinks(deck, 0);
    expect(links.length).toBe(1);
    expect(links[0]?.label).toContain('Slide 2');
  });

  it('computeDeepLinks returns only prev for last slide', async () => {
    const { deck } = await fetchViewerDeck('demo');
    const lastIdx = deck.slides.length - 1;
    const links = computeDeepLinks(deck, lastIdx);
    if (deck.slides.length > 1) {
      expect(links.length).toBe(1);
      expect(links[0]?.label).toContain(`Slide ${lastIdx}`);
    }
  });

  it('canonicalDeckUrl includes slideIdx when supplied', () => {
    expect(canonicalDeckUrl('abc', 0)).toBe('https://deck.domio.app/abc/0');
    expect(canonicalDeckUrl('abc')).toBe('https://deck.domio.app/abc');
  });

  it('scrollModeUrl omits start when startIdx is 0', () => {
    expect(scrollModeUrl('abc', 0)).toBe('https://deck.domio.app/abc/scroll');
    expect(scrollModeUrl('abc')).toBe('https://deck.domio.app/abc/scroll');
  });

  it('scrollModeUrl includes start when startIdx > 0', () => {
    expect(scrollModeUrl('abc', 3)).toBe('https://deck.domio.app/abc/scroll?start=3');
  });
});