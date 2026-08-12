/**
 * Lottie — Wave 2 §S2.4 unit tests.
 *
 * Verifies the bootstrap seam API works against the curated fallback
 * so the InsertPanel can render before lottieFiles is wired.
 */

import { describe, expect, it } from 'vitest';
import { LOTTIE_ANIMATIONS, searchLottie } from './lottie';

describe('lottie', () => {
  it('ships a curated starter catalog', () => {
    expect(LOTTIE_ANIMATIONS.length).toBeGreaterThan(0);
  });

  it('searchLottie returns the fallback catalog', async () => {
    const res = await searchLottie();
    expect(res.fallback).toBe(true);
    expect(res.total).toBe(LOTTIE_ANIMATIONS.length);
  });

  it('searchLottie filters by tag/title', async () => {
    const res = await searchLottie({ query: 'success' });
    expect(res.animations.length).toBeGreaterThan(0);
  });
});