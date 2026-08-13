/**
 * Calendar service — shared types and errors (Phase 18 W3).
 *
 * Types aligned to migration 0075_phase18_calendar.up.sql DDL.
 */

// ---------------------------------------------------------------------------
// CalendarVendor
// ---------------------------------------------------------------------------

export type CalendarVendor = 'google' | 'outlook' | 'icloud';

// ---------------------------------------------------------------------------
// CalendarLink (row in calendar_link table)
// ---------------------------------------------------------------------------

export interface CalendarLink {
  readonly id: string;
  readonly workspace_id: string;
  readonly deck_id: string;
  readonly user_id: string;
  readonly vendor: CalendarVendor;
  readonly event_id: string;
  readonly event_start_at: Date;
  readonly is_recurring: boolean;
  readonly recurrence_id: string | null;
  readonly last_synced_at: Date;
  readonly created_at: Date;
  readonly updated_at: Date;
}

// ---------------------------------------------------------------------------
// CalendarLinkInput (from OpenAPI)
// ---------------------------------------------------------------------------

export interface CalendarLinkInput {
  readonly deck_id: string;
  readonly vendor: CalendarVendor;
  readonly event_id: string;
  readonly event_start_at: string;
  readonly is_recurring?: boolean;
  readonly recurrence_id?: string | null;
}

// ---------------------------------------------------------------------------
// PresenterTodayItem (for getPresenterTodayView)
// ---------------------------------------------------------------------------

export interface PresenterTodayItem {
  readonly deck_id: string;
  readonly event_id: string;
  readonly event_start_at: Date;
  readonly deck_title?: string;
  readonly is_recurring: boolean;
  readonly recurrence_id: string | null;
}

// ---------------------------------------------------------------------------
// Sync types
// ---------------------------------------------------------------------------

export type SyncChangeType = 'created' | 'updated' | 'canceled';

export interface SyncPlanResult {
  readonly is_due: boolean;
  readonly is_recurring_instance: boolean;
}

export interface CalendarEventOverride {
  readonly canceled?: boolean;
}

export interface CalendarEventState {
  readonly event_id: string;
  readonly event_start_at: Date;
  readonly canceled?: boolean;
}

// ---------------------------------------------------------------------------
// SyncProvider (injected dependency)
// ---------------------------------------------------------------------------

export interface SyncProvider {
  pushEvent(link: CalendarLink, state: CalendarEventState): Promise<void>;
  pullEvent(link: CalendarLink): Promise<CalendarEventState | null>;
}

export const noopSyncProvider: SyncProvider = {
  async pushEvent(): Promise<void> {
    /* noop */
  },
  async pullEvent(): Promise<CalendarEventState | null> {
    return null;
  },
};

// ---------------------------------------------------------------------------
// OverrideProvider (injected dependency)
// ---------------------------------------------------------------------------

export interface OverrideProvider {
  getInstanceOverride(linkId: string, recurrenceId: string): Promise<CalendarEventOverride | null>;
}

export const noopOverrideProvider: OverrideProvider = {
  async getInstanceOverride(): Promise<CalendarEventOverride | null> {
    return null;
  },
};

// ---------------------------------------------------------------------------
// CalendarEventEmitter
// ---------------------------------------------------------------------------

export interface CalendarEventEmitter {
  publish(subject: string, payload: Record<string, unknown>): Promise<void>;
}

export const noopEmitter: CalendarEventEmitter = {
  async publish(): Promise<void> {
    /* drop */
  },
};

// ---------------------------------------------------------------------------
// Event envelope (must match contract schemas exactly)
// ---------------------------------------------------------------------------

export type ActorType = 'member' | 'guest' | 'agent' | 'system';

export interface CalendarEvent {
  readonly event_id: string;
  readonly event_type: string;
  readonly ts_ms: number;
  readonly workspace_id: string;
  readonly deck_id: string;
  readonly actor_id: string;
  readonly actor_type: ActorType;
  readonly payload: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class FeatureDisabledError extends Error {
  readonly code = 'FEATURE_DISABLED' as const;
  constructor(public readonly flag: string) {
    super(`Feature disabled: ${flag}`);
    this.name = 'FeatureDisabledError';
  }
}

export class CalendarLinkNotFoundError extends Error {
  readonly code = 'CALENDAR_LINK_NOT_FOUND' as const;
  constructor(public readonly id: string) {
    super(`Calendar link ${id} not found`);
    this.name = 'CalendarLinkNotFoundError';
  }
}

export class DuplicateCalendarLinkError extends Error {
  readonly code = 'DUPLICATE_CALENDAR_LINK' as const;
  constructor(deckId: string, vendor: string, eventId: string) {
    super(`Duplicate calendar link: deck ${deckId} already linked to ${vendor} event ${eventId}`);
    this.name = 'DuplicateCalendarLinkError';
  }
}

export class CalendarValidationError extends Error {
  readonly code = 'CALENDAR_VALIDATION_ERROR' as const;
  constructor(message: string) {
    super(message);
    this.name = 'CalendarValidationError';
  }
}
