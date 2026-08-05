/**
 * @domio/viewer — Physics runtime integration (Phase 11 M4.2).
 *
 * Wraps `@domio/physics` for the viewer's slide-playback path. The
 * viewer always uses the pure-TypeScript `Integrator` fallback — the
 * WASM-backed `PhysicsWorld` requires a real DOM and shouldn't block
 * slide render in the viewer. The viewer runtime exposes:
 *
 *   - Manual stepping with an accumulator (no rAF timer — caller
 *     drives the loop from requestAnimationFrame)
 *   - Binding-freeze enforcement via `BindRegistry`
 *   - Broadphase warnings for slide scenes with > 10k colliders
 *
 * Determinism: the Integrator is pure-TS, so feeding the same number
 * of steps with the same initial state always yields the same output.
 */

import {
  Integrator,
  BindRegistry,
  checkBroadphase,
  BROADPHASE_WARNING_THRESHOLD,
  type Vec3,
  type RigidBodyHandle,
  type ColliderDesc,
  type ColliderShapeKind,
  type BindResult,
  type BroadphaseWarning,
} from '@domio/physics';

// ─── Public types ────────────────────────────────────────────────────

export interface ViewerPhysicsRuntimeConfig {
  /** Gravity vector (default { x: 0, y: -9.81, z: 0 }). */
  readonly gravity?: Vec3;
  /** Fixed time-step in seconds (default 1/60). */
  readonly fixedTimeStep?: number;
  /** Ground-plane Y (default 0). */
  readonly groundY?: number;
  /** Coefficient of restitution (default 0.5). */
  readonly restitution?: number;
  /** Coefficient of friction (default 0.9). */
  readonly friction?: number;
}

export interface ViewerBodyState {
  readonly position: Vec3;
  readonly velocity: Vec3;
}

export interface ViewerPhysicsRuntime {
  /** Create a rigid body. Returns the handle. */
  createBody(
    type: 'dynamic' | 'fixed',
    position: Vec3,
    collider: ColliderDesc,
  ): RigidBodyHandle;
  /** Bind a mesh to a body. First bind wins. */
  bind(meshId: string, handle: RigidBodyHandle): BindResult;
  /** Check whether a mesh is already bound. */
  isBound(meshId: string): boolean;
  /** Get the body state (position + velocity). */
  bodyState(handle: RigidBodyHandle): ViewerBodyState;
  /** Number of bodies created. */
  bodyCount(): number;
  /** Number of bindings currently registered. */
  bindingCount(): number;
  /** Step the simulation by a number of fixed steps. */
  step(times: number): void;
  /** Set gravity vector. */
  setGravity(gravity: Vec3): void;
  /** Total step count since world creation. */
  stepCount(): number;
  /** Broadphase warning if collider count exceeds threshold. */
  broadphaseWarning(): BroadphaseWarning | null;
  /** Reset all bodies and bindings (bindings are re-built on rebind). */
  reset(): void;
  /** Tear down internal state. */
  destroy(): void;
}

// ─── Factory ─────────────────────────────────────────────────────────

export function createViewerPhysicsRuntime(
  config: ViewerPhysicsRuntimeConfig = {},
): ViewerPhysicsRuntime {
  let integrator = buildIntegrator(config);
  // Track created bodies explicitly so bodyCount() is meaningful.
  let createdBodies = 0;
  // We mirror the bindings in our own list because BindRegistry has no clear().
  const bindings = new BindRegistry();
  const localMeshIds = new Set<string>();

  function rebuild(): Integrator {
    createdBodies = 0;
    return buildIntegrator(config);
  }

  return {
    createBody(type, position, collider): RigidBodyHandle {
      const handle = integrator.createRigidBody(type, position, collider);
      createdBodies++;
      return handle;
    },

    bind(meshId: string, handle: RigidBodyHandle): BindResult {
      const result = bindings.bind(meshId, handle);
      if (result.ok) localMeshIds.add(meshId);
      return result;
    },

    isBound(meshId: string): boolean {
      return bindings.isBound(meshId);
    },

    bodyState(handle: RigidBodyHandle): ViewerBodyState {
      return {
        position: integrator.getBodyPosition(handle),
        velocity: integrator.getBodyVelocity(handle),
      };
    },

    bodyCount(): number {
      return createdBodies;
    },

    bindingCount(): number {
      return bindings.size;
    },

    step(times: number): void {
      const n = Math.max(0, Math.floor(times));
      for (let i = 0; i < n; i++) integrator.step();
    },

    setGravity(gravity: Vec3): void {
      integrator.setGravity(gravity);
    },

    stepCount(): number {
      return integrator.stepCount;
    },

    broadphaseWarning(): BroadphaseWarning | null {
      return checkBroadphase(createdBodies) ?? null;
    },

    reset(): void {
      integrator.destroy();
      integrator = rebuild();
      // Wipe the bindings registry (one unbind per known mesh id).
      for (const id of localMeshIds) bindings.unbind(id);
      localMeshIds.clear();
    },

    destroy(): void {
      integrator.destroy();
      for (const id of localMeshIds) bindings.unbind(id);
      localMeshIds.clear();
      createdBodies = 0;
    },
  };
}

function buildIntegrator(config: ViewerPhysicsRuntimeConfig): Integrator {
  return new Integrator({
    ...(config.gravity !== undefined ? { gravity: config.gravity } : {}),
    ...(config.fixedTimeStep !== undefined ? { fixedTimeStep: config.fixedTimeStep } : {}),
    ...(config.groundY !== undefined ? { groundY: config.groundY } : {}),
    ...(config.restitution !== undefined ? { restitution: config.restitution } : {}),
    ...(config.friction !== undefined ? { friction: config.friction } : {}),
  });
}

// ─── Re-exports ──────────────────────────────────────────────────────

export {
  BindRegistry,
  checkBroadphase,
  BROADPHASE_WARNING_THRESHOLD,
  type Vec3,
  type ColliderShapeKind,
  type ColliderDesc,
  type BindResult,
};

// ─── Helpers for creating colliders without rapier WASM ───────────────

/**
 * Build a ColliderDesc from a discriminated shape kind. The viewer
 * runtime is decoupled from rapier WASM, so callers pass shapes via
 * this factory.
 */
export function buildCollider(kind: ColliderShapeKind): ColliderDesc {
  return { kind };
}