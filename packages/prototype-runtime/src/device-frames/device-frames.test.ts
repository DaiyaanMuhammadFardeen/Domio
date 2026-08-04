/**
 * Device-frame tests — Phase 10 M4.
 * Registry CRUD + default-frame lookup + custom frame registration.
 */

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DEVICE_FRAMES,
  DeviceFrameRegistry,
  findDefaultFrame,
} from './index.js';

describe('DeviceFrameRegistry', () => {
  it('exposes a sensible default set', () => {
    expect(DEFAULT_DEVICE_FRAMES.length).toBeGreaterThanOrEqual(4);
    expect(DEFAULT_DEVICE_FRAMES.map((f) => f.id)).toContain('iphone-15');
    expect(DEFAULT_DEVICE_FRAMES.map((f) => f.id)).toContain('ipad-11');
  });

  it('registers and resolves specs', () => {
    const reg = new DeviceFrameRegistry();
    reg.register({ id: 'custom', label: 'Custom 800×600', width: 800, height: 600, dpr: 1 });
    const found = reg.resolve('custom');
    expect(found?.spec.width).toBe(800);
    expect(found?.spec.height).toBe(600);
    expect(reg.list()).toHaveLength(1);
  });

  it('returns null for unknown ids', () => {
    const reg = new DeviceFrameRegistry();
    expect(reg.resolve('nope')).toBeNull();
  });

  it('unregister removes', () => {
    const reg = new DeviceFrameRegistry();
    reg.register({ id: 'r', label: 'R', width: 100, height: 100, dpr: 1 });
    reg.unregister('r');
    expect(reg.resolve('r')).toBeNull();
  });

  it('preserves registration order', () => {
    const reg = new DeviceFrameRegistry();
    reg.register({ id: 'a', label: 'A', width: 100, height: 100, dpr: 1 });
    reg.register({ id: 'b', label: 'B', width: 200, height: 200, dpr: 1 });
    expect(reg.list().map((r) => r.id)).toEqual(['a', 'b']);
  });
});

describe('findDefaultFrame', () => {
  it('returns the named frame when present', () => {
    const reg = new DeviceFrameRegistry();
    reg.register({ id: 'foo', label: 'Foo', width: 100, height: 100, dpr: 1 });
    expect(findDefaultFrame(reg, 'foo').spec.id).toBe('foo');
  });

  it('falls back to first registered when id missing', () => {
    const reg = new DeviceFrameRegistry();
    reg.register({ id: 'first', label: 'First', width: 100, height: 100, dpr: 1 });
    reg.register({ id: 'second', label: 'Second', width: 200, height: 200, dpr: 1 });
    expect(findDefaultFrame(reg, 'nonexistent').spec.id).toBe('first');
  });

  it('throws when no frames registered', () => {
    const reg = new DeviceFrameRegistry();
    expect(() => findDefaultFrame(reg)).toThrow(/no frames registered/);
  });
});