/**
 * Domio calendar-service (Phase 18 W3).
 *
 * Calendar integration service for Google/Outlook/iCloud.
 *
 * Exports:
 *  - Service, handlers, store, types, feature flags, links, sync.
 */

export { CalendarService } from './service.js';
export type { CalendarServiceOptions } from './service.js';
export { handlers } from './handlers.js';
export type { HttpRequest, HttpResponse, CalendarHandlerContext } from './handlers.js';
export { InMemoryCalendarStore } from './store/mem_store.js';
export {
  PgCalendarStore,
  StoreNotConfiguredError,
  StoreNotImplementedError,
} from './store/pg_store.js';
export type { CalendarStore } from './store/store.js';
export { FEATURE_FLAGS, checkFeature } from './feature_flags.js';
export type { FeatureFlag } from './feature_flags.js';
export { validateCalendarLinkInput, buildEventStartKey } from './links.js';
export { syncPlan, computeChangeType, shouldSkipDueToOverride } from './sync.js';
export type { SyncPlanResult, SyncChangeType } from './types.js';

// Types
export type {
  CalendarVendor,
  CalendarLink,
  CalendarLinkInput,
  PresenterTodayItem,
  CalendarEventEmitter,
  CalendarEvent,
  ActorType,
  SyncProvider,
  OverrideProvider,
  CalendarEventOverride,
  CalendarEventState,
} from './types.js';
export {
  noopEmitter,
  noopSyncProvider,
  noopOverrideProvider,
  FeatureDisabledError,
  CalendarLinkNotFoundError,
  DuplicateCalendarLinkError,
  CalendarValidationError,
} from './types.js';
