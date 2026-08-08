/**
 * Domio meeting-integration-service (Phase 18).
 *
 * Meeting integration service for Zoom/Meet/Teams.
 *
 * Exports:
 *  - Service, handlers, store, types, feature flags, tokens, markers.
 */

export { MeetingIntegrationService } from './service.js';
export type { MeetingIntegrationServiceOptions } from './service.js';
export { handlers } from './handlers.js';
export type { HttpRequest, HttpResponse, MeetingHandlerContext } from './handlers.js';
export { InMemoryMeetingStore } from './store/mem_store.js';
export { PgMeetingStore, StoreNotConfiguredError, StoreNotImplementedError } from './store/pg_store.js';
export type { MeetingStore } from './store/store.js';
export { FEATURE_FLAGS, checkFeature } from './feature_flags.js';
export type { FeatureFlag } from './feature_flags.js';
export { issueMeetingToken, verifyMeetingToken, validateMeetingTokenScope, setTokenSecret, getTokenSecret } from './tokens.js';
export type { IssueTokenDeps, VerifyTokenInput, VerifyTokenResult } from './tokens.js';
export { recordMarkerBody } from './markers.js';
export type { RecordMarkerDeps } from './markers.js';

// Types
export type { Vendor, IntegrationStatus, MeetingIntegration, MeetingIntegrationInput, MeetingToken, IssueTokenInput, MeetingMarker, RecordMarkerInput, MeetingIntegrationEvent, MeetingEventEmitter } from './types.js';
export { ValidationError, IntegrationNotFoundError, TokenInvalidError, MeetingNotActiveError, FeatureDisabledError, noopEmitter } from './types.js';
