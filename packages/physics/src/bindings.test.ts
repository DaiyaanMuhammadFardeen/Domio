/**
 * BindRegistry tests — binding freeze behavior.
 *
 * Verifies:
 *  - First bind succeeds (ok: true)
 *  - Second bind on the same mesh is rejected (ok: false with clear error)
 *  - Different meshes can be bound independently
 *  - unbind allows re-binding
 *  - isBound and get work correctly
 */

import { describe, expect, it } from 'vitest';
import { BindRegistry } from './bindings.js';

describe('BindRegistry (binding freeze)', () => {
  it('first bind succeeds with ok: true', () => {
    const registry = new BindRegistry();
    const result = registry.bind('mesh-1', 0);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.handle).toBe(0);
    }
  });

  it('second bind on same mesh is rejected with ok: false', () => {
    const registry = new BindRegistry();
    registry.bind('mesh-1', 0);
    const result = registry.bind('mesh-1', 1);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain('Binding freeze');
      expect(result.message).toContain('mesh-1');
      expect(result.existingMeshId).toBe('mesh-1');
      expect(result.newMeshId).toBe('mesh-1');
    }
  });

  it('different meshes can be bound independently', () => {
    const registry = new BindRegistry();
    const r1 = registry.bind('mesh-a', 0);
    const r2 = registry.bind('mesh-b', 1);
    const r3 = registry.bind('mesh-c', 2);

    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    expect(r3.ok).toBe(true);
    expect(registry.size).toBe(3);
  });

  it('isBound returns true for bound mesh, false for unbound', () => {
    const registry = new BindRegistry();
    expect(registry.isBound('mesh-x')).toBe(false);

    registry.bind('mesh-x', 0);
    expect(registry.isBound('mesh-x')).toBe(true);
    expect(registry.isBound('mesh-y')).toBe(false);
  });

  it('get returns the bound body for a bound mesh', () => {
    const registry = new BindRegistry();
    registry.bind('mesh-1', 42);

    const body = registry.get('mesh-1');
    expect(body).toBeDefined();
    expect(body!.handle).toBe(42);
    expect(body!.meshId).toBe('mesh-1');
  });

  it('get returns undefined for unbound mesh', () => {
    const registry = new BindRegistry();
    expect(registry.get('nonexistent')).toBeUndefined();
  });

  it('unbind removes the binding and allows re-bind', () => {
    const registry = new BindRegistry();
    registry.bind('mesh-1', 0);

    const removed = registry.unbind('mesh-1');
    expect(removed).toBe(true);
    expect(registry.isBound('mesh-1')).toBe(false);

    // Re-bind should now succeed
    const result = registry.bind('mesh-1', 5);
    expect(result.ok).toBe(true);
  });

  it('unbind returns false for nonexistent mesh', () => {
    const registry = new BindRegistry();
    expect(registry.unbind('nonexistent')).toBe(false);
  });

  it('size tracks the number of active bindings', () => {
    const registry = new BindRegistry();
    expect(registry.size).toBe(0);

    registry.bind('a', 0);
    expect(registry.size).toBe(1);

    registry.bind('b', 1);
    expect(registry.size).toBe(2);

    registry.unbind('a');
    expect(registry.size).toBe(1);

    registry.unbind('b');
    expect(registry.size).toBe(0);
  });
});
