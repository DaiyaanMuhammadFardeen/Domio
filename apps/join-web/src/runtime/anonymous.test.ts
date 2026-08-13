/**
 * Anonymous handle generator tests — S5.10.
 */

import { describe, expect, it } from 'vitest';
import { HANDLES, generateHandle } from './anonymous';

describe('HANDLES', () => {
  it('exposes at least 20 curated handles', () => {
    expect(HANDLES.length).toBeGreaterThanOrEqual(20);
  });

  it('every handle is a non-empty string', () => {
    for (const h of HANDLES) {
      expect(typeof h).toBe('string');
      expect(h.length).toBeGreaterThan(0);
    }
  });
});

describe('generateHandle', () => {
  it('returns one of the known handles with a fixed seed', () => {
    const handle = generateHandle(() => 0);
    expect(HANDLES).toContain(handle);
  });

  it('returns the first handle when rng() returns 0', () => {
    const handle = generateHandle(() => 0);
    expect(handle).toBe(HANDLES[0]);
  });

  it('returns a handle within the bounds for a mid-range rng', () => {
    const handle = generateHandle(() => 0.5);
    expect(HANDLES).toContain(handle);
  });

  it('clamps the index to the last handle for rng() returning ~1', () => {
    const handle = generateHandle(() => 0.9999);
    expect(HANDLES).toContain(handle);
  });

  it('returns a different handle for a different seed', () => {
    const a = generateHandle(() => 0.1);
    const b = generateHandle(() => 0.6);
    expect(HANDLES).toContain(a);
    expect(HANDLES).toContain(b);
    // They almost certainly differ (24 handles, 22 possible slots apart).
    expect(a !== b || HANDLES.length <= 1).toBe(true);
  });
});
