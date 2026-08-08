/**
 * Domio suggestions-service (Phase 18 #182).
 *
 * Suggestion mode — CRDT-operation suggestions on deck content.
 *
 * Exports:
 *  - Service, handlers, store, types, feature flags, pure logic.
 */

export { SuggestionsService } from './service.js';
export type { SuggestionsServiceOptions } from './service.js';
export { handlers } from './handlers.js';
export type { HttpRequest, HttpResponse, SuggestionsHandlerContext } from './handlers.js';
export { InMemorySuggestionsStore } from './store/mem_store.js';
export { PgSuggestionsStore, StoreNotConfiguredError, StoreNotImplementedError } from './store/pg_store.js';
export type { SuggestionsStore } from './store/store.js';
export { FEATURE_FLAGS, checkFeature } from './feature_flags.js';
export type { FeatureFlag } from './feature_flags.js';

// Types
export type {
  TargetType,
  SuggestionStatus,
  OpType,
  SuggestionOperation,
  Suggestion,
  SuggestionEvent,
  SuggestionEventEmitter,
  SnapshotProvider,
  BrandLockProvider,
} from './types.js';
export {
  SuggestionValidationError,
  SuggestionNotFoundError,
  InvalidStatusTransitionError,
  BrandLockError,
  OpConflictError,
  FeatureDisabledError,
  noopEmitter,
  defaultBrandLockProvider,
} from './types.js';

// Pure logic
export { validateOp } from './suggestion/ops.js';
export { detectOpConflict, markConflictingObsolete } from './suggestion/conflict.js';
export {
  createSuggestionBody,
  acceptSuggestionBody,
  rejectSuggestionBody,
  markObsoleteBody,
  applyOp,
  isExpired,
  filterExpired,
  sweepOpenSuggestions,
  findConflictingObsoleteIds,
  SUGGESTION_RETENTION_MS,
} from './suggestion/lifecycle.js';
export type { DomainOpts, DeckState } from './suggestion/lifecycle.js';

// Snapshot
export { InMemorySnapshotProvider, createIsolatedBranch, encodeSnapshot } from './snapshot.js';
