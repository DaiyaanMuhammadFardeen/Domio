/**
 * In-memory collab store (Phase 18).
 *
 * Backs every method of {@link CollabStore} with Maps. Used in unit
 * tests and in dev when DATABASE_URL is unset.
 */

import type { Comment, Mention } from '../comments/types.js';
import type { ApprovalRequest, ApprovalDecision } from '../approval/types.js';
import type { Assignment } from '../assignment/types.js';
import { CommentNotFoundError, ApprovalRequestNotFoundError } from '../types.js';
import type { CollabStore, ReassignmentHistoryRecord } from './store.js';

export class InMemoryCollabStore implements CollabStore {
  private readonly comments = new Map<string, Comment>();
  private readonly mentions = new Map<string, Mention>();
  private readonly approvalRequests = new Map<string, ApprovalRequest>();
  private readonly approvalDecisions = new Map<string, ApprovalDecision>();
  private readonly assignments = new Map<string, Assignment>();
  private readonly reassignmentHistory: ReassignmentHistoryRecord[] = [];

  // -------------------------------------------------------------------------
  // Comments
  // -------------------------------------------------------------------------

  async insertComment(comment: Comment): Promise<void> {
    this.comments.set(comment.id, comment);
  }

  async listCommentsByDeck(
    deckId: string,
    opts?: { threadId?: string; status?: string },
  ): Promise<Comment[]> {
    const results: Comment[] = [];
    for (const c of this.comments.values()) {
      if (c.deckId !== deckId) continue;
      if (opts?.threadId && c.threadId !== opts.threadId) continue;
      if (opts?.status && c.status !== opts.status) continue;
      results.push(c);
    }
    return results;
  }

  async getComment(commentId: string): Promise<Comment | null> {
    return this.comments.get(commentId) ?? null;
  }

  async updateComment(
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
  ): Promise<Comment> {
    const existing = this.comments.get(commentId);
    if (!existing) throw new CommentNotFoundError(commentId);
    const updated: Comment = { ...existing, ...patch };
    this.comments.set(commentId, updated);
    return updated;
  }

  async insertMentions(mentions: Mention[]): Promise<void> {
    for (const m of mentions) {
      this.mentions.set(m.id, m);
    }
  }

  // -------------------------------------------------------------------------
  // Approvals
  // -------------------------------------------------------------------------

  async insertApprovalRequest(request: ApprovalRequest): Promise<void> {
    this.approvalRequests.set(request.id, request);
  }

  async getApprovalRequest(requestId: string): Promise<ApprovalRequest | null> {
    return this.approvalRequests.get(requestId) ?? null;
  }

  async updateApprovalRequest(
    requestId: string,
    patch: Partial<
      Pick<ApprovalRequest, 'status' | 'requestedAt' | 'closedAt' | 'updatedAt' | 'updatedBy'>
    >,
  ): Promise<ApprovalRequest> {
    const existing = this.approvalRequests.get(requestId);
    if (!existing) throw new ApprovalRequestNotFoundError(requestId);
    const updated: ApprovalRequest = { ...existing, ...patch };
    this.approvalRequests.set(requestId, updated);
    return updated;
  }

  async insertApprovalDecision(decision: ApprovalDecision): Promise<void> {
    this.approvalDecisions.set(decision.id, decision);
  }

  async listApprovalDecisions(requestId: string): Promise<ApprovalDecision[]> {
    const results: ApprovalDecision[] = [];
    for (const d of this.approvalDecisions.values()) {
      if (d.requestId === requestId) results.push(d);
    }
    return results;
  }

  async listApprovalRequestsByDeck(
    deckId: string,
    opts?: { status?: string },
  ): Promise<ApprovalRequest[]> {
    const results: ApprovalRequest[] = [];
    for (const r of this.approvalRequests.values()) {
      if (r.deckId !== deckId) continue;
      if (opts?.status && r.status !== opts.status) continue;
      results.push(r);
    }
    return results;
  }

  // -------------------------------------------------------------------------
  // Assignments
  // -------------------------------------------------------------------------

  async insertAssignment(assignment: Assignment): Promise<void> {
    this.assignments.set(assignment.id, assignment);
  }

  async getAssignment(assignmentId: string): Promise<Assignment | null> {
    return this.assignments.get(assignmentId) ?? null;
  }

  async updateAssignment(
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
  ): Promise<Assignment> {
    const existing = this.assignments.get(assignmentId);
    if (!existing) throw new CommentNotFoundError(assignmentId);
    const updated: Assignment = { ...existing, ...patch };
    this.assignments.set(assignmentId, updated);
    return updated;
  }

  async listAssignmentsByUser(userId: string): Promise<Assignment[]> {
    const results: Assignment[] = [];
    for (const a of this.assignments.values()) {
      if (a.primaryId === userId || a.watchers.includes(userId)) {
        results.push(a);
      }
    }
    return results;
  }

  // -------------------------------------------------------------------------
  // Reassignment history
  // -------------------------------------------------------------------------

  async insertReassignmentHistory(record: ReassignmentHistoryRecord): Promise<void> {
    this.reassignmentHistory.push(record);
  }

  // -------------------------------------------------------------------------
  // Test helpers
  // -------------------------------------------------------------------------

  clear(): void {
    this.comments.clear();
    this.mentions.clear();
    this.approvalRequests.clear();
    this.approvalDecisions.clear();
    this.assignments.clear();
    this.reassignmentHistory.length = 0;
  }
}
