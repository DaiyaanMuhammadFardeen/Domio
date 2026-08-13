/**
 * Domio task-manager-service (Phase 18 #191).
 *
 * External task tracker integrations (Asana / Jira / Linear).
 *
 * Exports:
 *  - Service, handlers, store, types, feature flags.
 */

export { TaskManagerService } from './service.js';
export type { TaskManagerServiceOptions, SyncLinksSummary } from './service.js';
export { handlers } from './handlers.js';
export type { HttpRequest, HttpResponse, TaskManagerHandlerContext } from './handlers.js';
export { InMemoryTaskLinkStore } from './store/mem_store.js';
export {
  PgTaskLinkStore,
  StoreNotConfiguredError,
  StoreNotImplementedError,
} from './store/pg_store.js';
export type { TaskLinkStore } from './store/store.js';
export { FEATURE_FLAGS, checkFeature } from './feature_flags.js';
export type { FeatureFlag } from './feature_flags.js';

// Types
export type {
  TaskVendor,
  SyncMode,
  SyncDirection,
  SyncOutcome,
  FieldMap,
  FieldMapValue,
  TaskLink,
  TaskState,
  ConflictResolution,
  TaskProvider,
  TaskManagerEvent,
  TaskManagerEventEmitter,
} from './types.js';
export {
  FeatureDisabledError,
  TaskLinkNotFoundError,
  DuplicateTaskLinkError,
  SyncConflictError,
  ValidationError,
  noopEmitter,
  noopTaskProvider,
} from './types.js';

// Pure logic — mapping
export { FIELD_MAP_KEYS, validateFieldMap, applyFieldMap, describeMapping } from './mapping.js';

// Pure logic — conflicts
export { detectConflict, resolveSyncConflict } from './conflicts.js';
