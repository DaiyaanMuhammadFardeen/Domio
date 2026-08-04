import { describe, it, expect } from 'vitest';
import { stepEase } from './step.js';

describe('stepEase (standalone)', () => {
  it('returns 0 at t=0', () => {
    expect(stepEase(0, 5)).toBe(0);
  });

  it('returns 1 at t=1', () => {
    expect(stepEase(1, 5)).toBe(1);
  });

  it('produces 5 discrete steps', () => {
    const results = Array.from({ length: 6 }, (_, i) => stepEase(i / 5, 5));
    expect(results).toEqual([0, 0.25, 0.5, 0.75, 1, 1]);
  });
});
