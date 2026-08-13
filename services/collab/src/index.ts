/**
 * Domio collab-service (Phase 18).
 *
 * Comments + approval + assignment service.
 *
 * Exports:
 *  - Service, handlers, store, types, feature flags.
 */

export { CollabService } from './service.js';
export type { CollabServiceOptions } from './service.js';
export { handlers } from './handlers.js';
export type { HttpRequest, HttpResponse, CollabHandlerContext } from './handlers.js';
export { InMemoryCollabStore } from './store/mem_store.js';
export {
  PgCollabStore,
  StoreNotConfiguredError,
  StoreNotImplementedError,
} from './store/pg_store.js';
export type { CollabStore } from './store/store.js';
export { FEATURE_FLAGS, checkFeature } from './feature_flags.js';
export type { FeatureFlag } from './feature_flags.js';

// Types
export type {
  Comment,
  CommentAnchor,
  CommentTargetType,
  CommentStatus,
  CommentAuthorType,
  CreateCommentInput,
  UpdateCommentInput,
  Mention,
  MentionedType,
} from './comments/types.js';
export type {
  ApprovalRequest,
  ApprovalRequestStatus,
  ApprovalDecision,
  DecisionValue,
  ApprovalPolicy,
  ApprovalLane,
  CreateApprovalRequestInput,
  RecordDecisionInput,
  OverdueLane,
} from './approval/types.js';
export type {
  Assignment,
  AssignmentStatus,
  CreateAssignmentInput,
  UpdateAssignmentInput,
  ReassignmentRecord,
} from './assignment/types.js';
export {
  CollabValidationError,
  CommentNotFoundError,
  ApprovalRequestNotFoundError,
  InvalidTransitionError,
  InvalidAnchorError,
  InvalidSlideRangeError,
  FeatureDisabledError,
  ApprovalNotPendingError,
} from './types.js';
export type { CollabEvent, CollabEventEmitter } from './types.js';
