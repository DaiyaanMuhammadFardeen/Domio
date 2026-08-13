/**
 * SuggestionsService — integration tests (Phase 18 #182).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SuggestionsService } from './service.js';
import { InMemorySuggestionsStore } from './store/mem_store.js';
import type { SuggestionOperation, SuggestionEventEmitter, BrandLockProvider } from './types.js';
import {
  FeatureDisabledError,
  BrandLockError,
  InvalidStatusTransitionError,
  SuggestionNotFoundError,
} from './types.js';
import { SUGGESTION_RETENTION_MS } from './suggestion/lifecycle.js';

const fixedDate = new Date('2026-08-01T10:00:00Z');

function makeOp(overrides: Partial<SuggestionOperation> = {}): SuggestionOperation {
  return {
    type: 'move',
    params: { target_id: 'el-1' },
    before_state: { x: 0, y: 0 },
    after_state: { x: 100, y: 50 },
    ...overrides,
  };
}

function makeEventEmitter(): SuggestionEventEmitter & {
  events: Array<{
    subject: string;
    payload: Record<string, unknown>;
    innerPayload: Record<string, unknown>;
  }>;
} {
  const events: Array<{
    subject: string;
    payload: Record<string, unknown>;
    innerPayload: Record<string, unknown>;
  }> = [];
  return {
    events,
    async publish(subject: string, payload: Record<string, unknown>): Promise<void> {
      const innerPayload = (payload.payload ?? {}) as Record<string, unknown>;
      events.push({ subject, payload, innerPayload });
    },
  };
}

describe('SuggestionsService', () => {
  let store: InMemorySuggestionsStore;
  let emitter: ReturnType<typeof makeEventEmitter>;
  let service: SuggestionsService;

  beforeEach(() => {
    store = new InMemorySuggestionsStore();
    emitter = makeEventEmitter();
    service = new SuggestionsService({
      store,
      eventEmitter: emitter,
      now: () => fixedDate,
    });
  });

  // -------------------------------------------------------------------------
  // Feature flag
  // -------------------------------------------------------------------------

  describe('feature flag', () => {
    it('returns 503 when collab.suggestions is disabled', async () => {
      process.env.FEATURE_COLLAB_SUGGESTIONS_DISABLED = 'true';
      try {
        await expect(service.listSuggestions('deck-1')).rejects.toThrow(FeatureDisabledError);
      } finally {
        delete process.env.FEATURE_COLLAB_SUGGESTIONS_DISABLED;
      }
    });
  });

  // -------------------------------------------------------------------------
  // createSuggestion
  // -------------------------------------------------------------------------

  describe('createSuggestion', () => {
    it('creates a suggestion with status open', async () => {
      const suggestion = await service.createSuggestion(
        {
          workspace_id: 'ws-1',
          deck_id: 'deck-1',
          session_id: 'sess-1',
          author_id: 'user-1',
          target_type: 'element',
          target_id: 'el-1',
          operation: makeOp(),
        },
        'user-1',
      );

      expect(suggestion.status).toBe('open');
      expect(suggestion.deck_id).toBe('deck-1');
      expect(suggestion.author_id).toBe('user-1');
      expect(suggestion.operation.type).toBe('move');

      expect(emitter.events).toHaveLength(1);
      expect(emitter.events[0]!.subject).toBe('suggestion.created');
      expect(emitter.events[0]!.innerPayload.suggestion_id).toBe(suggestion.id);
      expect(emitter.events[0]!.innerPayload.deck_id).toBe('deck-1');
      expect(emitter.events[0]!.innerPayload.author_id).toBe('user-1');
      expect(emitter.events[0]!.innerPayload.target_type).toBe('element');
      expect(emitter.events[0]!.innerPayload.target_id).toBe('el-1');
    });

    it('validates the operation structure', async () => {
      await expect(
        service.createSuggestion(
          {
            workspace_id: 'ws-1',
            deck_id: 'deck-1',
            session_id: 'sess-1',
            author_id: 'user-1',
            target_type: 'element',
            target_id: 'el-1',
            operation: makeOp({ type: 'content', params: { text: 'raw text' } }),
          },
          'user-1',
        ),
      ).rejects.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // getSuggestion
  // -------------------------------------------------------------------------

  describe('getSuggestion', () => {
    it('returns a suggestion by id', async () => {
      const created = await service.createSuggestion(
        {
          workspace_id: 'ws-1',
          deck_id: 'deck-1',
          session_id: 'sess-1',
          author_id: 'user-1',
          target_type: 'element',
          target_id: 'el-1',
          operation: makeOp(),
        },
        'user-1',
      );

      const found = await service.getSuggestion(created.id);
      expect(found.id).toBe(created.id);
    });

    it('throws for non-existent suggestion', async () => {
      await expect(service.getSuggestion('nonexistent')).rejects.toThrow(SuggestionNotFoundError);
    });
  });

  // -------------------------------------------------------------------------
  // listSuggestions
  // -------------------------------------------------------------------------

  describe('listSuggestions', () => {
    it('returns suggestions for a deck', async () => {
      await service.createSuggestion(
        {
          workspace_id: 'ws-1',
          deck_id: 'deck-1',
          session_id: 'sess-1',
          author_id: 'user-1',
          target_type: 'element',
          target_id: 'el-1',
          operation: makeOp(),
        },
        'user-1',
      );

      const suggestions = await service.listSuggestions('deck-1');
      expect(suggestions).toHaveLength(1);
    });

    it('filters out expired open suggestions', async () => {
      await service.createSuggestion(
        {
          workspace_id: 'ws-1',
          deck_id: 'deck-1',
          session_id: 'sess-1',
          author_id: 'user-1',
          target_type: 'element',
          target_id: 'el-1',
          operation: makeOp(),
        },
        'user-1',
      );

      // Now list with a time far in the future (>90 days)
      const futureService = new SuggestionsService({
        store,
        eventEmitter: emitter,
        now: () => new Date(fixedDate.getTime() + SUGGESTION_RETENTION_MS + 1),
      });

      const suggestions = await futureService.listSuggestions('deck-1');
      expect(suggestions).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // acceptSuggestion
  // -------------------------------------------------------------------------

  describe('acceptSuggestion', () => {
    it('accepts an open suggestion', async () => {
      const created = await service.createSuggestion(
        {
          workspace_id: 'ws-1',
          deck_id: 'deck-1',
          session_id: 'sess-1',
          author_id: 'user-1',
          target_type: 'element',
          target_id: 'el-1',
          operation: makeOp(),
        },
        'user-1',
      );

      const accepted = await service.acceptSuggestion(created.id, 'user-2', false);
      expect(accepted.status).toBe('accepted');
      expect(accepted.resolved_by).toBe('user-2');
      expect(accepted.resolved_at).toBeDefined();

      expect(emitter.events.some((e) => e.subject === 'suggestion.accepted')).toBe(true);
      const acceptedEvent = emitter.events.find((e) => e.subject === 'suggestion.accepted')!;
      expect(acceptedEvent.innerPayload.suggestion_id).toBe(created.id);
      expect(acceptedEvent.innerPayload.deck_id).toBe('deck-1');
      expect(acceptedEvent.innerPayload.accepted_by).toBe('user-2');
    });

    it('rejects accepting a non-open suggestion', async () => {
      const created = await service.createSuggestion(
        {
          workspace_id: 'ws-1',
          deck_id: 'deck-1',
          session_id: 'sess-1',
          author_id: 'user-1',
          target_type: 'element',
          target_id: 'el-1',
          operation: makeOp(),
        },
        'user-1',
      );

      await service.acceptSuggestion(created.id, 'user-2', false);
      await expect(service.acceptSuggestion(created.id, 'user-3', false)).rejects.toThrow(
        InvalidStatusTransitionError,
      );
    });

    it('marks conflicting suggestions obsolete on accept', async () => {
      const s1 = await service.createSuggestion(
        {
          workspace_id: 'ws-1',
          deck_id: 'deck-1',
          session_id: 'sess-1',
          author_id: 'user-1',
          target_type: 'element',
          target_id: 'el-1',
          operation: makeOp({ after_state: { x: 10 } }),
        },
        'user-1',
      );

      const s2 = await service.createSuggestion(
        {
          workspace_id: 'ws-1',
          deck_id: 'deck-1',
          session_id: 'sess-1',
          author_id: 'user-2',
          target_type: 'element',
          target_id: 'el-1',
          operation: makeOp({ after_state: { x: 20 } }),
        },
        'user-2',
      );

      await service.acceptSuggestion(s1.id, 'user-3', false);

      const s2Updated = await service.getSuggestion(s2.id);
      expect(s2Updated.status).toBe('obsolete');

      expect(
        emitter.events.some(
          (e) => e.subject === 'suggestion.obsolete' && e.innerPayload.suggestion_id === s2.id,
        ),
      ).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // rejectSuggestion
  // -------------------------------------------------------------------------

  describe('rejectSuggestion', () => {
    it('rejects an open suggestion with reason', async () => {
      const created = await service.createSuggestion(
        {
          workspace_id: 'ws-1',
          deck_id: 'deck-1',
          session_id: 'sess-1',
          author_id: 'user-1',
          target_type: 'element',
          target_id: 'el-1',
          operation: makeOp(),
        },
        'user-1',
      );

      const rejected = await service.rejectSuggestion(created.id, 'user-2', 'Does not match brand');
      expect(rejected.status).toBe('rejected');
      expect(rejected.resolved_by).toBe('user-2');

      const rejectEvent = emitter.events.find((e) => e.subject === 'suggestion.rejected');
      expect(rejectEvent).toBeDefined();
      expect(rejectEvent!.innerPayload.reason).toBe('Does not match brand');
    });

    it('rejects an open suggestion without reason', async () => {
      const created = await service.createSuggestion(
        {
          workspace_id: 'ws-1',
          deck_id: 'deck-1',
          session_id: 'sess-1',
          author_id: 'user-1',
          target_type: 'element',
          target_id: 'el-1',
          operation: makeOp(),
        },
        'user-1',
      );

      const rejected = await service.rejectSuggestion(created.id, 'user-2');
      expect(rejected.status).toBe('rejected');

      const rejectEvent = emitter.events.find((e) => e.subject === 'suggestion.rejected');
      expect(rejectEvent!.innerPayload.reason).toBe('');
    });

    it('rejects accepting a non-open suggestion', async () => {
      const created = await service.createSuggestion(
        {
          workspace_id: 'ws-1',
          deck_id: 'deck-1',
          session_id: 'sess-1',
          author_id: 'user-1',
          target_type: 'element',
          target_id: 'el-1',
          operation: makeOp(),
        },
        'user-1',
      );

      await service.rejectSuggestion(created.id, 'user-2');
      await expect(service.rejectSuggestion(created.id, 'user-3')).rejects.toThrow(
        InvalidStatusTransitionError,
      );
    });
  });

  // -------------------------------------------------------------------------
  // Brand lock
  // -------------------------------------------------------------------------

  describe('brand lock', () => {
    it('accepts suggestion by author without brand lock check', async () => {
      const lockedProvider: BrandLockProvider = {
        isBrandLocked: () => true,
      };

      const lockedService = new SuggestionsService({
        store,
        eventEmitter: emitter,
        brandLockProvider: lockedProvider,
        now: () => fixedDate,
      });

      const created = await lockedService.createSuggestion(
        {
          workspace_id: 'ws-1',
          deck_id: 'deck-1',
          session_id: 'sess-1',
          author_id: 'user-1',
          target_type: 'element',
          target_id: 'el-1',
          operation: makeOp(),
        },
        'user-1',
      );

      // Accepting by a DIFFERENT user with brand lock should fail without break_brand_lock
      await expect(lockedService.acceptSuggestion(created.id, 'user-2', false)).rejects.toThrow(
        BrandLockError,
      );
    });

    it('allows accept with break_brand_lock=true', async () => {
      const lockedProvider: BrandLockProvider = {
        isBrandLocked: () => true,
      };

      const lockedService = new SuggestionsService({
        store,
        eventEmitter: emitter,
        brandLockProvider: lockedProvider,
        now: () => fixedDate,
      });

      const created = await lockedService.createSuggestion(
        {
          workspace_id: 'ws-1',
          deck_id: 'deck-1',
          session_id: 'sess-1',
          author_id: 'user-1',
          target_type: 'element',
          target_id: 'el-1',
          operation: makeOp(),
        },
        'user-1',
      );

      const accepted = await lockedService.acceptSuggestion(created.id, 'user-2', true);
      expect(accepted.status).toBe('accepted');
    });

    it('allows accept when not brand-locked', async () => {
      const unlockedProvider: BrandLockProvider = {
        isBrandLocked: () => false,
      };

      const unlockedService = new SuggestionsService({
        store,
        eventEmitter: emitter,
        brandLockProvider: unlockedProvider,
        now: () => fixedDate,
      });

      const created = await unlockedService.createSuggestion(
        {
          workspace_id: 'ws-1',
          deck_id: 'deck-1',
          session_id: 'sess-1',
          author_id: 'user-1',
          target_type: 'element',
          target_id: 'el-1',
          operation: makeOp(),
        },
        'user-1',
      );

      const accepted = await unlockedService.acceptSuggestion(created.id, 'user-2', false);
      expect(accepted.status).toBe('accepted');
    });
  });

  // -------------------------------------------------------------------------
  // applyOp
  // -------------------------------------------------------------------------

  describe('applyOp', () => {
    it('applies operation to deck state', () => {
      const deck = {
        elements: {
          'el-1': { x: 0, y: 0, color: 'red' },
        },
      };
      const op = makeOp({
        type: 'move',
        params: { target_id: 'el-1' },
        after_state: { x: 100, y: 50 },
      });

      const result = service.applyOpToDeck(deck, op);
      expect(result.elements['el-1']!.x).toBe(100);
      expect(result.elements['el-1']!.y).toBe(50);
      expect(result.elements['el-1']!.color).toBe('red');
    });

    it('returns unchanged deck for non-existent target', () => {
      const deck = {
        elements: {
          'el-1': { x: 0 },
        },
      };
      const op = makeOp({
        params: { target_id: 'el-nonexistent' },
        after_state: { x: 100 },
      });

      const result = service.applyOpToDeck(deck, op);
      expect(result).toBe(deck);
    });
  });

  // -------------------------------------------------------------------------
  // sweepOpenSuggestions
  // -------------------------------------------------------------------------

  describe('sweepOpenSuggestions', () => {
    it('marks expired suggestions as obsolete', async () => {
      await service.createSuggestion(
        {
          workspace_id: 'ws-1',
          deck_id: 'deck-1',
          session_id: 'sess-1',
          author_id: 'user-1',
          target_type: 'element',
          target_id: 'el-1',
          operation: makeOp(),
        },
        'user-1',
      );

      const futureService = new SuggestionsService({
        store,
        eventEmitter: emitter,
        now: () => new Date(fixedDate.getTime() + SUGGESTION_RETENTION_MS + 1),
      });

      const count = await futureService.sweepOpenSuggestions();
      expect(count).toBe(1);

      expect(
        emitter.events.some(
          (e) => e.subject === 'suggestion.obsolete' && e.innerPayload.reason === 'expired',
        ),
      ).toBe(true);
    });

    it('does not mark non-expired suggestions', async () => {
      await service.createSuggestion(
        {
          workspace_id: 'ws-1',
          deck_id: 'deck-1',
          session_id: 'sess-1',
          author_id: 'user-1',
          target_type: 'element',
          target_id: 'el-1',
          operation: makeOp(),
        },
        'user-1',
      );

      const count = await service.sweepOpenSuggestions();
      expect(count).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Event payload matching contracts
  // -------------------------------------------------------------------------

  describe('event payloads match contracts', () => {
    it('suggestion.created payload matches schema', async () => {
      await service.createSuggestion(
        {
          workspace_id: 'ws-1',
          deck_id: 'deck-1',
          session_id: 'sess-1',
          author_id: 'user-1',
          target_type: 'element',
          target_id: 'el-1',
          operation: makeOp(),
        },
        'user-1',
      );

      const event = emitter.events.find((e) => e.subject === 'suggestion.created')!;
      expect(event.innerPayload).toHaveProperty('suggestion_id');
      expect(event.innerPayload).toHaveProperty('deck_id');
      expect(event.innerPayload).toHaveProperty('author_id');
      expect(event.innerPayload).toHaveProperty('target_type');
      expect(event.innerPayload).toHaveProperty('target_id');
      expect(event.innerPayload).toHaveProperty('operation');
    });

    it('suggestion.accepted payload matches schema', async () => {
      const created = await service.createSuggestion(
        {
          workspace_id: 'ws-1',
          deck_id: 'deck-1',
          session_id: 'sess-1',
          author_id: 'user-1',
          target_type: 'element',
          target_id: 'el-1',
          operation: makeOp(),
        },
        'user-1',
      );

      await service.acceptSuggestion(created.id, 'user-2', false);

      const event = emitter.events.find((e) => e.subject === 'suggestion.accepted')!;
      expect(event.innerPayload).toHaveProperty('suggestion_id');
      expect(event.innerPayload).toHaveProperty('deck_id');
      expect(event.innerPayload).toHaveProperty('accepted_by');
    });

    it('suggestion.rejected payload matches schema', async () => {
      const created = await service.createSuggestion(
        {
          workspace_id: 'ws-1',
          deck_id: 'deck-1',
          session_id: 'sess-1',
          author_id: 'user-1',
          target_type: 'element',
          target_id: 'el-1',
          operation: makeOp(),
        },
        'user-1',
      );

      await service.rejectSuggestion(created.id, 'user-2', 'not good');

      const event = emitter.events.find((e) => e.subject === 'suggestion.rejected')!;
      expect(event.innerPayload).toHaveProperty('suggestion_id');
      expect(event.innerPayload).toHaveProperty('deck_id');
      expect(event.innerPayload).toHaveProperty('rejected_by');
      expect(event.innerPayload).toHaveProperty('reason');
    });

    it('suggestion.obsolete payload matches schema', async () => {
      const s1 = await service.createSuggestion(
        {
          workspace_id: 'ws-1',
          deck_id: 'deck-1',
          session_id: 'sess-1',
          author_id: 'user-1',
          target_type: 'element',
          target_id: 'el-1',
          operation: makeOp({ after_state: { x: 10 } }),
        },
        'user-1',
      );

      await service.createSuggestion(
        {
          workspace_id: 'ws-1',
          deck_id: 'deck-1',
          session_id: 'sess-1',
          author_id: 'user-2',
          target_type: 'element',
          target_id: 'el-1',
          operation: makeOp({ after_state: { x: 20 } }),
        },
        'user-2',
      );

      await service.acceptSuggestion(s1.id, 'user-3', false);

      const obsoleteEvent = emitter.events.find((e) => e.subject === 'suggestion.obsolete');
      expect(obsoleteEvent).toBeDefined();
      expect(obsoleteEvent!.innerPayload).toHaveProperty('suggestion_id');
      expect(obsoleteEvent!.innerPayload).toHaveProperty('deck_id');
      expect(obsoleteEvent!.innerPayload).toHaveProperty('reason');
    });
  });
});
