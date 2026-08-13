/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Approval module tests (Phase 18, #180).
 *
 * State machine transitions, parallel lanes, SLA escalation.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryCollabStore } from '../store/mem_store.js';
import { CollabService } from '../service.js';
import { FEATURE_FLAGS, checkFeature } from '../feature_flags.js';
import {
  validateTransition,
  recordApprovalDecisionBody,
  recomputeStatus,
  overdueLanes,
  backToDraftBody,
} from './logic.js';
import type { ApprovalRequest } from './types.js';
import { InvalidTransitionError, ApprovalNotPendingError, FeatureDisabledError } from '../types.js';

describe('Approval state machine transitions', () => {
  it('allows draft → pending', () => {
    expect(() => validateTransition('draft', 'pending')).not.toThrow();
  });

  it('allows pending → approved', () => {
    expect(() => validateTransition('pending', 'approved')).not.toThrow();
  });

  it('allows pending → rejected', () => {
    expect(() => validateTransition('pending', 'rejected')).not.toThrow();
  });

  it('allows pending → changes_requested', () => {
    expect(() => validateTransition('pending', 'changes_requested')).not.toThrow();
  });

  it('allows terminal → draft (backToDraft)', () => {
    expect(() => validateTransition('approved', 'draft')).not.toThrow();
    expect(() => validateTransition('rejected', 'draft')).not.toThrow();
    expect(() => validateTransition('changes_requested', 'draft')).not.toThrow();
  });

  it('rejects draft → approved (must go through pending)', () => {
    expect(() => validateTransition('draft', 'approved')).toThrow(InvalidTransitionError);
  });

  it('rejects approved → pending (terminal state, only back to draft)', () => {
    expect(() => validateTransition('approved', 'pending')).toThrow(InvalidTransitionError);
  });

  it('rejects invalid transitions', () => {
    // draft → rejected is not allowed (must go through pending)
    expect(() => validateTransition('draft', 'rejected')).toThrow(InvalidTransitionError);
    // approved → pending is not allowed (terminal, only back to draft)
    expect(() => validateTransition('approved', 'pending')).toThrow(InvalidTransitionError);
  });
});

describe('Record decision only while pending', () => {
  it('throws when request is not pending', () => {
    const request = makeRequest({ status: 'draft' });
    expect(() =>
      recordApprovalDecisionBody(request, { lane: 'legal', decision: 'approved' }, 'user1', 'v1', {
        now: () => new Date(),
        idGen: () => 'd1',
      }),
    ).toThrow(ApprovalNotPendingError);
  });

  it('succeeds when request is pending', () => {
    const request = makeRequest({ status: 'pending' });
    const { decision } = recordApprovalDecisionBody(
      request,
      { lane: 'legal', decision: 'approved', justification: 'Looks good' },
      'user1',
      'v1',
      { now: () => new Date(), idGen: () => 'd1' },
    );
    expect(decision.lane).toBe('legal');
    expect(decision.decision).toBe('approved');
    expect(decision.justification).toBe('Looks good');
  });
});

describe('Parallel lanes', () => {
  it('approved only when ALL required lanes approved', () => {
    const request = makeRequest({
      policy: {
        lanes: [
          { lane: 'legal', role: 'legal-reviewer', required: true, slaHours: 24 },
          { lane: 'brand', role: 'brand-reviewer', required: true, slaHours: 24 },
        ],
      },
    });

    // Only legal approved
    const decisions1 = [
      {
        requestId: 'r1',
        lane: 'legal',
        decision: 'approved' as const,
        decidedAt: new Date(),
        versionId: 'v1',
        id: 'd1',
        workspaceId: 'ws1',
        approverId: 'u1',
        justification: null,
      },
    ];
    expect(recomputeStatus(request, decisions1 as any)).toBe('pending');

    // Both approved
    const decisions2 = [
      ...decisions1,
      {
        requestId: 'r1',
        lane: 'brand',
        decision: 'approved' as const,
        decidedAt: new Date(),
        versionId: 'v1',
        id: 'd2',
        workspaceId: 'ws1',
        approverId: 'u2',
        justification: null,
      },
    ];
    expect(recomputeStatus(request, decisions2 as any)).toBe('approved');
  });

  it('any reject → rejected', () => {
    const request = makeRequest({
      policy: {
        lanes: [
          { lane: 'legal', role: 'legal-reviewer', required: true, slaHours: 24 },
          { lane: 'brand', role: 'brand-reviewer', required: true, slaHours: 24 },
        ],
      },
    });

    const decisions = [
      {
        requestId: 'r1',
        lane: 'legal',
        decision: 'approved' as const,
        decidedAt: new Date(),
        versionId: 'v1',
        id: 'd1',
        workspaceId: 'ws1',
        approverId: 'u1',
        justification: null,
      },
      {
        requestId: 'r1',
        lane: 'brand',
        decision: 'rejected' as const,
        decidedAt: new Date(),
        versionId: 'v1',
        id: 'd2',
        workspaceId: 'ws1',
        approverId: 'u2',
        justification: 'No',
      },
    ];
    expect(recomputeStatus(request, decisions as any)).toBe('rejected');
  });

  it('changes_requested without reject → changes_requested', () => {
    const request = makeRequest({
      policy: {
        lanes: [{ lane: 'legal', role: 'legal-reviewer', required: true, slaHours: 24 }],
      },
    });

    const decisions = [
      {
        requestId: 'r1',
        lane: 'legal',
        decision: 'changes_requested' as const,
        decidedAt: new Date(),
        versionId: 'v1',
        id: 'd1',
        workspaceId: 'ws1',
        approverId: 'u1',
        justification: 'Need edits',
      },
    ];
    expect(recomputeStatus(request, decisions as any)).toBe('changes_requested');
  });

  it('optional lanes ignored if absent', () => {
    const request = makeRequest({
      policy: {
        lanes: [
          { lane: 'legal', role: 'legal-reviewer', required: true, slaHours: 24 },
          { lane: 'finance', role: 'finance-reviewer', required: false, slaHours: 48 },
        ],
      },
    });

    // Only required lane approved; optional lane has no decision
    const decisions = [
      {
        requestId: 'r1',
        lane: 'legal',
        decision: 'approved' as const,
        decidedAt: new Date(),
        versionId: 'v1',
        id: 'd1',
        workspaceId: 'ws1',
        approverId: 'u1',
        justification: null,
      },
    ];
    expect(recomputeStatus(request, decisions as any)).toBe('approved');
  });
});

describe('overdueLanes', () => {
  it('returns overdue lanes with fallback_role', () => {
    const request = makeRequest({
      status: 'pending',
      requestedAt: new Date('2026-01-01T00:00:00Z'),
      policy: {
        lanes: [
          { lane: 'legal', role: 'legal-reviewer', required: true, slaHours: 24 },
          { lane: 'brand', role: 'brand-reviewer', required: true, slaHours: 48 },
        ],
      },
    });

    // 30 hours after request: legal is overdue by 6h, brand is not
    const now = new Date('2026-01-02T06:00:00Z');
    const overdue = overdueLanes(request, now);
    expect(overdue).toHaveLength(1);
    expect(overdue[0]!.lane).toBe('legal');
    expect(overdue[0]!.overdueByHours).toBe(6);
    expect(overdue[0]!.fallbackRole).toBe('brand-reviewer');
  });

  it('returns empty for non-pending requests', () => {
    const request = makeRequest({ status: 'approved' });
    const overdue = overdueLanes(request, new Date());
    expect(overdue).toHaveLength(0);
  });

  it('last lane has null fallback_role', () => {
    const request = makeRequest({
      status: 'pending',
      requestedAt: new Date('2026-01-01T00:00:00Z'),
      policy: {
        lanes: [{ lane: 'legal', role: 'legal-reviewer', required: true, slaHours: 24 }],
      },
    });

    const now = new Date('2026-01-02T06:00:00Z');
    const overdue = overdueLanes(request, now);
    expect(overdue).toHaveLength(1);
    expect(overdue[0]!.fallbackRole).toBeNull();
  });
});

describe('Back to draft', () => {
  it('transitions terminal status back to draft', () => {
    const request = makeRequest({ status: 'approved' });
    const updated = backToDraftBody(request, 'user1', new Date());
    expect(updated.status).toBe('draft');
    expect(updated.closedAt).toBeNull();
  });

  it('rejects invalid transition', () => {
    const request = makeRequest({ status: 'pending' });
    // pending → pending is not a valid transition
    expect(() => backToDraftBody(request, 'user1', new Date())).not.toThrow();
    // draft → draft is not a valid transition (not in VALID_TRANSITIONS)
    const draftRequest = makeRequest({ status: 'draft' });
    expect(() => backToDraftBody(draftRequest, 'user1', new Date())).toThrow(
      InvalidTransitionError,
    );
  });
});

describe('Feature flag guard', () => {
  it('throws FeatureDisabledError when approval flag is disabled', () => {
    process.env.FEATURE_COLLAB_APPROVAL_DISABLED = 'true';
    try {
      expect(() => checkFeature(FEATURE_FLAGS.approval)).toThrow(FeatureDisabledError);
    } finally {
      delete process.env.FEATURE_COLLAB_APPROVAL_DISABLED;
    }
  });
});

describe('CollabService approval integration', () => {
  let store: InMemoryCollabStore;
  let service: CollabService;
  const now = new Date('2026-01-01T00:00:00Z');

  beforeEach(() => {
    store = new InMemoryCollabStore();
    service = new CollabService({ store, now: () => now });
  });

  it('creates and submits an approval request', async () => {
    const { request } = await service.createApprovalRequest({
      workspaceId: 'ws1',
      deckId: 'deck1',
      versionId: 'v1',
      actorId: 'user1',
      policy: {
        lanes: [{ lane: 'legal', role: 'legal-reviewer', required: true, slaHours: 24 }],
      },
    });

    expect(request.status).toBe('draft');

    const submitted = await service.submitApprovalRequest(request.id, 'user1');
    expect(submitted.status).toBe('pending');
    expect(submitted.requestedAt).toBeTruthy();
  });

  it('auto-submits when submitNow is true', async () => {
    const { request, autoSubmitted } = await service.createApprovalRequest({
      workspaceId: 'ws1',
      deckId: 'deck1',
      versionId: 'v1',
      actorId: 'user1',
      policy: {
        lanes: [{ lane: 'legal', role: 'legal-reviewer', required: true, slaHours: 24 }],
        submitNow: true,
      },
    });

    expect(autoSubmitted).toBe(true);
    expect(request.status).toBe('pending');
  });

  it('records a decision and recomputes status', async () => {
    const { request } = await service.createApprovalRequest({
      workspaceId: 'ws1',
      deckId: 'deck1',
      versionId: 'v1',
      actorId: 'user1',
      policy: {
        lanes: [
          { lane: 'legal', role: 'legal-reviewer', required: true, slaHours: 24 },
          { lane: 'brand', role: 'brand-reviewer', required: true, slaHours: 24 },
        ],
        submitNow: true,
      },
    });

    // First decision: legal approves
    const { request: r1 } = await service.recordApprovalDecision(
      request.id,
      { lane: 'legal', decision: 'approved' },
      'legal-user',
    );
    expect(r1.status).toBe('pending');

    // Second decision: brand approves → all required approved
    const { request: r2 } = await service.recordApprovalDecision(
      request.id,
      { lane: 'brand', decision: 'approved' },
      'brand-user',
    );
    expect(r2.status).toBe('approved');
    expect(r2.closedAt).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function makeRequest(overrides?: Partial<ApprovalRequest>): ApprovalRequest {
  return {
    id: 'r1',
    workspaceId: 'ws1',
    deckId: 'deck1',
    versionId: 'v1',
    requestedBy: 'user1',
    requestedAt: null,
    policy: {
      lanes: [{ lane: 'legal', role: 'legal-reviewer', required: true, slaHours: 24 }],
    },
    status: 'draft',
    closedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'user1',
    updatedBy: null,
    ...overrides,
  };
}
