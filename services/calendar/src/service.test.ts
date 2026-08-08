/**
 * Calendar service tests (Phase 18 W3).
 *
 * Tests create/list/delete/sync lifecycle, presenter today view, feature flag guard.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { CalendarService } from './service.js';
import { InMemoryCalendarStore } from './store/mem_store.js';
import { FeatureDisabledError, DuplicateCalendarLinkError, CalendarLinkNotFoundError, CalendarValidationError } from './types.js';
import type { CalendarLinkInput, CalendarEventEmitter, SyncProvider, CalendarEventState } from './types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeInput(overrides?: Partial<CalendarLinkInput>): CalendarLinkInput {
  return {
    deck_id: 'deck-001',
    vendor: 'google',
    event_id: 'evt-123',
    event_start_at: '2026-08-15T10:00:00Z',
    is_recurring: false,
    recurrence_id: null,
    ...overrides,
  };
}

function createEmitter(): CalendarEventEmitter & { events: Array<{ subject: string; payload: Record<string, unknown> }> } {
  const events: Array<{ subject: string; payload: Record<string, unknown> }> = [];
  return {
    events,
    async publish(subject: string, payload: Record<string, unknown>) {
      events.push({ subject, payload });
    },
  };
}

function createSyncProvider(overrides?: Partial<SyncProvider>): SyncProvider & { pullResult: CalendarEventState | null } {
  const state = { pullResult: null as CalendarEventState | null };
  return {
    get pullResult() { return state.pullResult; },
    set pullResult(v: CalendarEventState | null) { state.pullResult = v; },
    async pushEvent() { /* noop */ },
    async pullEvent() { return state.pullResult; },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CalendarService', () => {
  let store: InMemoryCalendarStore;
  let emitter: ReturnType<typeof createEmitter>;
  let syncProvider: ReturnType<typeof createSyncProvider>;
  let service: CalendarService;

  beforeEach(() => {
    store = new InMemoryCalendarStore();
    emitter = createEmitter();
    syncProvider = createSyncProvider();
    service = new CalendarService({
      store,
      eventEmitter: emitter,
      syncProvider,
      now: () => new Date('2026-08-15T09:00:00Z'),
    });
  });

  // -------------------------------------------------------------------------
  // createLink
  // -------------------------------------------------------------------------

  describe('createLink', () => {
    it('creates a link with valid input', async () => {
      const link = await service.createLink(makeInput(), 'user-001', 'ws-001');
      expect(link.vendor).toBe('google');
      expect(link.deck_id).toBe('deck-001');
      expect(link.event_id).toBe('evt-123');
    });

    it('emits calendar.event_linked event', async () => {
      await service.createLink(makeInput(), 'user-001', 'ws-001');
      expect(emitter.events).toHaveLength(1);
      expect(emitter.events[0]!.subject).toBe('calendar.event_linked');
      expect(emitter.events[0]!.payload.event_type).toBe('calendar.event_linked');
      expect(emitter.events[0]!.payload.payload).toEqual(
        expect.objectContaining({
          vendor: 'google',
          event_id: 'evt-123',
        }),
      );
    });

    it('throws DuplicateCalendarLinkError for duplicate', async () => {
      await service.createLink(makeInput(), 'user-001', 'ws-001');
      await expect(service.createLink(makeInput(), 'user-001', 'ws-001'))
        .rejects.toThrow(DuplicateCalendarLinkError);
    });

    it('throws CalendarValidationError for invalid input', async () => {
      await expect(service.createLink(makeInput({ event_id: '' }), 'user-001', 'ws-001'))
        .rejects.toThrow(CalendarValidationError);
    });

    it('creates recurring link when recurrence_id provided', async () => {
      const input = makeInput({
        is_recurring: true,
        recurrence_id: 'rrule-001',
      });
      const link = await service.createLink(input, 'user-001', 'ws-001');
      expect(link.is_recurring).toBe(true);
      expect(link.recurrence_id).toBe('rrule-001');
    });

    it('throws CalendarValidationError for recurring without recurrence_id', async () => {
      const input = makeInput({
        is_recurring: true,
        recurrence_id: null,
      });
      await expect(service.createLink(input, 'user-001', 'ws-001'))
        .rejects.toThrow(CalendarValidationError);
    });
  });

  // -------------------------------------------------------------------------
  // listLinks
  // -------------------------------------------------------------------------

  describe('listLinks', () => {
    it('returns links for a deck', async () => {
      await service.createLink(makeInput(), 'user-001', 'ws-001');
      await service.createLink(makeInput({ event_id: 'evt-456' }), 'user-001', 'ws-001');
      const links = await service.listLinks('deck-001');
      expect(links).toHaveLength(2);
    });

    it('returns empty for deck with no links', async () => {
      const links = await service.listLinks('deck-999');
      expect(links).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // deleteLink
  // -------------------------------------------------------------------------

  describe('deleteLink', () => {
    it('deletes an existing link', async () => {
      const link = await service.createLink(makeInput(), 'user-001', 'ws-001');
      await service.deleteLink(link.id);
      const links = await service.listLinks('deck-001');
      expect(links).toHaveLength(0);
    });

    it('throws CalendarLinkNotFoundError for nonexistent link', async () => {
      await expect(service.deleteLink('nonexistent'))
        .rejects.toThrow(CalendarLinkNotFoundError);
    });
  });

  // -------------------------------------------------------------------------
  // syncLink
  // -------------------------------------------------------------------------

  describe('syncLink', () => {
    it('returns link unchanged when not due', async () => {
      const link = await service.createLink(makeInput(), 'user-001', 'ws-001');
      // Use a service with clock at 09:04 (4 min < 5 min threshold)
      const laterService = new CalendarService({
        store,
        eventEmitter: emitter,
        syncProvider,
        now: () => new Date('2026-08-15T09:04:00Z'),
      });
      const synced = await laterService.syncLink(link.id);
      expect(synced.last_synced_at).toEqual(link.last_synced_at);
    });

    it('pulls and pushes when due', async () => {
      const link = await service.createLink(makeInput(), 'user-001', 'ws-001');
      // Use a service with clock at 09:06 (6 min >= 5 min threshold)
      syncProvider.pullResult = {
        event_id: 'evt-123',
        event_start_at: new Date('2026-08-15T10:00:00Z'),
      };
      const laterService = new CalendarService({
        store,
        eventEmitter: emitter,
        syncProvider,
        now: () => new Date('2026-08-15T09:06:00Z'),
      });

      const synced = await laterService.syncLink(link.id);
      expect(synced.last_synced_at).toEqual(new Date('2026-08-15T09:06:00Z'));
      expect(emitter.events).toHaveLength(2); // event_linked + event_updated
      expect(emitter.events[1]!.subject).toBe('calendar.event_updated');
    });

    it('throws CalendarLinkNotFoundError for nonexistent link', async () => {
      await expect(service.syncLink('nonexistent'))
        .rejects.toThrow(CalendarLinkNotFoundError);
    });
  });

  // -------------------------------------------------------------------------
  // getPresenterTodayView
  // -------------------------------------------------------------------------

  describe('getPresenterTodayView', () => {
    it('returns today events sorted by time', async () => {
      await service.createLink(
        makeInput({ event_start_at: '2026-08-15T14:00:00Z' }),
        'user-001',
        'ws-001',
      );
      await service.createLink(
        makeInput({ event_id: 'evt-456', event_start_at: '2026-08-15T10:00:00Z' }),
        'user-001',
        'ws-001',
      );

      const items = await service.getPresenterTodayView('user-001');
      expect(items).toHaveLength(2);
      expect(items[0]!.event_start_at.getTime()).toBeLessThan(items[1]!.event_start_at.getTime());
    });

    it('excludes events not today', async () => {
      await service.createLink(
        makeInput({ event_start_at: '2026-08-16T10:00:00Z' }),
        'user-001',
        'ws-001',
      );

      const items = await service.getPresenterTodayView('user-001');
      expect(items).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // shouldPrompt
  // -------------------------------------------------------------------------

  describe('shouldPrompt', () => {
    it('returns true when now is within prompt window', async () => {
      const link = await service.createLink(
        makeInput({ event_start_at: '2026-08-15T10:00:00Z' }),
        'user-001',
        'ws-001',
      );
      const now = new Date('2026-08-15T09:58:00Z'); // 2 minutes before
      expect(service.shouldPrompt(link, now)).toBe(true);
    });

    it('returns false when now is before prompt window', async () => {
      const link = await service.createLink(
        makeInput({ event_start_at: '2026-08-15T10:00:00Z' }),
        'user-001',
        'ws-001',
      );
      const now = new Date('2026-08-15T09:54:00Z'); // 6 minutes before
      expect(service.shouldPrompt(link, now)).toBe(false);
    });

    it('returns false when now is after event start', async () => {
      const link = await service.createLink(
        makeInput({ event_start_at: '2026-08-15T10:00:00Z' }),
        'user-001',
        'ws-001',
      );
      const now = new Date('2026-08-15T10:01:00Z'); // 1 minute after
      expect(service.shouldPrompt(link, now)).toBe(false);
    });

    it('returns true at exactly event start', async () => {
      const link = await service.createLink(
        makeInput({ event_start_at: '2026-08-15T10:00:00Z' }),
        'user-001',
        'ws-001',
      );
      const now = new Date('2026-08-15T10:00:00Z');
      expect(service.shouldPrompt(link, now)).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Feature flag
  // -------------------------------------------------------------------------

  describe('feature flag', () => {
    it('throws FeatureDisabledError when feature is disabled', async () => {
      process.env['FEATURE_COLLAB_INTEGRATIONS_CALENDAR_DISABLED'] = 'true';
      try {
        await expect(service.createLink(makeInput(), 'user-001', 'ws-001'))
          .rejects.toThrow(FeatureDisabledError);
      } finally {
        delete process.env['FEATURE_COLLAB_INTEGRATIONS_CALENDAR_DISABLED'];
      }
    });
  });
});
