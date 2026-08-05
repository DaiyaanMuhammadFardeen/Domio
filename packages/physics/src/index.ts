/**
 * @domio/physics — rigid-body physics for the Domio editor.
 *
 * This package provides:
 *  - `PhysicsWorld` — rapier WASM-backed deterministic fixed-step world
 *  - `Integrator` — pure-TS fallback when rapier fails to install
 *  - Collider shape factory (cuboid, sphere, cylinder, capsule, convexHull, trimesh)
 *  - `BindRegistry` — binding-freeze enforcement (first bind wins)
 *  - `checkBroadphase` — broadphase overhead warning for >10k colliders
 *
 * All stepping is manual (no real-time timers), guaranteeing
 * deterministic tests and replay.
 */

// ── World backends ──────────────────────────────────────────────
export { PhysicsWorld } from './PhysicsWorld.js';
export { Integrator } from './fallback/Integrator.js';

// ── Collider factory ────────────────────────────────────────────
export { cuboid, sphere, cylinder, capsule, convexHull, trimesh } from './Colliders.js';

// ── Binding freeze ──────────────────────────────────────────────
export { BindRegistry } from './bindings.js';
export type { BindResult, BindOk, BindError } from './bindings.js';

// ── Broadphase warning ──────────────────────────────────────────
export { checkBroadphase, BROADPHASE_WARNING_THRESHOLD } from './broadphase.js';

// ── Types ───────────────────────────────────────────────────────
export type {
  Vec3,
  RigidBodyType,
  RigidBodyHandle,
  PhysicsWorldConfig,
  ColliderDesc,
  ColliderShapeKind,
  BoundBody,
  BroadphaseWarning,
} from './types.js';
