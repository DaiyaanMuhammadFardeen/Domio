/**
 * Deterministic pure-TypeScript fixed-step integrator.
 *
 * This is the **fallback** path used ONLY when rapier3d WASM fails to
 * install or initialise.  It implements the same PhysicsWorld interface
 * contract so the rest of the package remains backend-agnostic.
 *
 * The integrator uses semi-implicit Euler with a fixed time-step and a
 * simple ground-plane collision response (clamp y ≥ 0 with velocity
 * reversal and friction damping).
 *
 * Guarantees:
 *  - Deterministic: same inputs → same outputs (no floating-point
 *    non-determinism from WASM threading or JIT).
 *  - Fixed-step: the caller controls when `step()` is called; no
 *    real-time timers or setTimeout.
 */

import type { ColliderDesc, PhysicsWorldConfig, RigidBodyHandle, RigidBodyType, Vec3 } from '../types.js';

/** Internal rigid body representation for the fallback integrator. */
interface FallbackBody {
  type: RigidBodyType;
  position: Vec3;
  velocity: Vec3;
  colliderDesc: ColliderDesc;
  /** Y position of the ground plane (default 0). */
  groundY: number;
}

/**
 * Pure-TS physics world — backend-agnostic stepping with the same
 * interface contract as the rapier-backed PhysicsWorld.
 */
export class Integrator {
  /** Monotonically increasing step counter. */
  stepCount = 0;

  /** Gravity vector applied each step. */
  private gravity: Vec3;

  /** Fixed time-step per step(), in seconds. */
  readonly fixedTimeStep: number;

  /** Ground-plane Y coordinate. */
  private groundY: number;

  /** Coefficient of restitution (bounciness) on ground collision. */
  private restitution: number;

  /** Coefficient of friction on ground collision. */
  private friction: number;

  /** Internal body storage. */
  private bodies: FallbackBody[] = [];

  constructor(config: PhysicsWorldConfig & { groundY?: number; restitution?: number; friction?: number } = {}) {
    this.gravity = config.gravity ?? { x: 0, y: -9.81, z: 0 };
    this.fixedTimeStep = config.fixedTimeStep ?? 1 / 60;
    this.groundY = config.groundY ?? 0;
    this.restitution = config.restitution ?? 0.5;
    this.friction = config.friction ?? 0.9;
  }

  /**
   * Advance the simulation by one fixed step.
   * Uses semi-implicit Euler: velocity updated first, then position.
   */
  step(): void {
    const dt = this.fixedTimeStep;

    for (const body of this.bodies) {
      if (body.type === 'fixed') continue;

      // Semi-implicit Euler: update velocity then position
      body.velocity.x += this.gravity.x * dt;
      body.velocity.y += this.gravity.y * dt;
      body.velocity.z += this.gravity.z * dt;

      body.position.x += body.velocity.x * dt;
      body.position.y += body.velocity.y * dt;
      body.position.z += body.velocity.z * dt;

      // Ground-plane collision (y ≥ groundY)
      if (body.position.y < this.groundY) {
        body.position.y = this.groundY;
        body.velocity.y = -body.velocity.y * this.restitution;
        // Friction: damp horizontal velocity
        body.velocity.x *= this.friction;
        body.velocity.z *= this.friction;
      }
    }

    this.stepCount++;
  }

  /**
   * Create a rigid body.  Returns an opaque handle for later queries.
   */
  createRigidBody(
    type: RigidBodyType,
    position: Vec3,
    colliderDesc: ColliderDesc,
  ): RigidBodyHandle {
    const handle = this.bodies.length as RigidBodyHandle;
    this.bodies.push({
      type,
      position: { ...position },
      velocity: { x: 0, y: 0, z: 0 },
      colliderDesc,
      groundY: this.groundY,
    });
    return handle;
  }

  /**
   * Read the current world-space position of a rigid body.
   */
  getBodyPosition(handle: RigidBodyHandle): Vec3 {
    const body = this.bodies[handle];
    if (!body) {
      throw new Error(`Integrator: invalid body handle ${handle}`);
    }
    return { ...body.position };
  }

  /**
   * Get the current velocity of a rigid body.
   */
  getBodyVelocity(handle: RigidBodyHandle): Vec3 {
    const body = this.bodies[handle];
    if (!body) {
      throw new Error(`Integrator: invalid body handle ${handle}`);
    }
    return { ...body.velocity };
  }

  /**
   * Set the gravity vector (applied on next step).
   */
  setGravity(gravity: Vec3): void {
    this.gravity = { ...gravity };
  }

  /**
   * Release all internal state.
   */
  destroy(): void {
    this.bodies = [];
    this.stepCount = 0;
  }
}
