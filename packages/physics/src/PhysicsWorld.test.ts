/**
 * PhysicsWorld tests — rapier WASM backed.
 *
 * These tests verify:
 *  - Fixed-step stepping advances the stepCount deterministically
 *  - Gravity pulls a dynamic body downward
 *  - Fixed (static) bodies don't move
 *
 * All tests use manual stepping (no real-time timers).
 */

import { describe, expect, it } from 'vitest';
import { PhysicsWorld } from './PhysicsWorld.js';
import { sphere } from './Colliders.js';

describe('PhysicsWorld', () => {
  it('stepCount starts at 0 and increments by 1 per step', async () => {
    const world = await PhysicsWorld.create({
      gravity: { x: 0, y: -9.81, z: 0 },
      fixedTimeStep: 1 / 60,
    });

    expect(world.stepCount).toBe(0);

    world.step();
    expect(world.stepCount).toBe(1);

    world.step();
    expect(world.stepCount).toBe(2);

    world.step();
    expect(world.stepCount).toBe(3);

    world.destroy();
  });

  it('fixed-step stepping is deterministic — same count after repeated steps', async () => {
    const w = await PhysicsWorld.create({ fixedTimeStep: 1 / 60 });
    const steps = 120;

    for (let i = 0; i < steps; i++) {
      w.step();
    }
    expect(w.stepCount).toBe(steps);
    w.destroy();
  });

  it('gravity pulls a dynamic body downward', async () => {
    const w = await PhysicsWorld.create({
      gravity: { x: 0, y: -9.81, z: 0 },
      fixedTimeStep: 1 / 60,
    });

    const desc = sphere(0.5);
    const handle = w.createRigidBody('dynamic', { x: 0, y: 10, z: 0 }, desc);

    const posBefore = w.getBodyPosition(handle);
    expect(posBefore.y).toBe(10);

    // Step enough for gravity to move the body significantly
    for (let i = 0; i < 60; i++) {
      w.step();
    }

    const posAfter = w.getBodyPosition(handle);
    expect(posAfter.y).toBeLessThan(posBefore.y);
    expect(posAfter.y).toBeLessThan(10);

    w.destroy();
  });

  it('fixed bodies do not move under gravity', async () => {
    const w = await PhysicsWorld.create({
      gravity: { x: 0, y: -9.81, z: 0 },
      fixedTimeStep: 1 / 60,
    });

    const desc = sphere(0.5);
    const handle = w.createRigidBody('fixed', { x: 5, y: 5, z: 5 }, desc);

    const posBefore = w.getBodyPosition(handle);

    for (let i = 0; i < 60; i++) {
      w.step();
    }

    const posAfter = w.getBodyPosition(handle);
    expect(posAfter.x).toBe(posBefore.x);
    expect(posAfter.y).toBe(posBefore.y);
    expect(posAfter.z).toBe(posBefore.z);

    w.destroy();
  });

  it('multiple dynamic bodies all fall under gravity', async () => {
    const w = await PhysicsWorld.create({ fixedTimeStep: 1 / 60 });
    const desc = sphere(0.25);

    const h1 = w.createRigidBody('dynamic', { x: 0, y: 20, z: 0 }, desc);
    const h2 = w.createRigidBody('dynamic', { x: 1, y: 30, z: 0 }, desc);

    for (let i = 0; i < 30; i++) w.step();

    const p1 = w.getBodyPosition(h1);
    const p2 = w.getBodyPosition(h2);

    expect(p1.y).toBeLessThan(20);
    expect(p2.y).toBeLessThan(30);

    w.destroy();
  });

  it('throws on invalid body handle', async () => {
    const w = await PhysicsWorld.create();
    expect(() => w.getBodyPosition(999)).toThrow('invalid body handle');
    w.destroy();
  });
});
