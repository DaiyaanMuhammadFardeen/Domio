/**
 * Calendar service (Phase 18 W3).
 *
 * Transport-agnostic orchestration of calendar links.
 * Depends on:
 *  - {@link CalendarStore}        — persistence.
 *  - {@link CalendarEventEmitter} — event emission (default: noopEmitter).
 *  - {@link SyncProvider}         — external sync push/pull (default: noopSyncProvider).
 *  - {@link OverrideProvider}     — per-instance overrides (default: noopOverrideProvider).
 */

import { randomUUID } from 'crypto';
import { checkFeature, FEATURE_FLAGS } from './feature_flags.js';
import { validateCalendarLinkInput } from './links.js';
import { syncPlan, computeChangeType, shouldSkipDueToOverride } from './sync.js';
import type {
  CalendarLink,
  CalendarLinkInput,
  PresenterTodayItem,
  CalendarEventEmitter,
  SyncProvider,
  OverrideProvider,
} from './types.js';
import {
  CalendarLinkNotFoundError,
  DuplicateCalendarLinkError,
} from './types.js';
import { noopEmitter, noopSyncProvider, noopOverrideProvider } from './types.js';
import type { CalendarStore } from './store/store.js';

// ---------------------------------------------------------------------------
// Service options
// ---------------------------------------------------------------------------

export interface CalendarServiceOptions {
  readonly store: CalendarStore;
  readonly eventEmitter?: CalendarEventEmitter;
  readonly syncProvider?: SyncProvider;
  readonly overrideProvider?: OverrideProvider;
  /** Clock. Default Date.now. */
  readonly now?: () => Date;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class CalendarService {
  private readonly store: CalendarStore;
  private readonly emitter: CalendarEventEmitter;
  private readonly syncProvider: SyncProvider;
  private readonly overrideProvider: OverrideProvider;
  private readonly clock: () => Date;

  constructor(opts: CalendarServiceOptions) {
    if (!opts.store) throw new Error('CalendarService: store is required');
    this.store = opts.store;
    this.emitter = opts.eventEmitter ?? noopEmitter;
    this.syncProvider = opts.syncProvider ?? noopSyncProvider;
    this.overrideProvider = opts.overrideProvider ?? noopOverrideProvider;
    this.clock = opts.now ?? (() => new Date());
  }

  private idGen(): string {
    return randomUUID();
  }

  private now(): Date {
    return this.clock();
  }

  // -------------------------------------------------------------------------
  // createLink
  // -------------------------------------------------------------------------

  async createLink(
    input: CalendarLinkInput,
    actorId: string,
    workspaceId: string,
  ): Promise<CalendarLink> {
    checkFeature(FEATURE_FLAGS.calendar);

    validateCalendarLinkInput(input, actorId);

    // Check for duplicate
    const existing = await this.store.findDuplicateLink(
      input.deck_id,
      input.vendor,
      input.event_id,
    );
    if (existing) {
      throw new DuplicateCalendarLinkError(input.deck_id, input.vendor, input.event_id);
    }

    const now = this.now();
    const link: CalendarLink = {
      id: this.idGen(),
      workspace_id: workspaceId,
      deck_id: input.deck_id,
      user_id: actorId,
      vendor: input.vendor,
      event_id: input.event_id,
      event_start_at: new Date(input.event_start_at),
      is_recurring: input.is_recurring ?? false,
      recurrence_id: input.recurrence_id ?? null,
      last_synced_at: now,
      created_at: now,
      updated_at: now,
    };

    await this.store.saveLink(link);

    // Emit calendar.event_linked
    await this.emitter.publish('calendar.event_linked', {
      event_id: this.idGen(),
      event_type: 'calendar.event_linked',
      ts_ms: now.getTime(),
      workspace_id: workspaceId,
      deck_id: input.deck_id,
      actor_id: actorId,
      actor_type: 'member',
      payload: {
        calendar_link_id: link.id,
        deck_id: input.deck_id,
        vendor: input.vendor,
        event_id: input.event_id,
      },
    });

    return link;
  }

  // -------------------------------------------------------------------------
  // listLinks
  // -------------------------------------------------------------------------

  async listLinks(deckId: string): Promise<CalendarLink[]> {
    checkFeature(FEATURE_FLAGS.calendar);
    return this.store.listLinksByDeck(deckId);
  }

  // -------------------------------------------------------------------------
  // listLinksByUser
  // -------------------------------------------------------------------------

  async listLinksByUser(userId: string): Promise<CalendarLink[]> {
    checkFeature(FEATURE_FLAGS.calendar);
    return this.store.listLinksByUser(userId);
  }

  // -------------------------------------------------------------------------
  // deleteLink
  // -------------------------------------------------------------------------

  async deleteLink(linkId: string): Promise<void> {
    checkFeature(FEATURE_FLAGS.calendar);
    const existing = await this.store.getLink(linkId);
    if (!existing) {
      throw new CalendarLinkNotFoundError(linkId);
    }
    await this.store.deleteLink(linkId);
  }

  // -------------------------------------------------------------------------
  // syncLink
  // -------------------------------------------------------------------------

  async syncLink(linkId: string): Promise<CalendarLink> {
    checkFeature(FEATURE_FLAGS.calendar);

    const link = await this.store.getLink(linkId);
    if (!link) {
      throw new CalendarLinkNotFoundError(linkId);
    }

    const now = this.now();
    const plan = syncPlan(link, now);

    // Check if we should skip due to override
    const shouldSkip = await shouldSkipDueToOverride(
      this.overrideProvider,
      link.id,
      link.recurrence_id,
    );

    if (shouldSkip) {
      // Still update last_synced_at even when skipping
      const updatedLink: CalendarLink = {
        ...link,
        last_synced_at: now,
        updated_at: now,
      };
      await this.store.saveLink(updatedLink);
      return updatedLink;
    }

    if (!plan.is_due) {
      return link;
    }

    // Pull current state from external provider
    const nextState = await this.syncProvider.pullEvent(link);

    if (nextState) {
      const changeType = computeChangeType(null, nextState);
      // Push updated state
      await this.syncProvider.pushEvent(link, nextState);

      // Emit calendar.event_updated
      await this.emitter.publish('calendar.event_updated', {
        event_id: this.idGen(),
        event_type: 'calendar.event_updated',
        ts_ms: now.getTime(),
        workspace_id: link.workspace_id,
        deck_id: link.deck_id,
        actor_id: link.user_id,
        actor_type: 'member',
        payload: {
          calendar_link_id: link.id,
          deck_id: link.deck_id,
          vendor: link.vendor,
          event_id: link.event_id,
          change_type: changeType,
        },
      });
    }

    // Update last_synced_at
    const updatedLink: CalendarLink = {
      ...link,
      last_synced_at: now,
      updated_at: now,
    };
    await this.store.saveLink(updatedLink);

    return updatedLink;
  }

  // -------------------------------------------------------------------------
  // getPresenterTodayView
  // -------------------------------------------------------------------------

  async getPresenterTodayView(userId: string): Promise<PresenterTodayItem[]> {
    checkFeature(FEATURE_FLAGS.calendar);

    const links = await this.store.listLinksByUser(userId);
    const now = this.now();

    // Filter links where event_start_at is today
    const todayItems: PresenterTodayItem[] = [];

    for (const link of links) {
      if (isSameDay(link.event_start_at, now)) {
        todayItems.push({
          deck_id: link.deck_id,
          event_id: link.event_id,
          event_start_at: link.event_start_at,
          is_recurring: link.is_recurring,
          recurrence_id: link.recurrence_id,
        });
      }
    }

    // Sort by event_start_at
    return todayItems.sort(
      (a, b) => a.event_start_at.getTime() - b.event_start_at.getTime(),
    );
  }

  // -------------------------------------------------------------------------
  // shouldPrompt (pure fn)
  // -------------------------------------------------------------------------

  /**
   * Pre-meeting prompt: returns true when `now` is within
   * [event_start_at - promptMinutesBefore, event_start_at].
   *
   * The actual notification send is a later wave (notification-dispatcher).
   */
  shouldPrompt(
    link: CalendarLink,
    now: Date,
    promptMinutesBefore: number = 5,
  ): boolean {
    const promptWindowMs = promptMinutesBefore * 60 * 1000;
    const eventStartMs = link.event_start_at.getTime();
    const promptStartMs = eventStartMs - promptWindowMs;
    const nowMs = now.getTime();

    return nowMs >= promptStartMs && nowMs <= eventStartMs;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
