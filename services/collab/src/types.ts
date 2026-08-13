/**
 * Collab service — shared types and errors (Phase 18).
 *
 * Common types used by comments, approvals, and assignments modules.
 */

// ---------------------------------------------------------------------------
// Event envelope
// ---------------------------------------------------------------------------

export interface CollabEvent {
  readonly event_id: string;
  readonly event_type: string;
  readonly ts_ms: number;
  readonly workspace_id: string;
  readonly deck_id: string;
  readonly actor_id: string;
  readonly actor_type: string;
  readonly payload: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// EventEmitter interface (injected dependency)
// ---------------------------------------------------------------------------

export interface CollabEventEmitter {
  publish(subject: string, payload: Record<string, unknown>): Promise<void>;
}

export const noopEmitter: CollabEventEmitter = {
  async publish(): Promise<void> {
    /* drop */
  },
};

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class CollabValidationError extends Error {
  readonly code: string;
  constructor(message: string, code: string = 'COLLAB_VALIDATION_ERROR') {
    super(message);
    this.name = 'CollabValidationError';
    this.code = code;
  }
}

export class CommentNotFoundError extends Error {
  readonly code = 'COMMENT_NOT_FOUND' as const;
  constructor(public readonly commentId: string) {
    super(`Comment not found: ${commentId}`);
    this.name = 'CommentNotFoundError';
  }
}

export class ApprovalRequestNotFoundError extends Error {
  readonly code = 'APPROVAL_REQUEST_NOT_FOUND' as const;
  constructor(public readonly requestId: string) {
    super(`Approval request not found: ${requestId}`);
    this.name = 'ApprovalRequestNotFoundError';
  }
}

export class InvalidTransitionError extends Error {
  readonly code = 'INVALID_TRANSITION' as const;
  constructor(
    public readonly from: string,
    public readonly to: string,
    message?: string,
  ) {
    super(message ?? `Invalid transition: ${from} → ${to}`);
    this.name = 'InvalidTransitionError';
  }
}

export class InvalidAnchorError extends Error {
  readonly code = 'INVALID_ANCHOR' as const;
  constructor(message: string) {
    super(message);
    this.name = 'InvalidAnchorError';
  }
}

export class InvalidSlideRangeError extends Error {
  readonly code = 'INVALID_SLIDE_RANGE' as const;
  constructor(message: string) {
    super(message);
    this.name = 'InvalidSlideRangeError';
  }
}

export class FeatureDisabledError extends Error {
  readonly code = 'FEATURE_DISABLED' as const;
  constructor(public readonly flag: string) {
    super(`Feature disabled: ${flag}`);
    this.name = 'FeatureDisabledError';
  }
}

export class ApprovalNotPendingError extends Error {
  readonly code = 'APPROVAL_NOT_PENDING' as const;
  constructor(public readonly requestId: string) {
    super(`Approval request is not pending: ${requestId}`);
    this.name = 'ApprovalNotPendingError';
  }
}
