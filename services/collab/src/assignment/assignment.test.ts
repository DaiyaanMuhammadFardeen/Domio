/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Assignment module tests (Phase 18, #181).
 *
 * Slide range validation, status transitions, blocked requires reason, done sets completedAt.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryCollabStore } from '../store/mem_store.js';
import { CollabService } from '../service.js';
import { FEATURE_FLAGS, checkFeature } from '../feature_flags.js';
import {
  validateSlideRange,
  validateAssignmentTransition,
  updateAssignmentBody,
} from './logic.js';
import type { Assignment } from './types.js';
import {
  InvalidSlideRangeError,
  InvalidTransitionError,
  CollabValidationError,
  FeatureDisabledError,
} from '../types.js';

describe('Slide range validation', () => {
  it('accepts valid range', () => {
    expect(() => validateSlideRange({ start: 1, end: 1 })).not.toThrow();
    expect(() => validateSlideRange({ start: 1, end: 10 })).not.toThrow();
    expect(() => validateSlideRange({ start: 5, end: 5 })).not.toThrow();
  });

  it('rejects start < 1', () => {
    expect(() => validateSlideRange({ start: 0, end: 5 })).toThrow(InvalidSlideRangeError);
    expect(() => validateSlideRange({ start: -1, end: 5 })).toThrow(InvalidSlideRangeError);
  });

  it('rejects end < start', () => {
    expect(() => validateSlideRange({ start: 5, end: 3 })).toThrow(InvalidSlideRangeError);
  });
});

describe('Assignment status transitions', () => {
  const VALID: [string, string][] = [
    ['not_started', 'in_progress'],
    ['in_progress', 'blocked'],
    ['in_progress', 'review'],
    ['in_progress', 'done'],
    ['blocked', 'in_progress'],
    ['blocked', 'review'],
    ['review', 'in_progress'],
    ['review', 'done'],
  ];

  const INVALID: [string, string][] = [
    ['not_started', 'blocked'],
    ['not_started', 'review'],
    ['not_started', 'done'],
    ['in_progress', 'not_started'],
    ['blocked', 'not_started'],
    ['blocked', 'done'],
    ['review', 'not_started'],
    ['review', 'blocked'],
    ['done', 'not_started'],
    ['done', 'in_progress'],
    ['done', 'blocked'],
    ['done', 'review'],
  ];

  it.each(VALID)('allows %s → %s', (from, to) => {
    expect(() => validateAssignmentTransition(from as any, to as any)).not.toThrow();
  });

  it.each(INVALID)('rejects %s → %s', (from, to) => {
    expect(() => validateAssignmentTransition(from as any, to as any)).toThrow(InvalidTransitionError);
  });
});

describe('Blocked requires blocked_reason', () => {
  it('throws when transitioning to blocked without reason', () => {
    const assignment = makeAssignment({ status: 'in_progress', blockedReason: null });
    expect(() => updateAssignmentBody(
      assignment,
      { status: 'blocked' },
      'user1',
      new Date(),
    )).toThrow(CollabValidationError);
  });

  it('succeeds with blocked_reason', () => {
    const assignment = makeAssignment({ status: 'in_progress', blockedReason: null });
    const { assignment: updated } = updateAssignmentBody(
      assignment,
      { status: 'blocked', blockedReason: 'Waiting for design' },
      'user1',
      new Date(),
    );
    expect(updated.status).toBe('blocked');
    expect(updated.blockedReason).toBe('Waiting for design');
  });

  it('clears blockedReason when moving away from blocked', () => {
    const assignment = makeAssignment({ status: 'blocked', blockedReason: 'Some reason' });
    const { assignment: updated } = updateAssignmentBody(
      assignment,
      { status: 'in_progress' },
      'user1',
      new Date(),
    );
    expect(updated.status).toBe('in_progress');
    expect(updated.blockedReason).toBeNull();
  });
});

describe('Done sets completedAt', () => {
  it('sets completedAt when transitioning to done', () => {
    const assignment = makeAssignment({ status: 'review', completedAt: null });
    const now = new Date();
    const { assignment: updated } = updateAssignmentBody(
      assignment,
      { status: 'done' },
      'user1',
      now,
    );
    expect(updated.status).toBe('done');
    expect(updated.completedAt).toBe(now);
  });

  it('does not set completedAt for other transitions', () => {
    const assignment = makeAssignment({ status: 'not_started', completedAt: null });
    const { assignment: updated } = updateAssignmentBody(
      assignment,
      { status: 'in_progress' },
      'user1',
      new Date(),
    );
    expect(updated.completedAt).toBeNull();
  });
});

describe('Reassignment', () => {
  it('detects primary reassignment', () => {
    const assignment = makeAssignment({ primaryId: 'user1' });
    const { reassigned } = updateAssignmentBody(
      assignment,
      { primaryId: 'user2' },
      'user1',
      new Date(),
    );
    expect(reassigned).toBe(true);
  });

  it('no reassignment when primary unchanged', () => {
    const assignment = makeAssignment({ primaryId: 'user1' });
    const { reassigned } = updateAssignmentBody(
      assignment,
      { status: 'in_progress' },
      'user1',
      new Date(),
    );
    expect(reassigned).toBe(false);
  });
});

describe('Feature flag guard', () => {
  it('throws FeatureDisabledError when assignments flag is disabled', () => {
    process.env.FEATURE_COLLAB_ASSIGNMENTS_DISABLED = 'true';
    try {
      expect(() => checkFeature(FEATURE_FLAGS.assignments)).toThrow(FeatureDisabledError);
    } finally {
      delete process.env.FEATURE_COLLAB_ASSIGNMENTS_DISABLED;
    }
  });
});

describe('CollabService assignment integration', () => {
  let store: InMemoryCollabStore;
  let service: CollabService;
  const now = new Date('2026-01-01T00:00:00Z');

  beforeEach(() => {
    store = new InMemoryCollabStore();
    service = new CollabService({ store, now: () => now });
  });

  it('creates an assignment and retrieves by user', async () => {
    const assignment = await service.createAssignment({
      workspaceId: 'ws1',
      deckId: 'deck1',
      slideRange: { start: 1, end: 5 },
      primaryId: 'user1',
      watchers: ['user2', 'user3'],
      dueAt: new Date('2026-01-15'),
    }, 'user1');

    expect(assignment.id).toBeTruthy();
    expect(assignment.status).toBe('not_started');
    expect(assignment.slideRange).toEqual({ start: 1, end: 5 });

    const assignments = await service.listUserAssignments('user1');
    expect(assignments).toHaveLength(1);
    expect(assignments[0]!.id).toBe(assignment.id);
  });

  it('listUserAssignments includes watchers', async () => {
    await service.createAssignment({
      workspaceId: 'ws1',
      deckId: 'deck1',
      slideRange: { start: 1, end: 5 },
      primaryId: 'user1',
      watchers: ['user2'],
    }, 'user1');

    const assignments = await service.listUserAssignments('user2');
    expect(assignments).toHaveLength(1);
  });

  it('updates assignment status', async () => {
    const assignment = await service.createAssignment({
      workspaceId: 'ws1',
      deckId: 'deck1',
      slideRange: { start: 1, end: 5 },
      primaryId: 'user1',
      watchers: [],
    }, 'user1');

    const { assignment: updated } = await service.updateAssignment(
      assignment.id,
      { status: 'in_progress' },
      'user1',
    );
    expect(updated.status).toBe('in_progress');
  });

  it('rejects invalid slide range', async () => {
    await expect(service.createAssignment({
      workspaceId: 'ws1',
      deckId: 'deck1',
      slideRange: { start: 0, end: 5 },
      primaryId: 'user1',
      watchers: [],
    }, 'user1')).rejects.toThrow(InvalidSlideRangeError);
  });
});

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function makeAssignment(overrides?: Partial<Assignment>): Assignment {
  return {
    id: 'a1',
    workspaceId: 'ws1',
    deckId: 'deck1',
    slideRange: { start: 1, end: 5 },
    primaryId: 'user1',
    watchers: [],
    status: 'not_started',
    blockedReason: null,
    dueAt: null,
    createdBy: 'user1',
    createdAt: new Date(),
    updatedAt: new Date(),
    completedAt: null,
    taskLinkId: null,
    ...overrides,
  };
}
