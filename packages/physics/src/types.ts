/** Shared physics types used across rapier and fallback backends. */

/** A 3-component vector. */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Rigid-body type — 'dynamic' is affected by forces; 'fixed' is immovable. */
export type RigidBodyType = 'dynamic' | 'fixed';

/** Opaque handle returned by the world when creating a rigid body. */
export type RigidBodyHandle = number;

/** Configuration for creating a new PhysicsWorld. */
export interface PhysicsWorldConfig {
  /** Gravity vector (default: { x: 0, y: -9.81, z: 0 }). */
  gravity?: Vec3;
  /** Fixed time-step in seconds (default: 1/60 ≈ 0.01667). */
  fixedTimeStep?: number;
}

/** Collision shape descriptor — wraps rapier's ColliderDesc or a plain object for the fallback. */
export interface ColliderDesc {
  /** Internal rapier collider descriptor (present when using rapier backend). */
  readonly _rapierDesc?: unknown;
  /** Shape kind for the fallback integrator. */
  readonly kind: ColliderShapeKind;
}

/** Discriminated union of shape kinds for the fallback backend. */
export type ColliderShapeKind =
  | { type: 'cuboid'; halfX: number; halfY: number; halfZ: number }
  | { type: 'sphere'; radius: number }
  | { type: 'cylinder'; halfHeight: number; radius: number }
  | { type: 'capsule'; halfHeight: number; radius: number }
  | { type: 'convexHull'; positions: Float32Array }
  | { type: 'trimesh'; vertices: Float32Array; indices: Uint32Array };

/** A rigid body entry tracked by the binding map. */
export interface BoundBody {
  handle: RigidBodyHandle;
  meshId: string;
}

/** Broadphase warning emitted when collider count exceeds the threshold. */
export interface BroadphaseWarning {
  message: string;
  colliderCount: number;
}
