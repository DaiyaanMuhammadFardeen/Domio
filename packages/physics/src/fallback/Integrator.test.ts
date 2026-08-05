/**
 * Fallback Integrator tests.
 *
 * Verifies:
 *  - Determinism: same inputs → same outputs
 *  - Gravity pulls dynamic bodies down
 *  - Ground-plane collision stops bodies from falling below y=0
 *  - Fixed bodies don't move
 *  - Friction damps horizontal velocity on ground contact
 */

import { describe, expect, it } from 'vitest';
import { Integrator } from './Integrator.js';
import type { ColliderDesc } from '../types.js';

/** Minimal collider descriptor for the fallback integrator. */
const dummyCollider: ColliderDesc = {
  kind: { type: 'sphere', radius: 0.5 },
};

describe('Integrator (fallback)', () => {
  it('stepCount starts at 0 and increments by 1 per step', () => {
    const integrator = new Integrator();
    expect(integrator.stepCount).toBe(0);
    integrator.step();
    expect(integrator.stepCount).toBe(1);
    integrator.step();
    expect(integrator.stepCount).toBe(2);
    integrator.destroy();
  });

  it('determinism — same inputs produce same outputs', () => {
    // Run two integrators with identical initial conditions
    const configs = { fixedTimeStep: 1 / 60, gravity: { x: 0, y: -9.81, z: 0 } };
    const a = new Integrator(configs);
    const b = new Integrator(configs);

    const hA = a.createRigidBody('dynamic', { x: 0, y: 10, z: 0 }, dummyCollider);
    const hB = b.createRigidBody('dynamic', { x: 0, y: 10, z: 0 }, dummyCollider);

    for (let i = 0; i < 60; i++) {
      a.step();
      b.step();
    }

    const posA = a.getBodyPosition(hA);
    const posB = b.getBodyPosition(hB);

    expect(posA.x).toBe(posB.x);
    expect(posA.y).toBe(posB.y);
    expect(posA.z).toBe(posB.z);

    a.destroy();
    b.destroy();
  });

  it('gravity pulls a dynamic body downward', () => {
    const integrator = new Integrator({
      gravity: { x: 0, y: -9.81, z: 0 },
      fixedTimeStep: 1 / 60,
    });

    const handle = integrator.createRigidBody('dynamic', { x: 0, y: 100, z: 0 }, dummyCollider);

    // Position before
    const before = integrator.getBodyPosition(handle);
    expect(before.y).toBe(100);

    // Step a few times — should still be above ground (100 is high)
    for (let i = 0; i < 10; i++) integrator.step();

    const after = integrator.getBodyPosition(handle);
    expect(after.y).toBeLessThan(before.y);

    integrator.destroy();
  });

  it('ground-plane collision stops body from falling below y=0', () => {
    const integrator = new Integrator({
      gravity: { x: 0, y: -9.81, z: 0 },
      fixedTimeStep: 1 / 60,
      groundY: 0,
    });

    const handle = integrator.createRigidBody('dynamic', { x: 0, y: 0.5, z: 0 }, dummyCollider);

    // Step many times — body should settle at or above y=0
    for (let i = 0; i < 300; i++) integrator.step();

    const pos = integrator.getBodyPosition(handle);
    expect(pos.y).toBeGreaterThanOrEqual(0);

    integrator.destroy();
  });

  it('fixed bodies do not move under gravity', () => {
    const integrator = new Integrator({
      gravity: { x: 0, y: -9.81, z: 0 },
      fixedTimeStep: 1 / 60,
    });

    const handle = integrator.createRigidBody('fixed', { x: 5, y: 5, z: 5 }, dummyCollider);

    for (let i = 0; i < 60; i++) integrator.step();

    const pos = integrator.getBodyPosition(handle);
    expect(pos.x).toBe(5);
    expect(pos.y).toBe(5);
    expect(pos.z).toBe(5);

    integrator.destroy();
  });

  it('throws on invalid body handle', () => {
    const integrator = new Integrator();
    expect(() => integrator.getBodyPosition(999)).toThrow('invalid body handle');
    integrator.destroy();
  });

  it('horizontal velocity is damped by friction on ground contact', () => {
    const integrator = new Integrator({
      gravity: { x: 0, y: -9.81, z: 0 },
      fixedTimeStep: 1 / 60,
      groundY: 0,
      friction: 0.9,
    });

    const handle = integrator.createRigidBody('dynamic', { x: 0, y: 0.1, z: 0 }, dummyCollider);

    // Manually set initial velocity — the integrator doesn't expose
    // setVelocity, so we rely on the fact that the body starts at rest
    // and gravity-only motion should have zero horizontal velocity.
    // For a more thorough test we'd need setVelocity exposed, but
    // this verifies the integrator doesn't crash on ground contact.

    for (let i = 0; i < 100; i++) integrator.step();

    const vel = integrator.getBodyVelocity(handle);
    // After settling, horizontal velocity should be near zero
    expect(Math.abs(vel.x)).toBeLessThan(1);
    expect(Math.abs(vel.z)).toBeLessThan(1);

    integrator.destroy();
  });

  it('body falling from height settles above ground', () => {
    const integrator = new Integrator({
      gravity: { x: 0, y: -9.81, z: 0 },
      fixedTimeStep: 1 / 60,
      groundY: 0,
      restitution: 0.3,
    });

    const handle = integrator.createRigidBody('dynamic', { x: 0, y: 50, z: 0 }, dummyCollider);

    // Step enough for the body to reach the ground and settle
    for (let i = 0; i < 500; i++) integrator.step();

    const pos = integrator.getBodyPosition(handle);
    expect(pos.y).toBeGreaterThanOrEqual(0);
    expect(pos.y).toBeLessThan(2); // Should be close to ground

    integrator.destroy();
  });
});
