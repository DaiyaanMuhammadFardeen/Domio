import { describe, it, expect } from 'vitest';
import { validateBezier } from './bezier-validate.js';

describe('validateBezier', () => {
  it('rejects x1 > x2 (non-monotonic)', () => {
    const result = validateBezier(0.5, 0, 0.2, 1);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/Non-monotonic/);
    }
  });

  it('rejects degenerate x1 === x2 === 0', () => {
    const result = validateBezier(0, 0, 0, 0);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/Degenerate/);
    }
  });

  it('rejects degenerate x1 === x2 === 1', () => {
    const result = validateBezier(1, 0, 1, 0);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/Degenerate/);
    }
  });

  it('rejects x1 out of range', () => {
    expect(validateBezier(-0.1, 0, 0.5, 1).ok).toBe(false);
    expect(validateBezier(1.1, 0, 0.5, 1).ok).toBe(false);
  });

  it('rejects x2 out of range', () => {
    expect(validateBezier(0, 0, -0.1, 1).ok).toBe(false);
    expect(validateBezier(0, 0, 1.1, 1).ok).toBe(false);
  });

  it('accepts valid standard ease curve', () => {
    expect(validateBezier(0.25, 0.1, 0.25, 1.0).ok).toBe(true);
  });

  it('accepts valid ease-in-out', () => {
    expect(validateBezier(0.42, 0, 0.58, 1).ok).toBe(true);
  });

  it('accepts y overshoot (x still monotonic)', () => {
    expect(validateBezier(0.27, -0.55, 0.68, 1.55).ok).toBe(true);
  });
});
