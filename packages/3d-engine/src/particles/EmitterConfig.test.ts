import { describe, it, expect } from 'vitest';
import { createEmitterConfig, getParticleBudget } from './EmitterConfig.js';

describe('EmitterConfig', () => {
  it('creates a config for each preset', () => {
    const presets = ['snow', 'confetti', 'dust', 'sparks', 'aurora'] as const;
    for (const preset of presets) {
      const config = createEmitterConfig({ preset, backend: 'webgl2' });
      expect(config.preset).toBe(preset);
      expect(config.backend).toBe('webgl2');
      expect(config.particleCount).toBe(250_000);
      expect(config.params).toBeDefined();
    }
  });

  it('webgpu gets 1M particle budget', () => {
    const config = createEmitterConfig({ preset: 'snow', backend: 'webgpu' });
    expect(config.particleCount).toBe(1_000_000);
  });

  it('webgl2 gets 250k particle budget', () => {
    const config = createEmitterConfig({ preset: 'snow', backend: 'webgl2' });
    expect(config.particleCount).toBe(250_000);
  });

  it('default seed is 42', () => {
    const c1 = createEmitterConfig({ preset: 'snow', backend: 'webgl2' });
    const c2 = createEmitterConfig({ preset: 'snow', backend: 'webgl2' });
    // Same seed → same RNG sequence
    expect(c1.rng()).toBe(c2.rng());
  });

  it('seeded RNG produces deterministic values', () => {
    const config = createEmitterConfig({ preset: 'snow', backend: 'webgl2', seed: 123 });
    const values = Array.from({ length: 5 }, () => config.rng());
    // All values should be in [0, 1)
    for (const v of values) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
    // Re-run with same seed
    const config2 = createEmitterConfig({ preset: 'snow', backend: 'webgl2', seed: 123 });
    const values2 = Array.from({ length: 5 }, () => config2.rng());
    expect(values).toEqual(values2);
  });

  it('different seeds produce different sequences', () => {
    const c1 = createEmitterConfig({ preset: 'snow', backend: 'webgl2', seed: 1 });
    const c2 = createEmitterConfig({ preset: 'snow', backend: 'webgl2', seed: 2 });
    expect(c1.rng()).not.toBe(c2.rng());
  });
});

describe('EmitterConfig brand token binding', () => {
  it('resolves brand tokens via tokenResolver', () => {
    const resolver = (token: string): string => {
      if (token === 'color.brand.primary') return '#FF0000';
      if (token === 'color.brand.secondary') return '#00FF00';
      if (token === 'color.brand.accent') return '#0000FF';
      return '#000000';
    };
    const config = createEmitterConfig({
      preset: 'snow',
      backend: 'webgl2',
      tokenResolver: resolver,
    });
    expect(config.brandColors.primary).toBe('#FF0000');
    expect(config.brandColors.secondary).toBe('#00FF00');
    expect(config.brandColors.accent).toBe('#0000FF');
  });

  it('uses default colours when no resolver provided', () => {
    const config = createEmitterConfig({ preset: 'snow', backend: 'webgl2' });
    expect(config.brandColors.primary).toBe('#4A90D9');
    expect(config.brandColors.secondary).toBe('#7B61FF');
    expect(config.brandColors.accent).toBe('#FF6B6B');
  });
});

describe('EmitterConfig webgpu uplift', () => {
  it('webgpu has 4x the particle count of webgl2', () => {
    const gl2 = createEmitterConfig({ preset: 'snow', backend: 'webgl2' });
    const gpu = createEmitterConfig({ preset: 'snow', backend: 'webgpu' });
    expect(gpu.particleCount / gl2.particleCount).toBe(4);
  });
});

describe('getParticleBudget', () => {
  it('returns 250k for webgl2', () => {
    expect(getParticleBudget('webgl2')).toBe(250_000);
  });

  it('returns 1M for webgpu', () => {
    expect(getParticleBudget('webgpu')).toBe(1_000_000);
  });
});
