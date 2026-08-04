/**
 * @domio/timeline-api — Phase 09 animation & transition data plane.
 *
 * REST backend for timeline/track/keyframe/trigger CRUD,
 * easing-curve CRUD, animation-preset CRUD, and reduced-motion settings.
 *
 * Public surface:
 *
 *  - {@link TimelineService} — timeline CRUD, easing-curve CRUD,
 *    preset application, transition CRUD, reduced-motion settings.
 *  - In-memory repositories for tests + dev fallback.
 *  - REST handlers with schema validation.
 *  - Error types with stable `.code` strings.
 */

export * from './dal.js';
export * from './service.js';
export * from './handlers.js';
export * from './metrics.js';
export * from './audit.js';
export * from './schemas.js';
