/**
 * Calendar sync pure logic — sync plan, change detection, overrides (Phase 18 W3).
 *
 * No side effects; all functions are pure and testable in isolation.
 */

import type {
  CalendarLink,
  SyncPlanResult,
  SyncChangeType,
  CalendarEventState,
  OverrideProvider,
} from './types.js';
import { noopOverrideProvider } from './types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Refresh interval: 5 minutes in milliseconds. */
const SYNC_REFRESH_MS = 5 * 60 * 1000;

// ---------------------------------------------------------------------------
// syncPlan
// ---------------------------------------------------------------------------

/**
 * Determine if a link's sync is due based on last_synced_at.
 *
 * Rules:
 *  - isDue: last_synced_at is older than 5 minutes from `now`
 *  - is_recurring_instance: true when is_recurring AND recurrence_id is set
 *    (sync touches the current instance via recurrence_id, not the whole series)
 */
export function syncPlan(link: CalendarLink, now: Date): SyncPlanResult {
  const elapsed = now.getTime() - link.last_synced_at.getTime();
  const is_due = elapsed >= SYNC_REFRESH_MS;
  const is_recurring_instance = link.is_recurring && link.recurrence_id != null;

  return { is_due, is_recurring_instance };
}

// ---------------------------------------------------------------------------
// computeChangeType
// ---------------------------------------------------------------------------

/**
 * Compute the change type between a previous and next event state.
 *
 * Rules:
 *  - If prev is null → 'created'
 *  - If next.canceled is true → 'canceled'
 *  - If event_start_at or other fields differ → 'updated'
 *  - Otherwise → 'updated' (conservative default)
 */
export function computeChangeType(
  prev: CalendarEventState | null,
  next: CalendarEventState,
): SyncChangeType {
  if (prev === null) {
    return 'created';
  }

  if (next.canceled) {
    return 'canceled';
  }

  // Compare event_start_at
  const prevTime = prev.event_start_at.getTime();
  const nextTime = next.event_start_at.getTime();
  if (prevTime !== nextTime) {
    return 'updated';
  }

  // Conservative: if state exists and is non-null, treat as updated
  return 'updated';
}

// ---------------------------------------------------------------------------
// shouldSkipDueToOverride
// ---------------------------------------------------------------------------

/**
 * Check if a recurring event instance should be skipped due to an override.
 *
 * When an override exists for a recurrence instance:
 *  - If canceled: the whole instance is skipped (no sync)
 *  - Otherwise: the override takes precedence over series-level event
 */
export async function shouldSkipDueToOverride(
  overrideProvider: OverrideProvider,
  linkId: string,
  recurrenceId: string | null,
): Promise<boolean> {
  if (!recurrenceId) return false;

  const override = await overrideProvider.getInstanceOverride(linkId, recurrenceId);
  if (!override) return false;

  // If the instance is explicitly canceled, skip sync for it
  return override.canceled === true;
}

// Re-export noop for convenience
export { noopOverrideProvider };
