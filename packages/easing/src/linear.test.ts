import { describe, it, expect } from 'vitest';
import { linearEase, stepEase } from './linear.js';

describe('linearEase', () => {
  it('returns t unchanged', () => {
    expect(linearEase(0)).toBe(0);
    expect(linearEase(0.5)).toBe(0.5);
    expect(linearEase(1)).toBe(1);
  });
});

describe('stepEase', () => {
  it('clamps to [0, 1]', () => {
    expect(stepEase(-1, 4)).toBe(0);
    expect(stepEase(2, 4)).toBe(1);
  });

  it('produces correct step values for 4 steps', () => {
    expect(stepEase(0, 4)).toBe(0);
    expect(stepEase(0.1, 4)).toBe(0);
    expect(stepEase(0.26, 4)).toBeCloseTo(1 / 3);
    expect(stepEase(0.51, 4)).toBeCloseTo(2 / 3);
    expect(stepEase(0.76, 4)).toBe(1);
  });

  it('handles 1 step (always 0)', () => {
    expect(stepEase(0.5, 1)).toBe(0);
  });

  it('handles steps < 1 by clamping to 1', () => {
    expect(stepEase(0.5, 0)).toBe(0);
  });
});
