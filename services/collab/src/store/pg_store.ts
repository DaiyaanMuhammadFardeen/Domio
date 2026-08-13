/**
 * pg-backed collab store (Phase 18).
 *
 * Full parameterized-SQL implementation of all 14 {@link CollabStore} methods.
 * Accepts a `Pool` (pg's public interface). Every mutating method checks
 * `this.pool != null` upfront and throws {@link StoreNotConfiguredError}.
 *
 * SQL conventions:
 *  - All queries use $N parameterised placeholders (no string interpolation).
 *  - int4range ↔ domain: domain uses inclusive [start, end]; PostgreSQL
 *    int4range is half-open [lo, hi). On write: int4range($start, $end+1).
 *    On read: parse "[lo,hi)" → { start: lo, end: hi-1 }.
 *  - jsonb columns (anchor, emoji_reactions, attachments, policy):
 *    inserted via $N::jsonb, read via JSON.parse(row.col) since node-pg
 *    returns jsonb as a plain object.
 *  - uuid[] columns (watchers): inserted via $N::uuid[], read as string[]
 *    (node-pg returns string[] for uuid[] columns automatically).
 *  - timestamptz ↔ Date: node-pg returns Date for timestamptz; on insert
 *    we pass Date objects directly (pg handles conversion).
 */

import type { Pool as PgPool, PoolClient } from 'pg';
import type { Comment, CommentAnchor, Mention } from '../comments/types.js';
import type { ApprovalRequest, ApprovalDecision } from '../approval/types.js';
import type { Assignment } from '../assignment/types.js';
import type { CollabStore } from './store.js';
import type { ReassignmentHistoryRecord } from './store.js';
import { CommentNotFoundError, ApprovalRequestNotFoundError } from '../types.js';

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export class PgCollabStore implements CollabStore {
  /** Public for test injection. */
  readonly pool: PgPool | null;

  constructor(pool: PgPool | null) {
    this.pool = pool;
  }

  // -------------------------------------------------------------------------
  // Transaction helper
  // -------------------------------------------------------------------------

  /**
   * Execute `fn` inside a BEGIN/COMMIT transaction. On exception the
   * transaction is rolled back. The callback receives a PoolClient that
   * must NOT be released by the caller — this method handles cleanup.
   *
   * Usage (service layer):
   *   await store.withTransaction(async (client) => {
   *     await store.insertComment(comment, client);
   *     await store.insertMentions(mentions, client);
   *   });
   */
  async withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    if (!this.pool) throw new StoreNotConfiguredError('withTransaction');
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // -------------------------------------------------------------------------
  // Comments
  // -------------------------------------------------------------------------

  async insertComment(comment: Comment): Promise<void> {
    if (!this.pool) throw new StoreNotConfiguredError('insertComment');
    await this.pool.query(
      `INSERT INTO comment (
        id, workspace_id, deck_id, thread_id, parent_id,
        author_id, author_type, body_md, target_type, target_id,
        anchor, status, is_orphaned, emoji_reactions, attachments,
        created_at, updated_at, resolved_at, resolved_by
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9, $10,
        $11::jsonb, $12, $13, $14::jsonb, $15::jsonb,
        $16, $17, $18, $19
      )`,
      [
        comment.id,
        comment.workspaceId,
        comment.deckId,
        comment.threadId,
        comment.parentId,
        comment.authorId,
        comment.authorType,
        comment.bodyMd,
        comment.targetType,
        comment.targetId,
        comment.anchor != null ? JSON.stringify(comment.anchor) : null,
        comment.status,
        comment.isOrphaned,
        JSON.stringify(comment.emojiReactions),
        JSON.stringify(comment.attachments),
        comment.createdAt,
        comment.updatedAt,
        comment.resolvedAt,
        comment.resolvedBy,
      ],
    );
  }

  async listCommentsByDeck(
    deckId: string,
    opts?: { threadId?: string; status?: string },
  ): Promise<Comment[]> {
    if (!this.pool) throw new StoreNotConfiguredError('listCommentsByDeck');
    const conditions: string[] = ['deck_id = $1'];
    const params: unknown[] = [deckId];
    let idx = 2;
    if (opts?.threadId) {
      conditions.push(`thread_id = $${idx++}`);
      params.push(opts.threadId);
    }
    if (opts?.status) {
      conditions.push(`status = $${idx++}`);
      params.push(opts.status);
    }
    const sql = `SELECT * FROM comment WHERE ${conditions.join(' AND ')} ORDER BY created_at ASC`;
    const { rows } = await this.pool.query(sql, params);
    return rows.map(commentRowToDomain);
  }

  async getComment(commentId: string): Promise<Comment | null> {
    if (!this.pool) throw new StoreNotConfiguredError('getComment');
    const { rows } = await this.pool.query('SELECT * FROM comment WHERE id = $1', [commentId]);
    if (rows.length === 0) return null;
    return commentRowToDomain(rows[0]!);
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
    if (!this.pool) throw new StoreNotConfiguredError('updateComment');

    const setClauses: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    // Scalar text/enum fields
    const scalarFields: Array<{ key: string; dbCol: string }> = [
      { key: 'bodyMd', dbCol: 'body_md' },
      { key: 'status', dbCol: 'status' },
      { key: 'resolvedBy', dbCol: 'resolved_by' },
      { key: 'isOrphaned', dbCol: 'is_orphaned' },
      { key: 'targetType', dbCol: 'target_type' },
      { key: 'targetId', dbCol: 'target_id' },
    ];
    for (const f of scalarFields) {
      if (f.key in patch) {
        setClauses.push(`${f.dbCol} = $${idx++}`);
        params.push((patch as Record<string, unknown>)[f.key]);
      }
    }

    // Nullable timestamptz fields
    const tsFields: Array<{ key: string; dbCol: string }> = [
      { key: 'resolvedAt', dbCol: 'resolved_at' },
      { key: 'updatedAt', dbCol: 'updated_at' },
    ];
    for (const f of tsFields) {
      if (f.key in patch) {
        setClauses.push(`${f.dbCol} = $${idx++}`);
        params.push((patch as Record<string, unknown>)[f.key]);
      }
    }

    // JSONB fields — anchor, emoji_reactions
    if ('anchor' in patch) {
      setClauses.push(`anchor = $${idx++}::jsonb`);
      params.push(patch.anchor != null ? JSON.stringify(patch.anchor) : null);
    }
    if ('emojiReactions' in patch) {
      setClauses.push(`emoji_reactions = $${idx++}::jsonb`);
      params.push(JSON.stringify(patch.emojiReactions));
    }

    if (setClauses.length === 0) {
      // Nothing to update — just fetch and return
      const existing = await this.getComment(commentId);
      if (!existing) throw new CommentNotFoundError(commentId);
      return existing;
    }

    // Always bump updated_at if the patch didn't already include it
    if (!('updatedAt' in patch)) {
      setClauses.push(`updated_at = $${idx++}`);
      params.push(new Date());
    }

    params.push(commentId);
    const sql = `UPDATE comment SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING *`;
    const { rows } = await this.pool.query(sql, params);
    if (rows.length === 0) throw new CommentNotFoundError(commentId);
    return commentRowToDomain(rows[0]!);
  }

  async insertMentions(mentions: Mention[]): Promise<void> {
    if (!this.pool) throw new StoreNotConfiguredError('insertMentions');
    if (mentions.length === 0) return;

    // Batch insert using a single multi-row INSERT.
    // Build: INSERT INTO mention (id, workspace_id, comment_id, mentioned_id,
    //   mentioned_type, notified_at, read_at, created_at)
    // VALUES ($1..$8), ($9..$16), ...
    const cols = [
      'id',
      'workspace_id',
      'comment_id',
      'mentioned_id',
      'mentioned_type',
      'notified_at',
      'read_at',
      'created_at',
    ];
    const rows: string[] = [];
    const params: unknown[] = [];
    let idx = 1;
    for (const m of mentions) {
      const placeholders = cols.map(() => `$${idx++}`);
      rows.push(`(${placeholders.join(', ')})`);
      params.push(
        m.id,
        m.workspaceId,
        m.commentId,
        m.mentionedId,
        m.mentionedType,
        m.notifiedAt,
        m.readAt,
        m.createdAt,
      );
    }
    const sql = `INSERT INTO mention (${cols.join(', ')}) VALUES ${rows.join(', ')}`;
    await this.pool.query(sql, params);
  }

  // -------------------------------------------------------------------------
  // Approvals
  // -------------------------------------------------------------------------

  async insertApprovalRequest(request: ApprovalRequest): Promise<void> {
    if (!this.pool) throw new StoreNotConfiguredError('insertApprovalRequest');
    await this.pool.query(
      `INSERT INTO approval_request (
        id, workspace_id, deck_id, version_id, requested_by,
        requested_at, policy, status, closed_at,
        created_at, updated_at, created_by, updated_by
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7::jsonb, $8, $9,
        $10, $11, $12, $13
      )`,
      [
        request.id,
        request.workspaceId,
        request.deckId,
        request.versionId,
        request.requestedBy,
        request.requestedAt,
        JSON.stringify(request.policy),
        request.status,
        request.closedAt,
        request.createdAt,
        request.updatedAt,
        request.createdBy,
        request.updatedBy,
      ],
    );
  }

  async getApprovalRequest(requestId: string): Promise<ApprovalRequest | null> {
    if (!this.pool) throw new StoreNotConfiguredError('getApprovalRequest');
    const { rows } = await this.pool.query('SELECT * FROM approval_request WHERE id = $1', [
      requestId,
    ]);
    if (rows.length === 0) return null;
    return approvalRequestRowToDomain(rows[0]!);
  }

  async updateApprovalRequest(
    requestId: string,
    patch: Partial<
      Pick<ApprovalRequest, 'status' | 'requestedAt' | 'closedAt' | 'updatedAt' | 'updatedBy'>
    >,
  ): Promise<ApprovalRequest> {
    if (!this.pool) throw new StoreNotConfiguredError('updateApprovalRequest');

    const setClauses: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    // Scalar text fields
    if ('status' in patch) {
      setClauses.push(`status = $${idx++}`);
      params.push(patch.status);
    }

    // Nullable timestamptz fields
    const tsFields: Array<{ key: string; dbCol: string }> = [
      { key: 'requestedAt', dbCol: 'requested_at' },
      { key: 'closedAt', dbCol: 'closed_at' },
      { key: 'updatedAt', dbCol: 'updated_at' },
    ];
    for (const f of tsFields) {
      if (f.key in patch) {
        setClauses.push(`${f.dbCol} = $${idx++}`);
        params.push((patch as Record<string, unknown>)[f.key]);
      }
    }

    // Nullable uuid field
    if ('updatedBy' in patch) {
      setClauses.push(`updated_by = $${idx++}`);
      params.push(patch.updatedBy);
    }

    if (setClauses.length === 0) {
      const existing = await this.getApprovalRequest(requestId);
      if (!existing) throw new ApprovalRequestNotFoundError(requestId);
      return existing;
    }

    if (!('updatedAt' in patch)) {
      setClauses.push(`updated_at = $${idx++}`);
      params.push(new Date());
    }

    params.push(requestId);
    const sql = `UPDATE approval_request SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING *`;
    const { rows } = await this.pool.query(sql, params);
    if (rows.length === 0) throw new ApprovalRequestNotFoundError(requestId);
    return approvalRequestRowToDomain(rows[0]!);
  }

  async insertApprovalDecision(decision: ApprovalDecision): Promise<void> {
    if (!this.pool) throw new StoreNotConfiguredError('insertApprovalDecision');
    await this.pool.query(
      `INSERT INTO approval_decision (
        id, workspace_id, request_id, lane, approver_id,
        decision, justification, decided_at, version_id,
        created_at, updated_at, created_by, updated_by
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9,
        $10, $11, $12, $13
      )`,
      [
        decision.id,
        decision.workspaceId,
        decision.requestId,
        decision.lane,
        decision.approverId,
        decision.decision,
        decision.justification,
        decision.decidedAt,
        decision.versionId,
        new Date(), // created_at
        new Date(), // updated_at
        decision.approverId, // created_by = approver
        null, // updated_by
      ],
    );
  }

  async listApprovalDecisions(requestId: string): Promise<ApprovalDecision[]> {
    if (!this.pool) throw new StoreNotConfiguredError('listApprovalDecisions');
    const { rows } = await this.pool.query(
      'SELECT * FROM approval_decision WHERE request_id = $1 ORDER BY decided_at ASC',
      [requestId],
    );
    return rows.map(approvalDecisionRowToDomain);
  }

  async listApprovalRequestsByDeck(
    deckId: string,
    opts?: { status?: string },
  ): Promise<ApprovalRequest[]> {
    if (!this.pool) throw new StoreNotConfiguredError('listApprovalRequestsByDeck');
    const conditions: string[] = ['deck_id = $1'];
    const params: unknown[] = [deckId];
    let idx = 2;
    if (opts?.status) {
      conditions.push(`status = $${idx++}`);
      params.push(opts.status);
    }
    const sql = `SELECT * FROM approval_request WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC`;
    const { rows } = await this.pool.query(sql, params);
    return rows.map(approvalRequestRowToDomain);
  }

  // -------------------------------------------------------------------------
  // Assignments
  // -------------------------------------------------------------------------

  async insertAssignment(assignment: Assignment): Promise<void> {
    if (!this.pool) throw new StoreNotConfiguredError('insertAssignment');
    // Domain uses inclusive [start, end]; int4range is half-open [lo, hi).
    // Store as int4range(start, end + 1) so that reading back gives the
    // correct inclusive range.
    const rangeLo = assignment.slideRange.start;
    const rangeHi = assignment.slideRange.end + 1;
    await this.pool.query(
      `INSERT INTO assignment (
        id, workspace_id, deck_id, slide_range, primary_id,
        watchers, status, blocked_reason, due_at,
        created_by, created_at, updated_at, completed_at, task_link_id
      ) VALUES (
        $1, $2, $3, int4range($4, $5), $6,
        $7::uuid[], $8, $9, $10,
        $11, $12, $13, $14, $15
      )`,
      [
        assignment.id,
        assignment.workspaceId,
        assignment.deckId,
        rangeLo,
        rangeHi,
        assignment.primaryId,
        assignment.watchers,
        assignment.status,
        assignment.blockedReason,
        assignment.dueAt,
        assignment.createdBy,
        assignment.createdAt,
        assignment.updatedAt,
        assignment.completedAt,
        assignment.taskLinkId,
      ],
    );
  }

  async getAssignment(assignmentId: string): Promise<Assignment | null> {
    if (!this.pool) throw new StoreNotConfiguredError('getAssignment');
    const { rows } = await this.pool.query('SELECT * FROM assignment WHERE id = $1', [
      assignmentId,
    ]);
    if (rows.length === 0) return null;
    return assignmentRowToDomain(rows[0]!);
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
    if (!this.pool) throw new StoreNotConfiguredError('updateAssignment');

    const setClauses: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    // Scalar text fields
    if ('status' in patch) {
      setClauses.push(`status = $${idx++}`);
      params.push(patch.status);
    }
    if ('blockedReason' in patch) {
      setClauses.push(`blocked_reason = $${idx++}`);
      params.push(patch.blockedReason);
    }
    if ('primaryId' in patch) {
      setClauses.push(`primary_id = $${idx++}`);
      params.push(patch.primaryId);
    }

    // Nullable timestamptz fields
    const tsFields: Array<{ key: string; dbCol: string }> = [
      { key: 'dueAt', dbCol: 'due_at' },
      { key: 'completedAt', dbCol: 'completed_at' },
      { key: 'updatedAt', dbCol: 'updated_at' },
    ];
    for (const f of tsFields) {
      if (f.key in patch) {
        setClauses.push(`${f.dbCol} = $${idx++}`);
        params.push((patch as Record<string, unknown>)[f.key]);
      }
    }

    // uuid[] field
    if ('watchers' in patch) {
      setClauses.push(`watchers = $${idx++}::uuid[]`);
      params.push([...patch.watchers!]);
    }

    if (setClauses.length === 0) {
      const existing = await this.getAssignment(assignmentId);
      if (!existing) throw new CommentNotFoundError(assignmentId);
      return existing;
    }

    if (!('updatedAt' in patch)) {
      setClauses.push(`updated_at = $${idx++}`);
      params.push(new Date());
    }

    params.push(assignmentId);
    const sql = `UPDATE assignment SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING *`;
    const { rows } = await this.pool.query(sql, params);
    if (rows.length === 0) throw new CommentNotFoundError(assignmentId);
    return assignmentRowToDomain(rows[0]!);
  }

  async listAssignmentsByUser(userId: string): Promise<Assignment[]> {
    if (!this.pool) throw new StoreNotConfiguredError('listAssignmentsByUser');
    // Query assignments where the user is the primary assignee OR is in the
    // watchers uuid[] array. Uses $1 = ANY(watchers) for array membership.
    const { rows } = await this.pool.query(
      `SELECT * FROM assignment
       WHERE primary_id = $1 OR $1::uuid = ANY(watchers)
       ORDER BY created_at DESC`,
      [userId],
    );
    return rows.map(assignmentRowToDomain);
  }

  // -------------------------------------------------------------------------
  // Reassignment history
  // -------------------------------------------------------------------------

  async insertReassignmentHistory(record: ReassignmentHistoryRecord): Promise<void> {
    if (!this.pool) throw new StoreNotConfiguredError('insertReassignmentHistory');
    await this.pool.query(
      `INSERT INTO reassignment_history (
        id, workspace_id, assignment_id, old_primary_id,
        new_primary_id, actor_id, reason, changed_at
      ) VALUES (
        $1, $2, $3, $4,
        $5, $6, $7, $8
      )`,
      [
        record.id,
        record.workspace_id,
        record.assignment_id,
        record.old_primary_id,
        record.new_primary_id,
        record.actor_id,
        record.reason,
        record.changed_at,
      ],
    );
  }
}

// ---------------------------------------------------------------------------
// Row → domain mappers
// ---------------------------------------------------------------------------

/**
 * Parse a PostgreSQL int4range string like `[1,6)` into an inclusive
 * { start, end } object. PostgreSQL int4range is half-open [lo, hi),
 * so the inclusive end is hi - 1.
 *
 * Handles:
 *   [1,6)  → { start: 1, end: 5 }
 *   [1,2)  → { start: 1, end: 1 }
 *   empty  → { start: 0, end: 0 }  (should not occur per DDL)
 */
function parseInt4Range(raw: string): { start: number; end: number } {
  // node-pg may return the range as a string "[1,6)" or as an object
  // { type: 'range', value: ... }. Handle both.
  const s = typeof raw === 'string' ? raw : String(raw);
  const m = s.match(/^\[(\d+),(\d+)\)$/);
  if (!m) {
    // Fallback for empty or unexpected ranges
    return { start: 0, end: 0 };
  }
  const lo = parseInt(m[1]!, 10);
  const hi = parseInt(m[2]!, 10);
  // half-open [lo, hi) → inclusive [lo, hi-1]
  return { start: lo, end: hi - 1 };
}

function commentRowToDomain(row: Record<string, unknown>): Comment {
  return {
    id: row.id as string,
    workspaceId: row.workspace_id as string,
    deckId: row.deck_id as string,
    threadId: row.thread_id as string,
    parentId: row.parent_id as string | null,
    authorId: row.author_id as string,
    authorType: row.author_type as Comment['authorType'],
    bodyMd: row.body_md as string,
    targetType: row.target_type as Comment['targetType'],
    targetId: row.target_id as string,
    anchor: row.anchor != null ? (parseJsonb(row.anchor) as CommentAnchor) : null,
    status: row.status as Comment['status'],
    isOrphaned: row.is_orphaned as boolean,
    emojiReactions:
      row.emoji_reactions != null
        ? (parseJsonb(row.emoji_reactions) as Record<string, readonly string[]>)
        : {},
    attachments:
      row.attachments != null
        ? (parseJsonb(row.attachments) as readonly Record<string, unknown>[])
        : [],
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at),
    resolvedAt: row.resolved_at != null ? toDate(row.resolved_at) : null,
    resolvedBy: row.resolved_by as string | null,
  };
}

function approvalRequestRowToDomain(row: Record<string, unknown>): ApprovalRequest {
  return {
    id: row.id as string,
    workspaceId: row.workspace_id as string,
    deckId: row.deck_id as string,
    versionId: row.version_id as string,
    requestedBy: row.requested_by as string,
    requestedAt: row.requested_at != null ? toDate(row.requested_at) : null,
    policy: parseJsonb(row.policy) as ApprovalRequest['policy'],
    status: row.status as ApprovalRequest['status'],
    closedAt: row.closed_at != null ? toDate(row.closed_at) : null,
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at),
    createdBy: row.created_by as string,
    updatedBy: row.updated_by as string | null,
  };
}

function approvalDecisionRowToDomain(row: Record<string, unknown>): ApprovalDecision {
  return {
    id: row.id as string,
    workspaceId: row.workspace_id as string,
    requestId: row.request_id as string,
    lane: row.lane as string,
    approverId: row.approver_id as string,
    decision: row.decision as ApprovalDecision['decision'],
    justification: row.justification as string | null,
    decidedAt: toDate(row.decided_at),
    versionId: row.version_id as string,
  };
}

function assignmentRowToDomain(row: Record<string, unknown>): Assignment {
  return {
    id: row.id as string,
    workspaceId: row.workspace_id as string,
    deckId: row.deck_id as string,
    slideRange: parseInt4Range(row.slide_range as string),
    primaryId: row.primary_id as string,
    // node-pg returns uuid[] as string[]
    watchers: (row.watchers as string[]) ?? [],
    status: row.status as Assignment['status'],
    blockedReason: row.blocked_reason as string | null,
    dueAt: row.due_at != null ? toDate(row.due_at) : null,
    createdBy: row.created_by as string,
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at),
    completedAt: row.completed_at != null ? toDate(row.completed_at) : null,
    taskLinkId: row.task_link_id as string | null,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parse a jsonb value that may already be an object (from node-pg) or a string. */
function parseJsonb(val: unknown): unknown {
  if (val == null) return null;
  if (typeof val === 'string') return JSON.parse(val);
  // node-pg already deserializes jsonb into a JS object
  return val;
}

/** Convert a timestamptz value (Date from pg, or string) to a Date. */
function toDate(val: unknown): Date {
  if (val instanceof Date) return val;
  if (typeof val === 'string') return new Date(val);
  return new Date(val as number);
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class StoreNotConfiguredError extends Error {
  readonly code = 'STORE_NOT_CONFIGURED' as const;
  constructor(public readonly op: string) {
    super(`pg store has no pool configured (op=${op})`);
    this.name = 'StoreNotConfiguredError';
  }
}

export class StoreNotImplementedError extends Error {
  readonly code = 'STORE_NOT_IMPLEMENTED' as const;
  constructor(
    public readonly op: string,
    public readonly args: Record<string, unknown>,
  ) {
    super(`pg store op ${op} not yet implemented; args=${JSON.stringify(args)}`);
    this.name = 'StoreNotImplementedError';
  }
}

/** Nil-guard for a possibly-undefined pg store. */
export function isPgStore(s: PgCollabStore | null | undefined): s is PgCollabStore {
  return s !== null && s !== undefined;
}
