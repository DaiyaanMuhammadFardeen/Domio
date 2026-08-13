/**
 * Domio merge-request-service (Phase 18 W2).
 *
 * Merge request service for branch-based collaboration with diff
 * computation and conflict resolution.
 *
 * Exports:
 *  - Service, handlers, store, types, feature flags, diff, merge, validators.
 */

export { MergeRequestService } from './service.js';
export type { MergeRequestServiceOptions } from './service.js';
export { handlers } from './handlers.js';
export type { HttpRequest, HttpResponse, MergeRequestHandlerContext } from './handlers.js';
export { InMemoryMergeRequestStore } from './store/mem_store.js';
export {
  PgMergeRequestStore,
  StoreNotConfiguredError,
  StoreNotImplementedError,
} from './store/pg_store.js';
export type { MergeRequestStore } from './store/store.js';
export { FEATURE_FLAGS, checkFeature } from './feature_flags.js';
export type { FeatureFlag } from './feature_flags.js';
export { computeDiff, isFastForward } from './diff.js';
export type { ComputeDiffInput, DiffResult } from './diff.js';
export { allConflictsResolved } from './merge.js';
export { validateMerge, OK_RESULT } from './validators.js';

// Types
export type {
  MergeRequest,
  MergeRequestInput,
  MergeRequestStatus,
  SlideDiff,
  SlideDiffEntry,
  ElementDiffEntry,
  BindingDiffEntry,
  SlideDiffLevel,
  ChangeType,
  ConflictResolution,
  MergeRequestEventEmitter,
  MergeRequestEvent,
  ActorType,
  MergeValidators,
  MergeValidator,
  ValidatorResult,
  DeckSnapshot,
  DiffSnapshot,
  SlideSnapshot,
  ElementSnapshot,
} from './types.js';
export {
  noopEmitter,
  noopValidators,
  FeatureDisabledError,
  MergeRequestNotFoundError,
  MergeRequestValidationError,
  ConflictsUnresolvedError,
  MergeValidationFailedError,
  MergeRequestConflictError,
  SlideDiffNotFoundError,
} from './types.js';
