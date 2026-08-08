import { describe, expect, it } from 'vitest';
import {
  checkBlocklist,
  DEFAULT_BLOCKLIST,
  flagWithMl,
  resetMlScorer,
  setMlScorer,
  type MlScorer,
} from './index.js';

describe('moderation.blocklist', () => {
  it('returns blocked=false for clean input', () => {
    const result = checkBlocklist('hello world', { needles: ['badword'] });
    expect(result.blocked).toBe(false);
    expect(result.matches).toHaveLength(0);
  });

  it('finds a single blocklist match', () => {
    const result = checkBlocklist('this is badword here', { needles: ['badword'] });
    expect(result.blocked).toBe(true);
    expect(result.matches).toEqual([{ needle: 'badword', offset: 8 }]);
  });

  it('finds multiple matches of the same needle', () => {
    const result = checkBlocklist('badword and badword', { needles: ['badword'] });
    expect(result.matches).toHaveLength(2);
  });

  it('is case-insensitive via normalization', () => {
    const result = checkBlocklist('BadWord!', { needles: ['badword'] });
    expect(result.blocked).toBe(true);
  });

  it('prefers longer needles', () => {
    const result = checkBlocklist('foo bar baz', { needles: ['foo bar', 'bar'] });
    // The longest needle is matched first; "bar" alone is found as a
    // sub-match, but checkBlocklist reports both.
    expect(result.matches.map((m) => m.needle)).toContain('foo bar');
    expect(result.matches.map((m) => m.needle)).toContain('bar');
  });

  it('returns empty matches when needle list is empty', () => {
    const result = checkBlocklist('hello');
    expect(result.blocked).toBe(false);
    expect(result.matches).toHaveLength(0);
  });

  it('skips empty needles silently', () => {
    const result = checkBlocklist('hello', { needles: ['', '   '] });
    expect(result.matches).toHaveLength(0);
  });

  it('exposes a default (empty) blocklist', () => {
    expect(Array.isArray(DEFAULT_BLOCKLIST)).toBe(true);
  });
});

describe('moderation.ml-flag', () => {
  it('returns flagged=false with the null scorer', async () => {
    resetMlScorer();
    const result = await flagWithMl('whatever');
    expect(result.flagged).toBe(false);
    expect(result.score.score).toBe(0);
  });

  it('honours a custom MlScorer', async () => {
    const stub: MlScorer = {
      score: async () => ({ score: 0.95, categories: ['hate'] }),
    };
    setMlScorer(stub);
    const result = await flagWithMl('whatever', 0.9);
    expect(result.flagged).toBe(true);
    expect(result.score.categories).toEqual(['hate']);
  });

  it('respects the threshold', async () => {
    const stub: MlScorer = {
      score: async () => ({ score: 0.5, categories: [] }),
    };
    setMlScorer(stub);
    expect((await flagWithMl('x', 0.9)).flagged).toBe(false);
    expect((await flagWithMl('x', 0.4)).flagged).toBe(true);
  });

  it('resetMlScorer returns to null scorer', async () => {
    setMlScorer({ score: async () => ({ score: 1.0, categories: ['x'] }) });
    resetMlScorer();
    const result = await flagWithMl('x');
    expect(result.score.score).toBe(0);
  });
});