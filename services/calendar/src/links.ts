/**
 * Calendar link pure logic — validation and helpers (Phase 18 W3).
 *
 * No side effects; all functions are pure and testable in isolation.
 */

import type { CalendarVendor, CalendarLinkInput } from './types.js';
import { CalendarValidationError } from './types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_VENDORS: ReadonlySet<string> = new Set(['google', 'outlook', 'icloud']);

// ---------------------------------------------------------------------------
// validateCalendarLinkInput
// ---------------------------------------------------------------------------

/**
 * Validate a CalendarLinkInput. Throws CalendarValidationError on failure.
 *
 * Rules:
 *  - vendor must be one of 'google' | 'outlook' | 'icloud'
 *  - event_id must be non-empty
 *  - deck_id is required
 *  - user_id is required (passed separately from handler)
 *  - event_start_at must be a valid ISO-8601 date string
 *  - recurrence_id is required when is_recurring is true
 */
export function validateCalendarLinkInput(
  input: CalendarLinkInput,
  userId: string,
): void {
  if (!input.deck_id) {
    throw new CalendarValidationError('deck_id is required');
  }

  if (!userId) {
    throw new CalendarValidationError('user_id is required');
  }

  if (!VALID_VENDORS.has(input.vendor)) {
    throw new CalendarValidationError(
      `Invalid vendor: ${input.vendor}. Must be one of: google, outlook, icloud`,
    );
  }

  if (!input.event_id || input.event_id.trim().length === 0) {
    throw new CalendarValidationError('event_id is required');
  }

  const startDate = new Date(input.event_start_at);
  if (Number.isNaN(startDate.getTime())) {
    throw new CalendarValidationError(
      `Invalid event_start_at: ${input.event_start_at}`,
    );
  }

  if (input.is_recurring && (!input.recurrence_id || input.recurrence_id.trim().length === 0)) {
    throw new CalendarValidationError(
      'recurrence_id is required when is_recurring is true',
    );
  }
}

// ---------------------------------------------------------------------------
// buildEventStartKey
// ---------------------------------------------------------------------------

/**
 * Build a deduplication key from deck_id + vendor + event_id.
 * Used to detect duplicate calendar links.
 */
export function buildEventStartKey(
  deckId: string,
  vendor: CalendarVendor,
  eventId: string,
): string {
  return `${deckId}:${vendor}:${eventId}`;
}
