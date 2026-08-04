/**
 * @domio/magic-move — Phase 09 magic-move compute service.
 *
 * Submit morph jobs that match elements between two slides and compute
 * interpolated element paths for slide-to-slide transitions.
 *
 * Public surface:
 *
 *  - {@link MagicMoveService} — job CRUD + worker-facing claim/complete/fail.
 *  - {@link InMemoryMagicMoveJobRepository} — in-memory repository for tests.
 *  - REST handlers with request validation.
 *  - Error types with stable `.code` strings.
 */

export * from './dal.js';
export * from './service.js';
export * from './handlers.js';
