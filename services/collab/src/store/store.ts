/**
 * Collab store interface (Phase 18).
 *
 * Transport-agnostic persistence layer for comments, approvals, and assignments.
 * Two implementations:
 *  - {@link InMemoryCollabStore} — used in tests and dev.
 *  - {@link PgCollabStore}       — pg-pool-backed (scaffolding + nil-guards).
 */

import type { Comment, Mention } from '../comments/types.js';
import type { ApprovalRequest, ApprovalDecision } from '../approval/types.js';
import type { Assignment } from '../assignment/types.js';

// ---------------------------------------------------------------------------
// Store interface
// ---------------------------------------------------------------------------

export interface CollabStore {
  // -------------------------------------------------------------------------
  // Comments
  // -------------------------------------------------------------------------

  insertComment(comment: Comment): Promise<void>;
  listCommentsByDeck(
    deckId: string,
    opts?: { threadId?: string; status?: string },
  ): Promise<Comment[]>;
  getComment(commentId: string): Promise<Comment | null>;
  updateComment(
    commentId: string,
    patch: Partial<
      Pick<
        Comment,
        | 'bodyMd'
        | 'status'
        | 'resolvedAt'
        | 'resolvedBy'
        | 'isOrphaned'
        | 'targetType'
        | 'targetId'
        | 'anchor'
        | 'emojiReactions'
        | 'updatedAt'
      >
    >,
  ): Promise<Comment>;
  insertMentions(mentions: Mention[]): Promise<void>;

  // -------------------------------------------------------------------------
  // Approvals
  // -------------------------------------------------------------------------

  insertApprovalRequest(request: ApprovalRequest): Promise<void>;
  getApprovalRequest(requestId: string): Promise<ApprovalRequest | null>;
  updateApprovalRequest(
    requestId: string,
    patch: Partial<
      Pick<ApprovalRequest, 'status' | 'requestedAt' | 'closedAt' | 'updatedAt' | 'updatedBy'>
    >,
  ): Promise<ApprovalRequest>;
  insertApprovalDecision(decision: ApprovalDecision): Promise<void>;
  listApprovalDecisions(requestId: string): Promise<ApprovalDecision[]>;
  listApprovalRequestsByDeck(
    deckId: string,
    opts?: { status?: string },
  ): Promise<ApprovalRequest[]>;

  // -------------------------------------------------------------------------
  // Assignments
  // -------------------------------------------------------------------------

  insertAssignment(assignment: Assignment): Promise<void>;
  getAssignment(assignmentId: string): Promise<Assignment | null>;
  updateAssignment(
    assignmentId: string,
    patch: Partial<
      Pick<
        Assignment,
        | 'status'
        | 'blockedReason'
        | 'dueAt'
        | 'watchers'
        | 'primaryId'
        | 'completedAt'
        | 'updatedAt'
      >
    >,
  ): Promise<Assignment>;
  listAssignmentsByUser(userId: string): Promise<Assignment[]>;

  // -------------------------------------------------------------------------
  // Reassignment history
  // -------------------------------------------------------------------------

  insertReassignmentHistory(record: ReassignmentHistoryRecord): Promise<void>;
}

// ---------------------------------------------------------------------------
// Reassignment history record (Phase 18 — reassignment_history table)
// ---------------------------------------------------------------------------

export interface ReassignmentHistoryRecord {
  readonly id: string;
  readonly workspace_id: string;
  readonly assignment_id: string;
  readonly old_primary_id: string | null;
  readonly new_primary_id: string;
  readonly actor_id: string;
  readonly reason: string | null;
  readonly changed_at: Date;
}
