/**
 * PhysicsWorld — rigid-body simulation backed by rapier3d WASM.
 *
 * Provides deterministic fixed-step integration via manual stepping
 * (no real-time timers).  The `stepCount` accumulator tracks the
 * total number of discrete steps taken.
 *
 * rapier3d-compat requires async WASM initialization; use the static
 * `PhysicsWorld.create()` factory to construct an instance.
 */

import RAPIER from '@dimforge/rapier3d-compat';
import type { PhysicsWorldConfig, RigidBodyHandle, RigidBodyType, Vec3 } from './types.js';

/** Whether RAPIER.init() has already been called. */
let rapierReady = false;

export class PhysicsWorld {
  /** The rapier World instance. */
  private world: RAPIER.World;

  /** Monotonically increasing step counter. */
  stepCount = 0;

  /** Fixed time-step per step() call, in seconds. */
  readonly fixedTimeStep: number;

  /** Simple handle → RigidBody map (handle = array index). */
  private bodies: RAPIER.RigidBody[] = [];

  private constructor(config: PhysicsWorldConfig = {}) {
    const gravity = config.gravity ?? { x: 0, y: -9.81, z: 0 };
    this.fixedTimeStep = config.fixedTimeStep ?? 1 / 60;
    this.world = new RAPIER.World(gravity);
  }

  /**
   * Async factory — initialises WASM, then constructs the world.
   *
   * ```ts
   * const world = await PhysicsWorld.create({ gravity: { x: 0, y: -9.81, z: 0 } });
   * ```
   */
  static async create(config: PhysicsWorldConfig = {}): Promise<PhysicsWorld> {
    if (!rapierReady) {
      await RAPIER.init();
      rapierReady = true;
    }
    return new PhysicsWorld(config);
  }

  /**
   * Advance the simulation by one fixed step.
   * Accumulates `stepCount`.
   */
  step(): void {
    this.world.step();
    this.stepCount++;
  }

  /**
   * Create a rigid body with the given type, position, and collider.
   * Returns an opaque handle for later queries.
   */
  createRigidBody(
    type: RigidBodyType,
    position: Vec3,
    colliderDesc: RAPIER.ColliderDesc,
  ): RigidBodyHandle {
    const rbDesc =
      type === 'dynamic'
        ? RAPIER.RigidBodyDesc.dynamic()
        : RAPIER.RigidBodyDesc.fixed();

    rbDesc.setTranslation(position.x, position.y, position.z);

    const rigidBody = this.world.createRigidBody(rbDesc);
    this.world.createCollider(colliderDesc, rigidBody);

    const handle = this.bodies.length as RigidBodyHandle;
    this.bodies.push(rigidBody);
    return handle;
  }

  /**
   * Read the current world-space translation of a rigid body.
   */
  getBodyPosition(handle: RigidBodyHandle): Vec3 {
    const rb = this.bodies[handle];
    if (!rb) {
      throw new Error(`PhysicsWorld: invalid body handle ${handle}`);
    }
    const t = rb.translation();
    return { x: t.x, y: t.y, z: t.z };
  }

  /**
   * Set the gravity vector (applied on next step).
   */
  setGravity(gravity: Vec3): void {
    this.world.gravity = new RAPIER.Vector3(gravity.x, gravity.y, gravity.z);
  }

  /**
   * Release all rapier resources.
   */
  destroy(): void {
    this.world.free();
    this.bodies = [];
  }
}
