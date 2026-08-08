/**
 * Assignment module logic (Phase 18, #181).
 *
 * Business logic for slide-level assignments: validation, status transitions,
 * create/update/list. Reassignment history is tracked via audit events only
 * (a dedicated reassignment_history table is a later-wave migration).
 */

import type {
  Assignment,
  AssignmentStatus,
  CreateAssignmentInput,
  UpdateAssignmentInput,
} from './types.js';
import {
  InvalidSlideRangeError,
  InvalidTransitionError,
  CollabValidationError,
} from '../types.js';

// ---------------------------------------------------------------------------
// Slide range validation
// ---------------------------------------------------------------------------

export function validateSlideRange(range: { start: number; end: number }): void {
  if (range.start < 1) {
    throw new InvalidSlideRangeError(`slide start must be >= 1, got ${range.start}`);
  }
  if (range.end < range.start) {
    throw new InvalidSlideRangeError(`slide end (${range.end}) must be >= start (${range.start})`);
  }
}

// ---------------------------------------------------------------------------
// Status transitions
// ---------------------------------------------------------------------------

const VALID_TRANSITIONS: Record<AssignmentStatus, readonly AssignmentStatus[]> = {
  not_started: ['in_progress'],
  in_progress: ['blocked', 'review', 'done'],
  blocked: ['in_progress', 'review'],
  review: ['in_progress', 'done'],
  done: [],
};

export function validateAssignmentTransition(
  from: AssignmentStatus,
  to: AssignmentStatus,
): void {
  const allowed = VALID_TRANSITIONS[from];
  if (!allowed || !allowed.includes(to)) {
    throw new InvalidTransitionError(from, to, `Assignment transition ${from} → ${to} is not allowed`);
  }
}

// ---------------------------------------------------------------------------
// Create assignment
// ---------------------------------------------------------------------------

export function createAssignmentBody(
  input: CreateAssignmentInput,
  actorId: string,
  opts: { now: () => Date; idGen: () => string },
): Assignment {
  validateSlideRange(input.slideRange);

  const now = opts.now();

  return {
    id: opts.idGen(),
    workspaceId: input.workspaceId,
    deckId: input.deckId,
    slideRange: { ...input.slideRange },
    primaryId: input.primaryId,
    watchers: [...input.watchers],
    status: 'not_started',
    blockedReason: null,
    dueAt: input.dueAt ?? null,
    createdBy: actorId,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    taskLinkId: input.taskLinkId ?? null,
  };
}

// ---------------------------------------------------------------------------
// Update assignment
// ---------------------------------------------------------------------------

export function updateAssignmentBody(
  assignment: Assignment,
  patch: UpdateAssignmentInput,
  _actorId: string,
  now: Date,
): { assignment: Assignment; reassigned: boolean } {
  let reassigned = false;
  let newStatus = assignment.status;
  let newBlockedReason = assignment.blockedReason;
  let newCompletedAt = assignment.completedAt;

  if (patch.status !== undefined) {
    validateAssignmentTransition(assignment.status, patch.status);
    newStatus = patch.status;

    // If blocked, requires blockedReason
    if (patch.status === 'blocked') {
      const reason = patch.blockedReason ?? assignment.blockedReason;
      if (!reason || reason.trim().length === 0) {
        throw new CollabValidationError('blocked status requires a non-empty blocked_reason');
      }
      newBlockedReason = reason;
    }

    // If done, set completedAt
    if (patch.status === 'done') {
      newCompletedAt = now;
    }

    // If moving away from blocked, clear blockedReason
    if (assignment.status === 'blocked' && patch.status !== 'blocked') {
      newBlockedReason = null;
    }
  }

  if (patch.blockedReason !== undefined && patch.status !== 'blocked') {
    // Only allow setting blockedReason when transitioning to blocked
    if (assignment.status !== 'blocked') {
      throw new CollabValidationError('blocked_reason can only be set when status is blocked');
    }
    newBlockedReason = patch.blockedReason;
  }

  if (patch.primaryId !== undefined && patch.primaryId !== assignment.primaryId) {
    reassigned = true;
  }

  const updated: Assignment = {
    ...assignment,
    status: newStatus,
    blockedReason: newBlockedReason,
    completedAt: newCompletedAt,
    ...(patch.primaryId !== undefined ? { primaryId: patch.primaryId } : {}),
    ...(patch.watchers !== undefined ? { watchers: [...patch.watchers] } : {}),
    ...(patch.dueAt !== undefined ? { dueAt: patch.dueAt } : {}),
    updatedAt: now,
  };

  return { assignment: updated, reassigned };
}
