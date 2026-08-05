/**
 * Binding freeze — enforces that a mesh can be bound to a rigid body
 * at most once.  Subsequent bind attempts are rejected with a clear
 * error result.
 *
 * This implements the "binding freeze" behavior described in the doc:
 * "first binding wins, later attempts rejected with a clear error."
 *
 * The `BoundMesh` interface is backend-agnostic — both the rapier
 * world and the fallback integrator use this same registry.
 */

import type { BoundBody, RigidBodyHandle } from './types.js';

/** Error returned when a binding freeze is violated. */
export interface BindError {
  readonly ok: false;
  readonly message: string;
  readonly existingMeshId: string;
  readonly newMeshId: string;
}

/** Successful bind result. */
export interface BindOk {
  readonly ok: true;
  readonly handle: RigidBodyHandle;
}

export type BindResult = BindOk | BindError;

/**
 * Registry of mesh-id → rigid-body handle bindings.
 * Provides the binding-freeze guarantee: only the first bind wins.
 */
export class BindRegistry {
  /** meshId → { handle, meshId } */
  private bindings = new Map<string, BoundBody>();

  /**
   * Bind a mesh to a rigid body.
   * Returns `ok: true` on first bind, or `ok: false` if already bound.
   */
  bind(meshId: string, handle: RigidBodyHandle): BindResult {
    if (this.bindings.has(meshId)) {
      const existing = this.bindings.get(meshId)!;
      return {
        ok: false,
        message: `Binding freeze: mesh "${meshId}" is already bound to body handle ${existing.handle}. First binding wins — re-bind rejected.`,
        existingMeshId: existing.meshId,
        newMeshId: meshId,
      };
    }

    this.bindings.set(meshId, { handle, meshId });
    return { ok: true, handle };
  }

  /**
   * Retrieve the rigid-body handle for a bound mesh, or undefined.
   */
  get(meshId: string): BoundBody | undefined {
    return this.bindings.get(meshId);
  }

  /**
   * Check whether a mesh is already bound.
   */
  isBound(meshId: string): boolean {
    return this.bindings.has(meshId);
  }

  /**
   * Remove a binding (e.g. when a body is destroyed).
   * Returns true if the binding existed and was removed.
   */
  unbind(meshId: string): boolean {
    return this.bindings.delete(meshId);
  }

  /**
   * Total number of active bindings.
   */
  get size(): number {
    return this.bindings.size;
  }
}
