/**
 * Merge request service tests (Phase 18 W2).
 *
 * Tests merge lifecycle, validation hooks, conflict resolution,
 * and event emission.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MergeRequestService } from './service.js';
import { InMemoryMergeRequestStore } from './store/mem_store.js';
import { MergeRequestValidationError, MergeValidationFailedError } from './types.js';
import type { MergeRequestEventEmitter, MergeValidators, DeckSnapshot } from './types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDeck(slides: Array<{ id: string; title: string }>): DeckSnapshot {
  return {
    slides: slides.map(s => ({
      id: s.id,
      semantic_id: s.id,
      title: s.title,
      notes: '',
      elements: [],
    })),
  };
}

function createEmitter(): MergeRequestEventEmitter & { events: Array<{ subject: string; payload: Record<string, unknown> }> } {
  const events: Array<{ subject: string; payload: Record<string, unknown> }> = [];
  return {
    events,
    async publish(subject: string, payload: Record<string, unknown>) {
      events.push({ subject, payload });
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MergeRequestService', () => {
  let store: InMemoryMergeRequestStore;
  let emitter: ReturnType<typeof createEmitter>;
  let service: MergeRequestService;

  beforeEach(() => {
    store = new InMemoryMergeRequestStore();
    emitter = createEmitter();
    service = new MergeRequestService({
      store,
      eventEmitter: emitter,
      now: () => new Date('2026-08-08T00:00:00Z'),
    });
  });

  // -------------------------------------------------------------------------
  // createMergeRequest
  // -------------------------------------------------------------------------

  describe('createMergeRequest', () => {
    it('creates a merge request with status open', async () => {
      const deck = makeDeck([{ id: 's1', title: 'Slide 1' }]);
      const mr = await service.createMergeRequest(
        { source_branch: 'feature', target_branch: 'main', title: 'Test MR' },
        'user-1',
        'ws-1',
        'deck-1',
        deck,
        deck,
        deck,
      );
      expect(mr.status).toBe('open');
      expect(mr.author_id).toBe('user-1');
      expect(mr.title).toBe('Test MR');
    });

    it('emits merge_request.opened event', async () => {
      const deck = makeDeck([]);
      await service.createMergeRequest(
        { source_branch: 'feature', target_branch: 'main', title: 'Test' },
        'user-1',
        'ws-1',
        'deck-1',
        deck,
        deck,
        deck,
      );
      expect(emitter.events).toHaveLength(1);
      expect(emitter.events[0]!.subject).toBe('merge_request.opened');
      expect(emitter.events[0]!.payload.event_type).toBe('merge_request.opened');
    });

    it('rejects same source and target branches', async () => {
      const deck = makeDeck([]);
      await expect(service.createMergeRequest(
        { source_branch: 'main', target_branch: 'main', title: 'Test' },
        'user-1',
        'ws-1',
        'deck-1',
        deck,
        deck,
        deck,
      )).rejects.toThrow(MergeRequestValidationError);
    });

    it('rejects missing required fields', async () => {
      const deck = makeDeck([]);
      await expect(service.createMergeRequest(
        { source_branch: '', target_branch: 'main', title: '' },
        'user-1',
        'ws-1',
        'deck-1',
        deck,
        deck,
        deck,
      )).rejects.toThrow(MergeRequestValidationError);
    });
  });

  // -------------------------------------------------------------------------
  // getMergeRequest
  // -------------------------------------------------------------------------

  describe('getMergeRequest', () => {
    it('returns an existing merge request', async () => {
      const deck = makeDeck([]);
      const created = await service.createMergeRequest(
        { source_branch: 'feature', target_branch: 'main', title: 'Test' },
        'user-1',
        'ws-1',
        'deck-1',
        deck,
        deck,
        deck,
      );
      const fetched = await service.getMergeRequest(created.id);
      expect(fetched.id).toBe(created.id);
    });

    it('throws MergeRequestNotFoundError for missing id', async () => {
      await expect(service.getMergeRequest('nonexistent'))
        .rejects.toThrow('not found');
    });
  });

  // -------------------------------------------------------------------------
  // listMergeRequests
  // -------------------------------------------------------------------------

  describe('listMergeRequests', () => {
    it('lists merge requests for a deck', async () => {
      const deck = makeDeck([]);
      await service.createMergeRequest(
        { source_branch: 'feature', target_branch: 'main', title: 'MR 1' },
        'user-1',
        'ws-1',
        'deck-1',
        deck,
        deck,
        deck,
      );
      const list = await service.listMergeRequests('deck-1');
      expect(list).toHaveLength(1);
    });

    it('filters by status', async () => {
      const deck = makeDeck([]);
      await service.createMergeRequest(
        { source_branch: 'feature', target_branch: 'main', title: 'MR 1' },
        'user-1',
        'ws-1',
        'deck-1',
        deck,
        deck,
        deck,
      );
      const list = await service.listMergeRequests('deck-1', { status: 'merged' });
      expect(list).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // mergeMergeRequest
  // -------------------------------------------------------------------------

  describe('mergeMergeRequest', () => {
    it('merges an open MR and emits event', async () => {
      const deck = makeDeck([]);
      const created = await service.createMergeRequest(
        { source_branch: 'feature', target_branch: 'main', title: 'Test' },
        'user-1',
        'ws-1',
        'deck-1',
        deck,
        deck,
        deck,
      );
      const merged = await service.mergeMergeRequest(created.id, 'user-1', 'ws-1');
      expect(merged.status).toBe('merged');
      expect(merged.merged_by).toBe('user-1');
      expect(merged.merge_commit_id).toBeTruthy();

      const mergeEvent = emitter.events.find(e => e.subject === 'merge_request.merged');
      expect(mergeEvent).toBeTruthy();
      expect(mergeEvent!.payload.event_type).toBe('merge_request.merged');
    });

    it('rejects merge on already merged MR', async () => {
      const deck = makeDeck([]);
      const created = await service.createMergeRequest(
        { source_branch: 'feature', target_branch: 'main', title: 'Test' },
        'user-1',
        'ws-1',
        'deck-1',
        deck,
        deck,
        deck,
      );
      await service.mergeMergeRequest(created.id, 'user-1', 'ws-1');
      await expect(service.mergeMergeRequest(created.id, 'user-1', 'ws-1'))
        .rejects.toThrow(MergeRequestValidationError);
    });
  });

  // -------------------------------------------------------------------------
  // closeMergeRequest
  // -------------------------------------------------------------------------

  describe('closeMergeRequest', () => {
    it('closes an open MR', async () => {
      const deck = makeDeck([]);
      const created = await service.createMergeRequest(
        { source_branch: 'feature', target_branch: 'main', title: 'Test' },
        'user-1',
        'ws-1',
        'deck-1',
        deck,
        deck,
        deck,
      );
      const closed = await service.closeMergeRequest(created.id, 'user-1');
      expect(closed.status).toBe('closed');
    });
  });

  // -------------------------------------------------------------------------
  // Validation hooks
  // -------------------------------------------------------------------------

  describe('validation hooks', () => {
    it('blocks merge when validator fails', async () => {
      const failingValidators: MergeValidators = {
        lint: () => ({ ok: false, failures: ['lint error'] }),
      };

      const svc = new MergeRequestService({
        store,
        eventEmitter: emitter,
        validators: failingValidators,
        now: () => new Date('2026-08-08T00:00:00Z'),
      });

      const deck = makeDeck([{ id: 's1', title: 'S1' }]);
      const created = await svc.createMergeRequest(
        { source_branch: 'feature', target_branch: 'main', title: 'Test' },
        'user-1',
        'ws-1',
        'deck-1',
        deck,
        deck,
        deck,
      );

      await expect(svc.mergeMergeRequest(created.id, 'user-1', 'ws-1', deck))
        .rejects.toThrow(MergeValidationFailedError);
    });

    it('passes merge when validators succeed', async () => {
      const passingValidators: MergeValidators = {
        lint: () => ({ ok: true, failures: [] }),
        brand: () => ({ ok: true, failures: [] }),
      };

      const svc = new MergeRequestService({
        store,
        eventEmitter: emitter,
        validators: passingValidators,
        now: () => new Date('2026-08-08T00:00:00Z'),
      });

      const deck = makeDeck([{ id: 's1', title: 'S1' }]);
      const created = await svc.createMergeRequest(
        { source_branch: 'feature', target_branch: 'main', title: 'Test' },
        'user-1',
        'ws-1',
        'deck-1',
        deck,
        deck,
        deck,
      );

      const merged = await svc.mergeMergeRequest(created.id, 'user-1', 'ws-1', deck);
      expect(merged.status).toBe('merged');
    });
  });

  // -------------------------------------------------------------------------
  // resolveMergeRequestConflict
  // -------------------------------------------------------------------------

  describe('resolveMergeRequestConflict', () => {
    it('resolves conflict and transitions to open', async () => {
      // Create conflicting diff
      const base = makeDeck([{ id: 's1', title: 'Base' }]);
      const source = makeDeck([{ id: 's1', title: 'Source' }]);
      const target = makeDeck([{ id: 's1', title: 'Target' }]);

      const created = await service.createMergeRequest(
        { source_branch: 'feature', target_branch: 'main', title: 'Conflict MR' },
        'user-1',
        'ws-1',
        'deck-1',
        base,
        source,
        target,
      );

      // Should have conflict status
      expect(created.status).toBe('conflict');

      // Resolve the conflict
      const resolved = await service.resolveMergeRequestConflict(
        created.id,
        [{ slide_id: 's1', resolution: 'theirs' }],
        'user-1',
        'ws-1',
      );

      expect(resolved.status).toBe('open');
    });
  });
});
