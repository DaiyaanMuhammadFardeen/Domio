import { describe, it, expect } from 'vitest';
import { EnvMapRegistry } from './EnvMapRegistry.js';
import { createIBLConfig, applyRotation } from './IBLConfig.js';

// ---------------------------------------------------------------------------
// EnvMapRegistry tests
// ---------------------------------------------------------------------------

describe('EnvMapRegistry', () => {
  it('has default neutral envmap', () => {
    const registry = new EnvMapRegistry();
    const env = registry.get('default_neutral');
    expect(env.id).toBe('default_neutral');
  });

  it('returns default neutral for unknown id', () => {
    const registry = new EnvMapRegistry();
    const env = registry.get('nonexistent');
    expect(env.id).toBe('default_neutral');
  });

  it('registers and retrieves custom envmap', () => {
    const registry = new EnvMapRegistry();
    registry.register({ id: 'sunset', url: 'sunset.hdr', label: 'Sunset' });
    const env = registry.get('sunset');
    expect(env.url).toBe('sunset.hdr');
    expect(registry.has('sunset')).toBe(true);
  });

  it('removes custom envmap but not default neutral', () => {
    const registry = new EnvMapRegistry();
    registry.register({ id: 'custom', url: 'custom.hdr', label: 'Custom' });
    expect(registry.remove('custom')).toBe(true);
    expect(registry.has('custom')).toBe(false);
    expect(registry.remove('default_neutral')).toBe(false);
  });

  it('lists all registered envmaps', () => {
    const registry = new EnvMapRegistry();
    registry.register({ id: 'a', url: 'a.hdr', label: 'A' });
    registry.register({ id: 'b', url: 'b.hdr', label: 'B' });
    const list = registry.list();
    expect(list.length).toBe(3); // default_neutral + a + b
  });
});

// ---------------------------------------------------------------------------
// IBLConfig tests
// ---------------------------------------------------------------------------

describe('IBLConfig', () => {
  it('creates default config', () => {
    const config = createIBLConfig();
    expect(config.enabled).toBe(true);
    expect(config.intensity).toBe(1.0);
    expect(config.rotationDeg).toBe(0);
  });

  it('applies partial config', () => {
    const config = createIBLConfig({ intensity: 2.0, enabled: false });
    expect(config.intensity).toBe(2.0);
    expect(config.enabled).toBe(false);
  });

  it('clamps intensity >= 0', () => {
    const config = createIBLConfig({ intensity: -5 });
    expect(config.intensity).toBe(0);
  });

  it('wraps rotation to [0, 360)', () => {
    const config = createIBLConfig({ rotationDeg: 450 });
    expect(config.rotationDeg).toBeCloseTo(90, 6);
  });

  it('handles negative rotation', () => {
    const config = createIBLConfig({ rotationDeg: -90 });
    expect(config.rotationDeg).toBeCloseTo(270, 6);
  });

  it('applyRotation rotates direction around Y axis', () => {
    const dir = { x: 1, y: 0, z: 0 };
    const rotated = applyRotation(dir, 90);
    expect(rotated.x).toBeCloseTo(0, 6);
    expect(rotated.y).toBeCloseTo(0, 6);
    expect(rotated.z).toBeCloseTo(-1, 6);
  });

  it('applyRotation with 0 degrees returns same direction', () => {
    const dir = { x: 1, y: 2, z: 3 };
    const rotated = applyRotation(dir, 0);
    expect(rotated.x).toBeCloseTo(1, 6);
    expect(rotated.y).toBeCloseTo(2, 6);
    expect(rotated.z).toBeCloseTo(3, 6);
  });

  it('applyRotation with 360 degrees returns same direction', () => {
    const dir = { x: 1, y: 0, z: 0 };
    const rotated = applyRotation(dir, 360);
    expect(rotated.x).toBeCloseTo(1, 6);
    expect(rotated.z).toBeCloseTo(0, 6);
  });
});
