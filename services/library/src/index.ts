/**
 * Domio library-service (Phase 18 Wave 3).
 *
 * Slide library + auto-update binding service.
 *
 * Exports:
 *  - Service, handlers, store, types, feature flags.
 */

export { LibraryService } from './service.js';
export type { LibraryServiceOptions } from './service.js';
export { handlers } from './handlers.js';
export type { HttpRequest, HttpResponse, LibraryHandlerContext } from './handlers.js';
export { InMemoryLibraryStore } from './store/mem_store.js';
export {
  PgLibraryStore,
  StoreNotConfiguredError,
  StoreNotImplementedError,
} from './store/pg_store.js';
export type { LibraryStore } from './store/store.js';
export { FEATURE_FLAGS, checkFeature } from './feature_flags.js';
export type { FeatureFlag } from './feature_flags.js';

// Types
export type {
  LibraryScope,
  EntryStatus,
  InsertMode,
  AutoUpdateMode,
  SlideLibraryEntry,
  LibraryVersion,
  LibrarySnapshotInput,
  AutoUpdateBinding,
  LibraryEvent,
  LibraryEventEmitter,
} from './types.js';
export {
  LibraryValidationError,
  EntryNotFoundError,
  VersionNotFoundError,
  RetiredEntryError,
  SupersedeChainError,
  FeatureDisabledError,
  BindingNotFoundError,
  noopEmitter,
} from './types.js';

// Pure logic
export {
  createEntryBody,
  addVersionBody,
  publishEntryBody,
  retireEntryBody,
  insertFromLibraryBody,
  isBindingDue,
  shouldApply,
  computeLatestVersionNum,
} from './entries.js';
export type { DomainOpts, ApplyDecision } from './entries.js';
