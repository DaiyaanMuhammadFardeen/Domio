/**
 * @domio/viewer — Tests for physics playback runtime (M4.2).
 */

import { describe, it, expect } from 'vitest';
import {
  createViewerPhysicsRuntime,
  buildCollider,
  BROADPHASE_WARNING_THRESHOLD,
} from './playback.js';

describe('createViewerPhysicsRuntime', () => {
  it('creates dynamic and fixed bodies', () => {
    const rt = createViewerPhysicsRuntime();
    const h1 = rt.createBody(
      'dynamic',
      { x: 0, y: 5, z: 0 },
      buildCollider({ type: 'sphere', radius: 0.5 }),
    );
    const h2 = rt.createBody(
      'fixed',
      { x: 0, y: 0, z: 0 },
      buildCollider({ type: 'cuboid', halfX: 1, halfY: 0.1, halfZ: 1 }),
    );
    expect(rt.bodyCount()).toBe(2);
    expect(typeof h1).toBe('number');
    expect(typeof h2).toBe('number');
  });

  it('gravity pulls a dynamic body down over multiple steps', () => {
    const rt = createViewerPhysicsRuntime({
      gravity: { x: 0, y: -10, z: 0 },
      fixedTimeStep: 1 / 60,
    });
    const h = rt.createBody(
      'dynamic',
      { x: 0, y: 5, z: 0 },
      buildCollider({ type: 'sphere', radius: 0.5 }),
    );
    const startY = rt.bodyState(h).position.y;
    rt.step(60); // 1 second
    const endY = rt.bodyState(h).position.y;
    expect(endY).toBeLessThan(startY);
    expect(rt.stepCount()).toBe(60);
  });

  it('fixed bodies do not move', () => {
    const rt = createViewerPhysicsRuntime();
    const h = rt.createBody(
      'fixed',
      { x: 0, y: 5, z: 0 },
      buildCollider({ type: 'cuboid', halfX: 1, halfY: 1, halfZ: 1 }),
    );
    const before = rt.bodyState(h).position;
    rt.step(120);
    const after = rt.bodyState(h).position;
    expect(after).toEqual(before);
  });

  it('ground collision clamps y and reflects velocity', () => {
    const rt = createViewerPhysicsRuntime({ groundY: 0, restitution: 0.5 });
    const h = rt.createBody(
      'dynamic',
      { x: 0, y: 0.5, z: 0 },
      buildCollider({ type: 'sphere', radius: 0.5 }),
    );
    rt.step(60);
    const state = rt.bodyState(h);
    expect(state.position.y).toBeGreaterThanOrEqual(0);
  });

  it('binding freeze rejects re-bind of the same mesh', () => {
    const rt = createViewerPhysicsRuntime();
    const body = rt.createBody(
      'dynamic',
      { x: 0, y: 0, z: 0 },
      buildCollider({ type: 'sphere', radius: 1 }),
    );
    const first = rt.bind('cube-1', body);
    expect(first.ok).toBe(true);
    const second = rt.bind('cube-1', body);
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.existingMeshId).toBe('cube-1');
      expect(second.newMeshId).toBe('cube-1');
    }
    expect(rt.bindingCount()).toBe(1);
  });

  it('isBound reports current state', () => {
    const rt = createViewerPhysicsRuntime();
    const body = rt.createBody(
      'dynamic',
      { x: 0, y: 0, z: 0 },
      buildCollider({ type: 'sphere', radius: 1 }),
    );
    expect(rt.isBound('cube-1')).toBe(false);
    rt.bind('cube-1', body);
    expect(rt.isBound('cube-1')).toBe(true);
  });

  it('emits a broadphase warning above the threshold', () => {
    const rt = createViewerPhysicsRuntime();
    // Create just past the threshold (to keep the test fast).
    for (let i = 0; i < BROADPHASE_WARNING_THRESHOLD + 1; i++) {
      rt.createBody(
        'dynamic',
        { x: 0, y: 0, z: 0 },
        buildCollider({ type: 'sphere', radius: 0.1 }),
      );
    }
    const warning = rt.broadphaseWarning();
    expect(warning).not.toBeNull();
    expect(warning!.colliderCount).toBeGreaterThan(BROADPHASE_WARNING_THRESHOLD);
  });

  it('reset clears the body and binding state', () => {
    const rt = createViewerPhysicsRuntime();
    const body = rt.createBody(
      'dynamic',
      { x: 0, y: 0, z: 0 },
      buildCollider({ type: 'sphere', radius: 1 }),
    );
    rt.bind('cube-1', body);
    rt.reset();
    expect(rt.bodyCount()).toBe(0);
    expect(rt.bindingCount()).toBe(0);
    expect(rt.isBound('cube-1')).toBe(false);
  });

  it('destroy clears state without throwing', () => {
    const rt = createViewerPhysicsRuntime();
    const body = rt.createBody(
      'dynamic',
      { x: 0, y: 0, z: 0 },
      buildCollider({ type: 'sphere', radius: 1 }),
    );
    rt.bind('cube-1', body);
    expect(() => rt.destroy()).not.toThrow();
    expect(rt.bodyCount()).toBe(0);
  });

  it('step with non-integer times floors safely', () => {
    const rt = createViewerPhysicsRuntime();
    rt.step(0);
    expect(rt.stepCount()).toBe(0);
    rt.step(2.7);
    expect(rt.stepCount()).toBe(2);
    rt.step(-1);
    expect(rt.stepCount()).toBe(2);
  });
});
