/**
 * @domio/keyframes-svc — Phase 11 3D camera keyframe service.
 *
 * REST backend for camera keyframe CRUD, cubic-bezier interpolation,
 * and 60Hz batch LUT precomputation.
 *
 * Public surface:
 *  - {@link createApp} — Hono app factory with injectable deps.
 *  - In-memory repository for tests + dev fallback.
 *  - Local cubic-bezier interpolator (Newton-Raphson + bisection fallback).
 *  - Local easing LRU cache (capacity 64).
 *
 * NOTE: packages/3d-engine/src/camera/KeyframeInterpolator.ts does not
 * exist at build time — local fallback is used.  Engine wiring expected
 * at integration.
 *
 * NOTE: packages/easing exports LutCache/validateBezier/cubicBezier but
 * @domio/easing is NOT in tsconfig.base.json paths — using local
 * implementations to avoid dependency risk.
 */

export { createApp, type AppDeps } from './app.js';
export {
  InMemoryCameraKeyframeRepository,
  defaultIdGenerator,
  type CameraKeyframeRepository,
} from './repo.js';
export { KeyframeNotFoundError } from './repo.js';
export { EasingLruCache, easingKey } from './easing-cache.js';
export { interpolatePose, checkCrossfade } from './interpolator.js';
export * from './types.js';
export {
  validateCreateKeyframe,
  validatePatchKeyframe,
  validateInterpolateBody,
  validateBatchBody,
  validateEasingMonotonicity,
  type ValidationResult,
  type EasingValidationError,
} from './schemas.js';
