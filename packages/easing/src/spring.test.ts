import { describe, it, expect } from 'vitest';
import { springEase, springPreset } from './spring.js';

describe('springEase', () => {
  it('returns 0 at t=0', () => {
    const ease = springEase({ mass: 1, stiffness: 200, damping: 15 });
    expect(ease(0)).toBe(0);
  });

  it('returns 1 at t=1', () => {
    const ease = springEase({ mass: 1, stiffness: 200, damping: 15 });
    expect(ease(1)).toBe(1);
  });

  it('output is clamped to [-0.25, 1.25]', () => {
    const ease = springEase({ mass: 1, stiffness: 300, damping: 8 });
    for (let i = 0; i <= 200; i++) {
      const t = i / 200;
      const v = ease(t);
      expect(v).toBeGreaterThanOrEqual(-0.25);
      expect(v).toBeLessThanOrEqual(1.25);
    }
  });

  it('clamps out-of-range parameters', () => {
    // Should not throw — parameters get clamped
    const ease = springEase({ mass: 0, stiffness: 0, damping: 0 });
    expect(typeof ease(0.5)).toBe('number');
  });

  it('deterministic: same input → identical output across invocations', () => {
    // Seed a simple PRNG for reproducibility
    let seed = 42;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) & 0x7fffffff;
      return seed / 0x7fffffff;
    };

    const configs = Array.from({ length: 10_000 }, () => ({
      mass: 0.1 + rand() * 9.9,
      stiffness: 10 + rand() * 990,
      damping: 1 + rand() * 199,
    }));

    for (const cfg of configs) {
      const ease1 = springEase(cfg);
      const ease2 = springEase(cfg);

      // Evaluate at 100 sample points and compare
      for (let i = 0; i <= 100; i++) {
        const t = i / 100;
        const v1 = ease1(t);
        const v2 = ease2(t);
        // Byte-identical: same float representation
        expect(Object.is(v1, v2)).toBe(true);
      }
    }
  });
});

describe('springPreset', () => {
  it('returns known presets', () => {
    const w = springPreset('wobbly');
    expect(w.mass).toBe(1);
    expect(w.stiffness).toBe(180);
    expect(w.damping).toBe(12);

    const s = springPreset('snappy');
    expect(s.mass).toBe(0.8);

    const g = springPreset('gentle');
    expect(g.mass).toBe(1);
    expect(g.stiffness).toBe(120);
  });

  it('throws on unknown preset', () => {
    expect(() => springPreset('unknown')).toThrow('Unknown spring preset');
  });

  it('returns a copy (not the original)', () => {
    const w1 = springPreset('wobbly');
    const w2 = springPreset('wobbly');
    expect(w1).not.toBe(w2);
    expect(w1).toEqual(w2);
  });
});
