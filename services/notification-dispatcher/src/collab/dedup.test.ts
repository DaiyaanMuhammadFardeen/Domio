import { describe, it, expect } from 'vitest';
import { MentionDedup } from './dedup.js';

describe('MentionDedup', () => {
  it('first 5 mentions within window are not deduped', () => {
    const dedup = new MentionDedup({ windowMs: 30_000, maxCount: 5 });
    const base = 1700000000000;
    for (let i = 0; i < 5; i++) {
      expect(dedup.isDeduped('u-1', base + i * 1000)).toBe(false);
    }
  });

  it('6th mention within window is deduped', () => {
    const dedup = new MentionDedup({ windowMs: 30_000, maxCount: 5 });
    const base = 1700000000000;
    for (let i = 0; i < 5; i++) {
      dedup.isDeduped('u-1', base + i * 1000);
    }
    expect(dedup.isDeduped('u-1', base + 5000)).toBe(true);
  });

  it('7th mention within window is also deduped', () => {
    const dedup = new MentionDedup({ windowMs: 30_000, maxCount: 5 });
    const base = 1700000000000;
    for (let i = 0; i < 5; i++) {
      dedup.isDeduped('u-1', base + i * 1000);
    }
    expect(dedup.isDeduped('u-1', base + 5000)).toBe(true);
    expect(dedup.isDeduped('u-1', base + 6000)).toBe(true);
  });

  it('mention outside the window is not deduped', () => {
    const dedup = new MentionDedup({ windowMs: 30_000, maxCount: 5 });
    const base = 1700000000000;
    // Fill the window.
    for (let i = 0; i < 5; i++) {
      dedup.isDeduped('u-1', base + i);
    }
    // After the window expires, the next mention should not be deduped.
    expect(dedup.isDeduped('u-1', base + 31_000)).toBe(false);
  });

  it('window expiry resets the count', () => {
    const dedup = new MentionDedup({ windowMs: 30_000, maxCount: 5 });
    const base = 1700000000000;
    // Fill the window.
    for (let i = 0; i < 5; i++) {
      dedup.isDeduped('u-1', base + i);
    }
    // Advance past the window.
    const afterWindow = base + 31_000;
    // First mention after window — not deduped.
    expect(dedup.isDeduped('u-1', afterWindow)).toBe(false);
    // Second through fifth — still not deduped.
    for (let i = 1; i < 5; i++) {
      expect(dedup.isDeduped('u-1', afterWindow + i * 1000)).toBe(false);
    }
    // Sixth — deduped again.
    expect(dedup.isDeduped('u-1', afterWindow + 5000)).toBe(true);
  });

  it('different recipients are tracked independently', () => {
    const dedup = new MentionDedup({ windowMs: 30_000, maxCount: 5 });
    const base = 1700000000000;
    // Fill u-1's window.
    for (let i = 0; i < 5; i++) {
      dedup.isDeduped('u-1', base + i);
    }
    // u-2 should not be affected.
    expect(dedup.isDeduped('u-2', base + 5000)).toBe(false);
  });

  it('uses default config (30s window, 5 max)', () => {
    const dedup = new MentionDedup();
    const base = 1700000000000;
    for (let i = 0; i < 5; i++) {
      expect(dedup.isDeduped('u-1', base + i * 1000)).toBe(false);
    }
    expect(dedup.isDeduped('u-1', base + 5000)).toBe(true);
  });
});
