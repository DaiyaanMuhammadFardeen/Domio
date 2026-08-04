import { describe, it, expect } from 'vitest';
import { physicsEase } from './physics.js';

describe('physicsEase', () => {
  it('gravity: returns 0 at t=0, 1 at t=1', () => {
    const ease = physicsEase({ type: 'gravity' });
    expect(ease(0)).toBe(0);
    expect(ease(1)).toBe(1);
  });

  it('throw: returns 0 at t=0, 1 at t=1', () => {
    const ease = physicsEase({ type: 'throw' });
    expect(ease(0)).toBe(0);
    expect(ease(1)).toBe(1);
  });

  it('bounce: returns 0 at t=0, 1 at t=1', () => {
    const ease = physicsEase({ type: 'bounce' });
    expect(ease(0)).toBe(0);
    expect(ease(1)).toBe(1);
  });

  it('deterministic: same config yields same results', () => {
    const cfg = { type: 'throw' as const, gravity: 500, initialVelocity: -400 };
    const e1 = physicsEase(cfg);
    const e2 = physicsEase(cfg);
    for (let i = 0; i <= 100; i++) {
      expect(e1(i / 100)).toBe(e2(i / 100));
    }
  });
});
