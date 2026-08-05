import { describe, it, expect } from 'vitest';
import { LightManager } from './LightManager.js';
import type { SceneLight } from '../contracts/renderer.v1.js';

function makeLight(n: number): SceneLight {
  return {
    kind: 'point',
    position: { x: n, y: 0, z: 0 },
    color: '#ffffff',
    intensity: 1,
  };
}

describe('LightManager', () => {
  it('starts with 0 lights', () => {
    const mgr = new LightManager();
    expect(mgr.count).toBe(0);
    expect(mgr.all).toHaveLength(0);
  });

  it('allows adding up to 8 lights without warning', () => {
    const mgr = new LightManager();
    for (let i = 0; i < 8; i++) {
      const result = mgr.add(makeLight(i));
      expect(result.ok).toBe(true);
      expect(result.warning).toBeUndefined();
    }
    expect(mgr.count).toBe(8);
  });

  it('returns warning when adding the 9th light', () => {
    const mgr = new LightManager();
    for (let i = 0; i < 8; i++) {
      mgr.add(makeLight(i));
    }
    const result = mgr.add(makeLight(8));
    expect(result.ok).toBe(true);
    expect(result.warning).toBe('Scene lights add GPU cost; consider baking');
    expect(mgr.count).toBe(9);
  });

  it('updates a light by index', () => {
    const mgr = new LightManager();
    mgr.add(makeLight(0));
    const updated: SceneLight = {
      kind: 'directional',
      direction: { x: 0, y: -1, z: 0 },
      color: '#ff0000',
      intensity: 0.5,
    };
    expect(mgr.update(0, updated)).toBe(true);
    expect(mgr.all[0]).toBe(updated);
  });

  it('returns false when updating out-of-range index', () => {
    const mgr = new LightManager();
    expect(mgr.update(5, makeLight(0))).toBe(false);
  });

  it('removes a light by index', () => {
    const mgr = new LightManager();
    mgr.add(makeLight(0));
    mgr.add(makeLight(1));
    expect(mgr.remove(0)).toBe(true);
    expect(mgr.count).toBe(1);
  });

  it('returns false when removing out-of-range index', () => {
    const mgr = new LightManager();
    expect(mgr.remove(0)).toBe(false);
  });

  it('clears all lights', () => {
    const mgr = new LightManager();
    mgr.add(makeLight(0));
    mgr.add(makeLight(1));
    mgr.clear();
    expect(mgr.count).toBe(0);
  });
});

describe('LightManager linearisation', () => {
  it('linearises hex colour via sRGB → linear', () => {
    const mgr = new LightManager();
    mgr.add({
      kind: 'ambient',
      color: '#ffffff',
      intensity: 1,
    });
    const lin = mgr.getLinearized();
    expect(lin).toHaveLength(1);
    const first = lin[0]!;
    // Pure white sRGB 255 → linear ≈ 1.0
    expect(first.colorLinear.r).toBeCloseTo(1.0, 5);
    expect(first.colorLinear.g).toBeCloseTo(1.0, 5);
    expect(first.colorLinear.b).toBeCloseTo(1.0, 5);
  });

  it('linearises 128 as approximately 0.214 (mid-grey sRGB)', () => {
    const mgr = new LightManager();
    mgr.add({
      kind: 'point',
      color: '#808080',
      intensity: 128,
    });
    const lin = mgr.getLinearized();
    const first = lin[0]!;
    // sRGB 128/255 ≈ 0.502 → linear ≈ 0.214
    const expected = Math.pow((0.502 + 0.055) / 1.055, 2.4);
    expect(first.colorLinear.r).toBeCloseTo(expected, 4);
    // intensity 128 > 1 → treat as u8 and linearise
    expect(first.intensityLinear).toBeCloseTo(expected, 4);
  });

  it('preserves light kind, position, direction, angleDeg', () => {
    const mgr = new LightManager();
    mgr.add({
      kind: 'spot',
      position: { x: 1, y: 2, z: 3 },
      direction: { x: 0, y: -1, z: 0 },
      color: '#ff0000',
      intensity: 1,
      angleDeg: 45,
    });
    const lin = mgr.getLinearized();
    const first = lin[0]!;
    expect(first.kind).toBe('spot');
    expect(first.position).toEqual({ x: 1, y: 2, z: 3 });
    expect(first.direction).toEqual({ x: 0, y: -1, z: 0 });
    expect(first.angleDeg).toBe(45);
  });
});
