/**
 * Collab service (Phase 18).
 *
 * Transport-agnostic orchestration of comments, approvals, and assignments.
 * Depends on:
 *  - {@link CollabStore}       — persistence.
 *  - {@link CollabEventEmitter} — event emission (default: noopEmitter).
 */

import { randomUUID } from 'crypto';
import type { Comment, CreateCommentInput, Mention, UpdateCommentInput } from './comments/types.js';
import {
  createCommentBody,
  updateCommentBody,
  resolveCommentBody,
  addReaction as addReactionBody,
  removeReaction as removeReactionBody,
  promoteOrphan as promoteOrphanBody,
} from './comments/logic.js';
import type { CreateApprovalRequestInput, ApprovalRequest, ApprovalDecision, RecordDecisionInput, OverdueLane } from './approval/types.js';
import {
  createApprovalRequestBody,
  submitApprovalRequestBody,
  recordApprovalDecisionBody,
  recomputeStatus,
  overdueLanes as overdueLanesBody,
  backToDraftBody,
} from './approval/logic.js';
import type { CreateAssignmentInput, Assignment, UpdateAssignmentInput } from './assignment/types.js';
import {
  createAssignmentBody,
  updateAssignmentBody,
} from './assignment/logic.js';
import { checkFeature, FEATURE_FLAGS } from './feature_flags.js';
import type { CollabEventEmitter } from './types.js';
import { noopEmitter } from './types.js';
import type { CollabStore } from './store/store.js';

// ---------------------------------------------------------------------------
// Service options
// ---------------------------------------------------------------------------

export interface CollabServiceOptions {
  readonly store: CollabStore;
  readonly eventEmitter?: CollabEventEmitter;
  /** Clock. Default Date.now. */
  readonly now?: () => Date;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class CollabService {
  private readonly store: CollabStore;
  private readonly emitter: CollabEventEmitter;
  private readonly clock: () => Date;

  constructor(opts: CollabServiceOptions) {
    if (!opts.store) throw new Error('CollabService: store is required');
    this.store = opts.store;
    this.emitter = opts.eventEmitter ?? noopEmitter;
    this.clock = opts.now ?? (() => new Date());
  }

  private idGen(): string {
    return randomUUID();
  }

  private now(): Date {
    return this.clock();
  }

  // -------------------------------------------------------------------------
  // Comments
  // -------------------------------------------------------------------------

  async createComment(input: CreateCommentInput): Promise<{ comment: Comment; mentions: Mention[] }> {
    checkFeature(FEATURE_FLAGS.comments);
    const existing = await this.store.listCommentsByDeck(input.deckId);
    const { comment, mentions } = createCommentBody(input, existing, {
      now: () => this.now(),
      idGen: () => this.idGen(),
    });

    await this.store.insertComment(comment);
    if (mentions.length > 0) {
      await this.store.insertMentions(mentions);
    }

    // Emit events
    await this.emitter.publish('comment.created', {
      event_id: this.idGen(),
      event_type: 'comment.created',
      ts_ms: this.now().getTime(),
      workspace_id: comment.workspaceId,
      deck_id: comment.deckId,
      actor_id: comment.authorId,
      actor_type: comment.authorType,
      payload: { comment_id: comment.id, target_type: comment.targetType, target_id: comment.targetId },
    });

    for (const m of mentions) {
      await this.emitter.publish('comment.mentioned', {
        event_id: this.idGen(),
        event_type: 'comment.mentioned',
        ts_ms: this.now().getTime(),
        workspace_id: m.workspaceId,
        deck_id: comment.deckId,
        actor_id: comment.authorId,
        actor_type: comment.authorType,
        payload: { comment_id: comment.id, mentioned_id: m.mentionedId, mentioned_type: m.mentionedType },
      });
    }

    return { comment, mentions };
  }

  async listComments(
    deckId: string,
    opts?: { threadId?: string; status?: string },
  ): Promise<Comment[]> {
    checkFeature(FEATURE_FLAGS.comments);
    return this.store.listCommentsByDeck(deckId, opts);
  }

  async updateComment(
    commentId: string,
    patch: UpdateCommentInput,
  ): Promise<Comment> {
    checkFeature(FEATURE_FLAGS.comments);
    const existing = await this.store.getComment(commentId);
    if (!existing) throw new Error(`Comment not found: ${commentId}`);
    const updated = updateCommentBody(existing, patch, this.now());
    return this.store.updateComment(commentId, {
      bodyMd: updated.bodyMd,
      status: updated.status,
      updatedAt: updated.updatedAt,
    });
  }

  async resolveComment(
    commentId: string,
    resolvedBy: string,
  ): Promise<Comment> {
    checkFeature(FEATURE_FLAGS.comments);
    const existing = await this.store.getComment(commentId);
    if (!existing) throw new Error(`Comment not found: ${commentId}`);
    const resolved = resolveCommentBody(existing, resolvedBy, this.now());
    const updated = await this.store.updateComment(commentId, {
      status: resolved.status,
      resolvedAt: resolved.resolvedAt,
      resolvedBy: resolved.resolvedBy,
      updatedAt: resolved.updatedAt,
    });

    await this.emitter.publish('comment.resolved', {
      event_id: this.idGen(),
      event_type: 'comment.resolved',
      ts_ms: this.now().getTime(),
      workspace_id: updated.workspaceId,
      deck_id: updated.deckId,
      actor_id: resolvedBy,
      actor_type: 'member',
      payload: { comment_id: updated.id },
    });

    return updated;
  }

  async addReaction(
    commentId: string,
    emoji: string,
    userId: string,
  ): Promise<Comment> {
    checkFeature(FEATURE_FLAGS.comments);
    const existing = await this.store.getComment(commentId);
    if (!existing) throw new Error(`Comment not found: ${commentId}`);
    const updated = addReactionBody(existing, emoji, userId);
    return this.store.updateComment(commentId, {
      emojiReactions: updated.emojiReactions,
      updatedAt: updated.updatedAt,
    });
  }

  async removeReaction(
    commentId: string,
    emoji: string,
    userId: string,
  ): Promise<Comment> {
    checkFeature(FEATURE_FLAGS.comments);
    const existing = await this.store.getComment(commentId);
    if (!existing) throw new Error(`Comment not found: ${commentId}`);
    const updated = removeReactionBody(existing, emoji, userId);
    return this.store.updateComment(commentId, {
      emojiReactions: updated.emojiReactions,
      updatedAt: updated.updatedAt,
    });
  }

  async promoteOrphan(
    commentId: string,
    slideTargetId: string,
  ): Promise<Comment> {
    checkFeature(FEATURE_FLAGS.comments);
    const existing = await this.store.getComment(commentId);
    if (!existing) throw new Error(`Comment not found: ${commentId}`);
    const updated = promoteOrphanBody(existing, slideTargetId, this.now());
    return this.store.updateComment(commentId, {
      targetType: updated.targetType,
      targetId: updated.targetId,
      isOrphaned: updated.isOrphaned,
      updatedAt: updated.updatedAt,
    });
  }

  // -------------------------------------------------------------------------
  // Approvals
  // -------------------------------------------------------------------------

  async createApprovalRequest(
    input: CreateApprovalRequestInput,
  ): Promise<{ request: ApprovalRequest; autoSubmitted: boolean }> {
    checkFeature(FEATURE_FLAGS.approval);
    const { request, autoSubmitted } = createApprovalRequestBody(input, {
      now: () => this.now(),
      idGen: () => this.idGen(),
    });

    await this.store.insertApprovalRequest(request);

    if (autoSubmitted) {
      await this.emitter.publish('approval.requested', {
        event_id: this.idGen(),
        event_type: 'approval.requested',
        ts_ms: this.now().getTime(),
        workspace_id: request.workspaceId,
        deck_id: request.deckId,
        actor_id: request.requestedBy,
        actor_type: 'member',
        payload: { request_id: request.id, version_id: request.versionId },
      });
    }

    return { request, autoSubmitted };
  }

  async submitApprovalRequest(
    requestId: string,
    actorId: string,
  ): Promise<ApprovalRequest> {
    checkFeature(FEATURE_FLAGS.approval);
    const existing = await this.store.getApprovalRequest(requestId);
    if (!existing) throw new Error(`Approval request not found: ${requestId}`);
    const updated = submitApprovalRequestBody(existing, actorId, this.now());
    const stored = await this.store.updateApprovalRequest(requestId, {
      status: updated.status,
      requestedAt: updated.requestedAt,
      updatedAt: updated.updatedAt,
      updatedBy: updated.updatedBy,
    });

    await this.emitter.publish('approval.requested', {
      event_id: this.idGen(),
      event_type: 'approval.requested',
      ts_ms: this.now().getTime(),
      workspace_id: stored.workspaceId,
      deck_id: stored.deckId,
      actor_id: actorId,
      actor_type: 'member',
      payload: { request_id: stored.id, version_id: stored.versionId },
    });

    return stored;
  }

  async recordApprovalDecision(
    requestId: string,
    input: RecordDecisionInput,
    actorId: string,
  ): Promise<{ decision: ApprovalDecision; request: ApprovalRequest }> {
    checkFeature(FEATURE_FLAGS.approval);
    const existing = await this.store.getApprovalRequest(requestId);
    if (!existing) throw new Error(`Approval request not found: ${requestId}`);

    const { decision } = recordApprovalDecisionBody(
      existing,
      input,
      actorId,
      existing.versionId,
      { now: () => this.now(), idGen: () => this.idGen() },
    );

    await this.store.insertApprovalDecision(decision);

    // Recompute status from ALL decisions
    const allDecisions = await this.store.listApprovalDecisions(requestId);
    const finalStatus = recomputeStatus(existing, allDecisions);
    const closedAt = finalStatus !== 'pending' ? this.now() : null;

    const stored = await this.store.updateApprovalRequest(requestId, {
      status: finalStatus,
      closedAt,
      updatedAt: this.now(),
      updatedBy: actorId,
    });

    await this.emitter.publish('approval.decision.recorded', {
      event_id: this.idGen(),
      event_type: 'approval.decision.recorded',
      ts_ms: this.now().getTime(),
      workspace_id: stored.workspaceId,
      deck_id: stored.deckId,
      actor_id: actorId,
      actor_type: 'member',
      payload: {
        request_id: stored.id,
        decision_id: decision.id,
        lane: decision.lane,
        decision: decision.decision,
        new_status: finalStatus,
      },
    });

    return { decision, request: stored };
  }

  async listApprovalRequests(
    deckId: string,
    opts?: { status?: string },
  ): Promise<ApprovalRequest[]> {
    checkFeature(FEATURE_FLAGS.approval);
    return this.store.listApprovalRequestsByDeck(deckId, opts);
  }

  async overdueLanes(requestId: string): Promise<OverdueLane[]> {
    checkFeature(FEATURE_FLAGS.approval);
    const request = await this.store.getApprovalRequest(requestId);
    if (!request) throw new Error(`Approval request not found: ${requestId}`);
    return overdueLanesBody(request, this.now());
  }

  async backToDraft(
    requestId: string,
    actorId: string,
  ): Promise<ApprovalRequest> {
    checkFeature(FEATURE_FLAGS.approval);
    const existing = await this.store.getApprovalRequest(requestId);
    if (!existing) throw new Error(`Approval request not found: ${requestId}`);
    const updated = backToDraftBody(existing, actorId, this.now());
    return this.store.updateApprovalRequest(requestId, {
      status: updated.status,
      closedAt: updated.closedAt,
      updatedAt: updated.updatedAt,
      updatedBy: updated.updatedBy,
    });
  }

  // -------------------------------------------------------------------------
  // Assignments
  // -------------------------------------------------------------------------

  async createAssignment(
    input: CreateAssignmentInput,
    actorId: string,
  ): Promise<Assignment> {
    checkFeature(FEATURE_FLAGS.assignments);
    const assignment = createAssignmentBody(input, actorId, {
      now: () => this.now(),
      idGen: () => this.idGen(),
    });

    await this.store.insertAssignment(assignment);

    await this.emitter.publish('assignment.created', {
      event_id: this.idGen(),
      event_type: 'assignment.created',
      ts_ms: this.now().getTime(),
      workspace_id: assignment.workspaceId,
      deck_id: assignment.deckId,
      actor_id: actorId,
      actor_type: 'member',
      payload: {
        assignment_id: assignment.id,
        slide_range: assignment.slideRange,
        primary_id: assignment.primaryId,
      },
    });

    return assignment;
  }

  async updateAssignment(
    assignmentId: string,
    patch: UpdateAssignmentInput,
    actorId: string,
  ): Promise<{ assignment: Assignment; reassigned: boolean }> {
    checkFeature(FEATURE_FLAGS.assignments);
    const existing = await this.store.getAssignment(assignmentId);
    if (!existing) throw new Error(`Assignment not found: ${assignmentId}`);

    const { assignment: updated, reassigned } = updateAssignmentBody(
      existing,
      patch,
      actorId,
      this.now(),
    );

    const stored = await this.store.updateAssignment(assignmentId, {
      status: updated.status,
      blockedReason: updated.blockedReason,
      dueAt: updated.dueAt,
      watchers: updated.watchers,
      primaryId: updated.primaryId,
      completedAt: updated.completedAt,
      updatedAt: updated.updatedAt,
    });

    // Emit events
    if (patch.status !== undefined && patch.status !== existing.status) {
      await this.emitter.publish('assignment.status_changed', {
        event_id: this.idGen(),
        event_type: 'assignment.status_changed',
        ts_ms: this.now().getTime(),
        workspace_id: stored.workspaceId,
        deck_id: stored.deckId,
        actor_id: actorId,
        actor_type: 'member',
        payload: {
          assignment_id: stored.id,
          status: stored.status,
          blocked_reason: stored.blockedReason,
        },
      });
    }

    if (reassigned && patch.primaryId) {
      await this.emitter.publish('assignment.reassigned', {
        event_id: this.idGen(),
        event_type: 'assignment.reassigned',
        ts_ms: this.now().getTime(),
        workspace_id: stored.workspaceId,
        deck_id: stored.deckId,
        actor_id: actorId,
        actor_type: 'member',
        payload: {
          assignment_id: stored.id,
          from: existing.primaryId,
          to: patch.primaryId,
        },
      });

      // Persist reassignment history to the dedicated table
      await this.store.insertReassignmentHistory({
        id: this.idGen(),
        workspace_id: stored.workspaceId,
        assignment_id: stored.id,
        old_primary_id: existing.primaryId,
        new_primary_id: patch.primaryId,
        actor_id: actorId,
        reason: null,
        changed_at: this.now(),
      });
    }

    return { assignment: stored, reassigned };
  }

  async listUserAssignments(userId: string): Promise<Assignment[]> {
    checkFeature(FEATURE_FLAGS.assignments);
    return this.store.listAssignmentsByUser(userId);
  }
}
