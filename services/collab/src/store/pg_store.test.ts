/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * PgCollabStore unit tests with fake pool (Phase 18).
 *
 * Tests verify:
 *  - Correct SQL generation (parameterized, no injection)
 *  - int4range ↔ domain round-trip
 *  - jsonb ↔ domain round-trip
 *  - uuid[] ↔ string[] round-trip
 *  - Dynamic SET clause construction for partial updates
 *  - Error paths (not-found → CommentNotFoundError, etc.)
 *  - withTransaction BEGIN/COMMIT/ROLLBACK lifecycle
 *
 * NO live DB required — all assertions use a fake Pool mock.
 */

import { describe, it, expect, vi } from 'vitest';
import { PgCollabStore, StoreNotConfiguredError } from './pg_store.js';
import { CommentNotFoundError, ApprovalRequestNotFoundError } from '../types.js';
import type { Comment } from '../comments/types.js';
import type { Mention } from '../comments/types.js';
import type { ApprovalRequest, ApprovalDecision } from '../approval/types.js';
import type { Assignment } from '../assignment/types.js';

// ---------------------------------------------------------------------------
// Fake pool factory
// ---------------------------------------------------------------------------

interface FakeQueryResult {
  rows: Record<string, unknown>[];
  rowCount: number;
}

type QueryHandler = (sql: string, params?: unknown[]) => FakeQueryResult;

function createFakePool(queryHandler: QueryHandler) {
  return {
    query: vi.fn(queryHandler),
    connect: vi.fn(),
    end: vi.fn(),
  };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeComment(overrides?: Partial<Comment>): Comment {
  return {
    id: 'c-001',
    workspaceId: 'ws-001',
    deckId: 'deck-001',
    threadId: 'thread-001',
    parentId: null,
    authorId: 'user-001',
    authorType: 'member',
    bodyMd: 'Hello world',
    targetType: 'element',
    targetId: 'el-001',
    anchor: { element: { x: 0.5, y: 0.3 }, slide: { x: 100, y: 200 } },
    status: 'open',
    isOrphaned: false,
    emojiReactions: { '👍': ['user-001', 'user-002'] },
    attachments: [{ name: 'image.png', url: 'https://example.com/img.png' }],
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    resolvedAt: null,
    resolvedBy: null,
    ...overrides,
  };
}

function makeMention(overrides?: Partial<Mention>): Mention {
  return {
    id: 'm-001',
    workspaceId: 'ws-001',
    commentId: 'c-001',
    mentionedId: 'user-002',
    mentionedType: 'user',
    notifiedAt: null,
    readAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function makeApprovalRequest(overrides?: Partial<ApprovalRequest>): ApprovalRequest {
  return {
    id: 'ar-001',
    workspaceId: 'ws-001',
    deckId: 'deck-001',
    versionId: 'ver-001',
    requestedBy: 'user-001',
    requestedAt: new Date('2026-01-01T00:00:00Z'),
    policy: { lanes: [{ lane: 'legal', role: 'legal', required: true, slaHours: 24 }] },
    status: 'pending',
    closedAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    createdBy: 'user-001',
    updatedBy: null,
    ...overrides,
  };
}

function makeApprovalDecision(overrides?: Partial<ApprovalDecision>): ApprovalDecision {
  return {
    id: 'ad-001',
    workspaceId: 'ws-001',
    requestId: 'ar-001',
    lane: 'legal',
    approverId: 'user-002',
    decision: 'approved',
    justification: 'Looks good',
    decidedAt: new Date('2026-01-02T00:00:00Z'),
    versionId: 'ver-001',
    ...overrides,
  };
}

function makeAssignment(overrides?: Partial<Assignment>): Assignment {
  return {
    id: 'as-001',
    workspaceId: 'ws-001',
    deckId: 'deck-001',
    slideRange: { start: 3, end: 7 },
    primaryId: 'user-001',
    watchers: ['user-002', 'user-003'],
    status: 'in_progress',
    blockedReason: null,
    dueAt: new Date('2026-02-01T00:00:00Z'),
    createdBy: 'user-001',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    completedAt: null,
    taskLinkId: null,
    ...overrides,
  };
}

/** Build a fake row object that looks like what node-pg returns from a SELECT. */
function commentToRow(c: Comment): Record<string, unknown> {
  return {
    id: c.id,
    workspace_id: c.workspaceId,
    deck_id: c.deckId,
    thread_id: c.threadId,
    parent_id: c.parentId,
    author_id: c.authorId,
    author_type: c.authorType,
    body_md: c.bodyMd,
    target_type: c.targetType,
    target_id: c.targetId,
    anchor: c.anchor, // node-pg returns parsed jsonb
    status: c.status,
    is_orphaned: c.isOrphaned,
    emoji_reactions: c.emojiReactions,
    attachments: c.attachments,
    created_at: c.createdAt,
    updated_at: c.updatedAt,
    resolved_at: c.resolvedAt,
    resolved_by: c.resolvedBy,
  };
}

function approvalRequestToRow(r: ApprovalRequest): Record<string, unknown> {
  return {
    id: r.id,
    workspace_id: r.workspaceId,
    deck_id: r.deckId,
    version_id: r.versionId,
    requested_by: r.requestedBy,
    requested_at: r.requestedAt,
    policy: r.policy,
    status: r.status,
    closed_at: r.closedAt,
    created_at: r.createdAt,
    updated_at: r.updatedAt,
    created_by: r.createdBy,
    updated_by: r.updatedBy,
  };
}

function approvalDecisionToRow(d: ApprovalDecision): Record<string, unknown> {
  return {
    id: d.id,
    workspace_id: d.workspaceId,
    request_id: d.requestId,
    lane: d.lane,
    approver_id: d.approverId,
    decision: d.decision,
    justification: d.justification,
    decided_at: d.decidedAt,
    version_id: d.versionId,
    created_at: new Date(),
    updated_at: new Date(),
    created_by: d.approverId,
    updated_by: null,
  };
}

function assignmentToRow(a: Assignment): Record<string, unknown> {
  // Simulate PostgreSQL int4range output format [lo, hi)
  const rangeLo = a.slideRange.start;
  const rangeHi = a.slideRange.end + 1;
  return {
    id: a.id,
    workspace_id: a.workspaceId,
    deck_id: a.deckId,
    slide_range: `[${rangeLo},${rangeHi})`,
    primary_id: a.primaryId,
    watchers: [...a.watchers],
    status: a.status,
    blocked_reason: a.blockedReason,
    due_at: a.dueAt,
    created_by: a.createdBy,
    created_at: a.createdAt,
    updated_at: a.updatedAt,
    completed_at: a.completedAt,
    task_link_id: a.taskLinkId,
  };
}

// ---------------------------------------------------------------------------
// StoreNotConfiguredError (nil pool)
// ---------------------------------------------------------------------------

describe('PgCollabStore — nil pool', () => {
  it('throws StoreNotConfiguredError for every method', async () => {
    const store = new PgCollabStore(null);
    const comment = makeComment();
    const mention = makeMention();
    const request = makeApprovalRequest();
    const decision = makeApprovalDecision();
    const assignment = makeAssignment();

    await expect(store.insertComment(comment)).rejects.toThrow(StoreNotConfiguredError);
    await expect(store.listCommentsByDeck('d')).rejects.toThrow(StoreNotConfiguredError);
    await expect(store.getComment('c')).rejects.toThrow(StoreNotConfiguredError);
    await expect(store.updateComment('c', {})).rejects.toThrow(StoreNotConfiguredError);
    await expect(store.insertMentions([mention])).rejects.toThrow(StoreNotConfiguredError);
    await expect(store.insertApprovalRequest(request)).rejects.toThrow(StoreNotConfiguredError);
    await expect(store.getApprovalRequest('r')).rejects.toThrow(StoreNotConfiguredError);
    await expect(store.updateApprovalRequest('r', {})).rejects.toThrow(StoreNotConfiguredError);
    await expect(store.insertApprovalDecision(decision)).rejects.toThrow(StoreNotConfiguredError);
    await expect(store.listApprovalDecisions('r')).rejects.toThrow(StoreNotConfiguredError);
    await expect(store.listApprovalRequestsByDeck('d')).rejects.toThrow(StoreNotConfiguredError);
    await expect(store.insertAssignment(assignment)).rejects.toThrow(StoreNotConfiguredError);
    await expect(store.getAssignment('a')).rejects.toThrow(StoreNotConfiguredError);
    await expect(store.updateAssignment('a', {})).rejects.toThrow(StoreNotConfiguredError);
    await expect(store.listAssignmentsByUser('u')).rejects.toThrow(StoreNotConfiguredError);
    await expect(store.withTransaction(async () => {})).rejects.toThrow(StoreNotConfiguredError);
  });
});

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------

describe('PgCollabStore — insertComment', () => {
  it('issues INSERT with correct parameterized SQL', async () => {
    const captured: { sql: string; params: unknown[] }[] = [];
    const pool = createFakePool((sql, params) => {
      captured.push({ sql, params: params ?? [] });
      return { rows: [], rowCount: 1 };
    });
    const store = new PgCollabStore(pool as any);
    const comment = makeComment();

    await store.insertComment(comment);

    expect(captured).toHaveLength(1);
    const q = captured[0]!;
    expect(q.sql).toContain('INSERT INTO comment');
    expect(q.sql).toContain('$11::jsonb'); // anchor
    expect(q.sql).toContain('$14::jsonb'); // emoji_reactions
    expect(q.sql).toContain('$15::jsonb'); // attachments
    // Verify parameter values
    expect(q.params[0]).toBe('c-001');
    expect(q.params[6]).toBe('member');
    expect(q.params[12]).toBe(false); // is_orphaned
    expect(typeof q.params[13]).toBe('string'); // emoji_reactions JSON string
    expect(JSON.parse(q.params[13] as string)).toEqual({ '👍': ['user-001', 'user-002'] });
  });
});

describe('PgCollabStore — listCommentsByDeck', () => {
  it('issues SELECT with deck_id filter and optional threadId/status', async () => {
    const captured: { sql: string; params: unknown[] }[] = [];
    const comment = makeComment();
    const pool = createFakePool((sql, params) => {
      captured.push({ sql, params: params ?? [] });
      return { rows: [commentToRow(comment)], rowCount: 1 };
    });
    const store = new PgCollabStore(pool as any);

    // Without opts
    const result1 = await store.listCommentsByDeck('deck-001');
    expect(result1).toHaveLength(1);
    expect(captured[0]!.sql).toContain('WHERE deck_id = $1');
    expect(captured[0]!.params).toEqual(['deck-001']);

    // With threadId
    captured.length = 0;
    const result2 = await store.listCommentsByDeck('deck-001', { threadId: 't-1' });
    expect(result2).toHaveLength(1);
    expect(captured[0]!.sql).toContain('thread_id = $2');
    expect(captured[0]!.params).toEqual(['deck-001', 't-1']);

    // With status
    captured.length = 0;
    const result3 = await store.listCommentsByDeck('deck-001', { status: 'resolved' });
    expect(result3).toHaveLength(1);
    expect(captured[0]!.sql).toContain('status = $2');
    expect(captured[0]!.params).toEqual(['deck-001', 'resolved']);
  });
});

describe('PgCollabStore — getComment', () => {
  it('returns null when not found', async () => {
    const pool = createFakePool(() => ({ rows: [], rowCount: 0 }));
    const store = new PgCollabStore(pool as any);
    const result = await store.getComment('nonexistent');
    expect(result).toBeNull();
  });

  it('returns domain comment when found', async () => {
    const comment = makeComment();
    const pool = createFakePool(() => ({ rows: [commentToRow(comment)], rowCount: 1 }));
    const store = new PgCollabStore(pool as any);
    const result = await store.getComment('c-001');
    expect(result).not.toBeNull();
    expect(result!.id).toBe('c-001');
    expect(result!.anchor).toEqual({ element: { x: 0.5, y: 0.3 }, slide: { x: 100, y: 200 } });
    expect(result!.emojiReactions).toEqual({ '👍': ['user-001', 'user-002'] });
  });
});

describe('PgCollabStore — updateComment', () => {
  it('builds dynamic SET clause for scalar fields', async () => {
    const comment = makeComment();
    const updated = { ...comment, bodyMd: 'Updated body', updatedAt: new Date() };
    const captured: { sql: string; params: unknown[] }[] = [];
    const pool = createFakePool((sql, params) => {
      captured.push({ sql, params: params ?? [] });
      return { rows: [commentToRow(updated)], rowCount: 1 };
    });
    const store = new PgCollabStore(pool as any);

    await store.updateComment('c-001', { bodyMd: 'Updated body' });

    const q = captured[0]!;
    expect(q.sql).toContain('UPDATE comment SET');
    expect(q.sql).toContain('body_md = $1');
    // Should auto-add updated_at since not in patch
    expect(q.sql).toContain('updated_at = $2');
    expect(q.params[0]).toBe('Updated body');
    expect(q.params[q.params.length - 1]).toBe('c-001'); // WHERE id = $N
  });

  it('handles jsonb anchor update', async () => {
    const comment = makeComment();
    const newAnchor = { element: { x: 0.2, y: 0.8 }, slide: { x: 50, y: 60 } };
    const updated = { ...comment, anchor: newAnchor, updatedAt: new Date() };
    const captured: { sql: string; params: unknown[] }[] = [];
    const pool = createFakePool((sql, params) => {
      captured.push({ sql, params: params ?? [] });
      return { rows: [commentToRow(updated)], rowCount: 1 };
    });
    const store = new PgCollabStore(pool as any);

    await store.updateComment('c-001', { anchor: newAnchor });

    const q = captured[0]!;
    expect(q.sql).toContain('anchor = $1::jsonb');
    expect(JSON.parse(q.params[0] as string)).toEqual(newAnchor);
  });

  it('handles emojiReactions update', async () => {
    const comment = makeComment();
    const newReactions = { '🎉': ['user-003'] };
    const updated = { ...comment, emojiReactions: newReactions, updatedAt: new Date() };
    const captured: { sql: string; params: unknown[] }[] = [];
    const pool = createFakePool((sql, params) => {
      captured.push({ sql, params: params ?? [] });
      return { rows: [commentToRow(updated)], rowCount: 1 };
    });
    const store = new PgCollabStore(pool as any);

    await store.updateComment('c-001', { emojiReactions: newReactions });

    const q = captured[0]!;
    expect(q.sql).toContain('emoji_reactions = $1::jsonb');
    expect(JSON.parse(q.params[0] as string)).toEqual(newReactions);
  });

  it('allows setting nullable timestamp to null', async () => {
    const comment = makeComment({ resolvedAt: new Date(), resolvedBy: 'user-001' });
    const updated = { ...comment, resolvedAt: null, resolvedBy: null, updatedAt: new Date() };
    const captured: { sql: string; params: unknown[] }[] = [];
    const pool = createFakePool((sql, params) => {
      captured.push({ sql, params: params ?? [] });
      return { rows: [commentToRow(updated)], rowCount: 1 };
    });
    const store = new PgCollabStore(pool as any);

    await store.updateComment('c-001', { resolvedAt: null, resolvedBy: null });

    const q = captured[0]!;
    expect(q.sql).toContain('resolved_at =');
    expect(q.sql).toContain('resolved_by =');
    // resolved_by is a scalar field so it comes first, resolved_at is a ts field
    const resolvedByIdx = q.sql.indexOf('resolved_by =');
    const resolvedAtIdx = q.sql.indexOf('resolved_at =');
    expect(resolvedByIdx).toBeLessThan(resolvedAtIdx);
    // The params at those positions should be null
    // resolved_by is at $1, resolved_at is at $2, updated_at at $3
    expect(q.params[0]).toBeNull();
    expect(q.params[1]).toBeNull();
  });

  it('throws CommentNotFoundError when not found', async () => {
    const pool = createFakePool(() => ({ rows: [], rowCount: 0 }));
    const store = new PgCollabStore(pool as any);
    await expect(store.updateComment('nonexistent', { bodyMd: 'x' })).rejects.toThrow(
      CommentNotFoundError,
    );
  });

  it('skips update when patch is empty and returns existing', async () => {
    const comment = makeComment();
    let queryCount = 0;
    const pool = createFakePool(() => {
      queryCount++;
      return { rows: [commentToRow(comment)], rowCount: 1 };
    });
    const store = new PgCollabStore(pool as any);
    const result = await store.updateComment('c-001', {});
    expect(result.id).toBe('c-001');
    // Only one query (the SELECT fallback), no UPDATE issued
    expect(queryCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Mentions
// ---------------------------------------------------------------------------

describe('PgCollabStore — insertMentions', () => {
  it('issues multi-row INSERT for batch', async () => {
    const mentions = [
      makeMention({ id: 'm-1', mentionedId: 'u-1' }),
      makeMention({ id: 'm-2', mentionedId: 'u-2', mentionedType: 'role' }),
    ];
    const captured: { sql: string; params: unknown[] }[] = [];
    const pool = createFakePool((sql, params) => {
      captured.push({ sql, params: params ?? [] });
      return { rows: [], rowCount: 2 };
    });
    const store = new PgCollabStore(pool as any);

    await store.insertMentions(mentions);

    const q = captured[0]!;
    expect(q.sql).toContain('INSERT INTO mention');
    expect(q.sql).toContain('($1, $2, $3, $4, $5, $6, $7, $8)');
    expect(q.sql).toContain('($9, $10, $11, $12, $13, $14, $15, $16)');
    expect(q.params).toHaveLength(16);
    expect(q.params[0]).toBe('m-1');
    expect(q.params[3]).toBe('u-1');
    expect(q.params[8]).toBe('m-2');
    expect(q.params[11]).toBe('u-2');
  });

  it('skips query for empty array', async () => {
    let queried = false;
    const pool = createFakePool(() => {
      queried = true;
      return { rows: [], rowCount: 0 };
    });
    const store = new PgCollabStore(pool as any);
    await store.insertMentions([]);
    expect(queried).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Approvals
// ---------------------------------------------------------------------------

describe('PgCollabStore — insertApprovalRequest', () => {
  it('issues INSERT with policy as jsonb', async () => {
    const request = makeApprovalRequest();
    const captured: { sql: string; params: unknown[] }[] = [];
    const pool = createFakePool((sql, params) => {
      captured.push({ sql, params: params ?? [] });
      return { rows: [], rowCount: 1 };
    });
    const store = new PgCollabStore(pool as any);

    await store.insertApprovalRequest(request);

    const q = captured[0]!;
    expect(q.sql).toContain('INSERT INTO approval_request');
    // params layout: $1=id, $2=workspaceId, $3=deckId, $4=versionId, $5=requestedBy,
    // $6=requestedAt, $7=policy(JSON stringified), $8=status, ...
    expect(q.sql).toContain('$7::jsonb'); // policy at param index 7 (1-based)
    expect(typeof q.params[6]).toBe('string'); // policy is stringified at 0-based index 6
    expect(JSON.parse(q.params[6] as string)).toEqual(request.policy);
    expect(q.params[7]).toBe('pending'); // status at 0-based index 7
  });
});

describe('PgCollabStore — getApprovalRequest', () => {
  it('returns null when not found', async () => {
    const pool = createFakePool(() => ({ rows: [], rowCount: 0 }));
    const store = new PgCollabStore(pool as any);
    expect(await store.getApprovalRequest('nonexistent')).toBeNull();
  });

  it('returns domain request with parsed policy', async () => {
    const request = makeApprovalRequest();
    const pool = createFakePool(() => ({ rows: [approvalRequestToRow(request)], rowCount: 1 }));
    const store = new PgCollabStore(pool as any);
    const result = await store.getApprovalRequest('ar-001');
    expect(result).not.toBeNull();
    expect(result!.policy.lanes).toHaveLength(1);
    expect(result!.policy.lanes[0]!.lane).toBe('legal');
  });
});

describe('PgCollabStore — updateApprovalRequest', () => {
  it('builds dynamic SET clause', async () => {
    const request = makeApprovalRequest();
    const updated = {
      ...request,
      status: 'approved' as const,
      closedAt: new Date(),
      updatedAt: new Date(),
    };
    const captured: { sql: string; params: unknown[] }[] = [];
    const pool = createFakePool((sql, params) => {
      captured.push({ sql, params: params ?? [] });
      return { rows: [approvalRequestToRow(updated)], rowCount: 1 };
    });
    const store = new PgCollabStore(pool as any);

    await store.updateApprovalRequest('ar-001', { status: 'approved', closedAt: new Date() });

    const q = captured[0]!;
    expect(q.sql).toContain('UPDATE approval_request SET');
    expect(q.sql).toContain('status = $1');
    expect(q.sql).toContain('closed_at = $2');
    // updated_at should be auto-added
    expect(q.sql).toContain('updated_at = $3');
    expect(q.params[q.params.length - 1]).toBe('ar-001');
  });

  it('throws ApprovalRequestNotFoundError when not found', async () => {
    const pool = createFakePool(() => ({ rows: [], rowCount: 0 }));
    const store = new PgCollabStore(pool as any);
    await expect(store.updateApprovalRequest('x', { status: 'approved' })).rejects.toThrow(
      ApprovalRequestNotFoundError,
    );
  });
});

describe('PgCollabStore — insertApprovalDecision', () => {
  it('issues INSERT with correct columns', async () => {
    const decision = makeApprovalDecision();
    const captured: { sql: string; params: unknown[] }[] = [];
    const pool = createFakePool((sql, params) => {
      captured.push({ sql, params: params ?? [] });
      return { rows: [], rowCount: 1 };
    });
    const store = new PgCollabStore(pool as any);

    await store.insertApprovalDecision(decision);

    const q = captured[0]!;
    expect(q.sql).toContain('INSERT INTO approval_decision');
    expect(q.params[0]).toBe('ad-001');
    expect(q.params[4]).toBe('user-002'); // approver_id
    expect(q.params[5]).toBe('approved'); // decision
    expect(q.params[6]).toBe('Looks good'); // justification
  });
});

describe('PgCollabStore — listApprovalDecisions', () => {
  it('filters by request_id and orders by decided_at', async () => {
    const d1 = makeApprovalDecision({ id: 'ad-1', decidedAt: new Date('2026-01-01') });
    const d2 = makeApprovalDecision({ id: 'ad-2', decidedAt: new Date('2026-01-02') });
    const pool = createFakePool(() => ({
      rows: [approvalDecisionToRow(d1), approvalDecisionToRow(d2)],
      rowCount: 2,
    }));
    const store = new PgCollabStore(pool as any);
    const results = await store.listApprovalDecisions('ar-001');
    expect(results).toHaveLength(2);
    expect(results[0]!.id).toBe('ad-1');
    expect(results[1]!.id).toBe('ad-2');
  });
});

describe('PgCollabStore — listApprovalRequestsByDeck', () => {
  it('filters by deck_id with optional status', async () => {
    const captured: { sql: string; params: unknown[] }[] = [];
    const pool = createFakePool((sql, params) => {
      captured.push({ sql, params: params ?? [] });
      return { rows: [], rowCount: 0 };
    });
    const store = new PgCollabStore(pool as any);

    await store.listApprovalRequestsByDeck('deck-001', { status: 'pending' });

    const q = captured[0]!;
    expect(q.sql).toContain('WHERE deck_id = $1');
    expect(q.sql).toContain('status = $2');
    expect(q.params).toEqual(['deck-001', 'pending']);
  });
});

// ---------------------------------------------------------------------------
// Assignments — int4range handling
// ---------------------------------------------------------------------------

describe('PgCollabStore — insertAssignment', () => {
  it('converts inclusive [start,end] to int4range [lo,hi)', async () => {
    const assignment = makeAssignment({ slideRange: { start: 3, end: 7 } });
    const captured: { sql: string; params: unknown[] }[] = [];
    const pool = createFakePool((sql, params) => {
      captured.push({ sql, params: params ?? [] });
      return { rows: [], rowCount: 1 };
    });
    const store = new PgCollabStore(pool as any);

    await store.insertAssignment(assignment);

    const q = captured[0]!;
    expect(q.sql).toContain('int4range($4, $5)');
    expect(q.params[3]).toBe(3); // start
    expect(q.params[4]).toBe(8); // end + 1 = 7 + 1
    // watchers as uuid[]
    expect(q.sql).toContain('$7::uuid[]');
    expect(q.params[6]).toEqual(['user-002', 'user-003']);
  });

  it('handles single-slide range [5,5] → int4range(5,6)', async () => {
    const assignment = makeAssignment({ slideRange: { start: 5, end: 5 } });
    const captured: { sql: string; params: unknown[] }[] = [];
    const pool = createFakePool((sql, params) => {
      captured.push({ sql, params: params ?? [] });
      return { rows: [], rowCount: 1 };
    });
    const store = new PgCollabStore(pool as any);

    await store.insertAssignment(assignment);

    const q = captured[0]!;
    expect(q.params[3]).toBe(5); // start
    expect(q.params[4]).toBe(6); // end + 1
  });
});

describe('PgCollabStore — getAssignment', () => {
  it('parses int4range [3,8) back to inclusive {start:3, end:7}', async () => {
    const assignment = makeAssignment({ slideRange: { start: 3, end: 7 } });
    const pool = createFakePool(() => ({
      rows: [assignmentToRow(assignment)],
      rowCount: 1,
    }));
    const store = new PgCollabStore(pool as any);
    const result = await store.getAssignment('as-001');
    expect(result).not.toBeNull();
    expect(result!.slideRange).toEqual({ start: 3, end: 7 });
  });

  it('parses single-slide int4range [5,6) → {start:5, end:5}', async () => {
    const assignment = makeAssignment({ slideRange: { start: 5, end: 5 } });
    const pool = createFakePool(() => ({
      rows: [assignmentToRow(assignment)],
      rowCount: 1,
    }));
    const store = new PgCollabStore(pool as any);
    const result = await store.getAssignment('as-001');
    expect(result!.slideRange).toEqual({ start: 5, end: 5 });
  });

  it('returns null when not found', async () => {
    const pool = createFakePool(() => ({ rows: [], rowCount: 0 }));
    const store = new PgCollabStore(pool as any);
    expect(await store.getAssignment('nonexistent')).toBeNull();
  });
});

describe('PgCollabStore — updateAssignment', () => {
  it('handles watchers uuid[] update', async () => {
    const assignment = makeAssignment();
    const updated = { ...assignment, watchers: ['u-1', 'u-2', 'u-3'], updatedAt: new Date() };
    const captured: { sql: string; params: unknown[] }[] = [];
    const pool = createFakePool((sql, params) => {
      captured.push({ sql, params: params ?? [] });
      return { rows: [assignmentToRow(updated)], rowCount: 1 };
    });
    const store = new PgCollabStore(pool as any);

    await store.updateAssignment('as-001', { watchers: ['u-1', 'u-2', 'u-3'] });

    const q = captured[0]!;
    expect(q.sql).toContain('watchers = $1::uuid[]');
    expect(q.params[0]).toEqual(['u-1', 'u-2', 'u-3']);
  });

  it('handles status + blockedReason update', async () => {
    const assignment = makeAssignment();
    const updated = {
      ...assignment,
      status: 'blocked' as const,
      blockedReason: 'Waiting',
      updatedAt: new Date(),
    };
    const captured: { sql: string; params: unknown[] }[] = [];
    const pool = createFakePool((sql, params) => {
      captured.push({ sql, params: params ?? [] });
      return { rows: [assignmentToRow(updated)], rowCount: 1 };
    });
    const store = new PgCollabStore(pool as any);

    await store.updateAssignment('as-001', { status: 'blocked', blockedReason: 'Waiting' });

    const q = captured[0]!;
    expect(q.sql).toContain('status = $1');
    expect(q.sql).toContain('blocked_reason = $2');
    expect(q.params[0]).toBe('blocked');
    expect(q.params[1]).toBe('Waiting');
  });

  it('throws CommentNotFoundError when not found', async () => {
    const pool = createFakePool(() => ({ rows: [], rowCount: 0 }));
    const store = new PgCollabStore(pool as any);
    await expect(store.updateAssignment('x', { status: 'done' })).rejects.toThrow(
      CommentNotFoundError,
    );
  });
});

describe('PgCollabStore — listAssignmentsByUser', () => {
  it('queries with primary_id OR watchers array membership', async () => {
    const captured: { sql: string; params: unknown[] }[] = [];
    const pool = createFakePool((sql, params) => {
      captured.push({ sql, params: params ?? [] });
      return { rows: [], rowCount: 0 };
    });
    const store = new PgCollabStore(pool as any);

    await store.listAssignmentsByUser('user-001');

    const q = captured[0]!;
    expect(q.sql).toContain('primary_id = $1');
    expect(q.sql).toContain('$1::uuid = ANY(watchers)');
    expect(q.params).toEqual(['user-001']);
  });

  it('returns domain assignments with parsed slide ranges', async () => {
    const a1 = makeAssignment({ slideRange: { start: 1, end: 10 } });
    const a2 = makeAssignment({ id: 'as-002', slideRange: { start: 5, end: 5 } });
    const pool = createFakePool(() => ({
      rows: [assignmentToRow(a1), assignmentToRow(a2)],
      rowCount: 2,
    }));
    const store = new PgCollabStore(pool as any);
    const results = await store.listAssignmentsByUser('user-001');
    expect(results).toHaveLength(2);
    expect(results[0]!.slideRange).toEqual({ start: 1, end: 10 });
    expect(results[1]!.slideRange).toEqual({ start: 5, end: 5 });
  });
});

// ---------------------------------------------------------------------------
// withTransaction
// ---------------------------------------------------------------------------

describe('PgCollabStore — withTransaction', () => {
  it('issues BEGIN, runs fn, then COMMIT', async () => {
    const queries: string[] = [];
    const fakeClient = {
      query: vi.fn(async (sql: string) => {
        queries.push(sql);
        return { rows: [], rowCount: 0 };
      }),
      release: vi.fn(),
    };
    const pool = {
      query: vi.fn(),
      connect: vi.fn(async () => fakeClient),
      end: vi.fn(),
    };
    const store = new PgCollabStore(pool as any);

    const result = await store.withTransaction(async (client) => {
      await client.query('INSERT INTO comment (...) VALUES (...)');
      return 'done';
    });

    expect(result).toBe('done');
    expect(queries).toEqual(['BEGIN', 'INSERT INTO comment (...) VALUES (...)', 'COMMIT']);
    expect(fakeClient.release).toHaveBeenCalledOnce();
  });

  it('issues ROLLBACK on error and rethrows', async () => {
    const queries: string[] = [];
    const fakeClient = {
      query: vi.fn(async (sql: string) => {
        queries.push(sql);
        return { rows: [], rowCount: 0 };
      }),
      release: vi.fn(),
    };
    const pool = {
      query: vi.fn(),
      connect: vi.fn(async () => fakeClient),
      end: vi.fn(),
    };
    const store = new PgCollabStore(pool as any);

    await expect(
      store.withTransaction(async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    expect(queries).toEqual(['BEGIN', 'ROLLBACK']);
    expect(fakeClient.release).toHaveBeenCalledOnce();
  });
});
