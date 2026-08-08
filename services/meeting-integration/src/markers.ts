/**
 * Meeting marker pure logic (Phase 18).
 *
 * Validation for slide transition markers during a meeting session.
 */

import { randomUUID } from 'crypto';
import type { MeetingMarker, RecordMarkerInput } from './types.js';
import { ValidationError, MeetingNotActiveError } from './types.js';

// ---------------------------------------------------------------------------
// Clock skew tolerance (2 minutes)
// ---------------------------------------------------------------------------

const CLOCK_SKEW_MS = 2 * 60 * 1000;

// ---------------------------------------------------------------------------
// RecordMarkerDeps
// ---------------------------------------------------------------------------

export interface RecordMarkerDeps {
  readonly now?: () => Date;
  /** Returns true if the meeting is currently active. Default: () => true */
  readonly isMeetingActive?: (meetingId: string, now: Date) => boolean | Promise<boolean>;
}

// ---------------------------------------------------------------------------
// recordMarkerBody
// ---------------------------------------------------------------------------

/**
 * Validates and creates a MeetingMarker.
 * - transitioned_at must not be in the future (beyond 2min clock skew)
 * - meeting must be active (injected predicate)
 * - Returns the created marker with generated id
 */
export async function recordMarkerBody(
  input: RecordMarkerInput,
  deps?: RecordMarkerDeps,
): Promise<MeetingMarker> {
  const now = deps?.now?.() ?? new Date();
  const isMeetingActive = deps?.isMeetingActive ?? (() => true);

  // Validate transitioned_at is not in the future (with clock skew tolerance)
  const maxAllowedTime = now.getTime() + CLOCK_SKEW_MS;
  if (input.transitioned_at.getTime() > maxAllowedTime) {
    throw new ValidationError(
      `transitioned_at cannot be in the future (max allowed: ${new Date(maxAllowedTime).toISOString()})`,
    );
  }

  // Validate meeting is active
  const active = await isMeetingActive(input.meeting_id, now);
  if (!active) {
    throw new MeetingNotActiveError(input.meeting_id);
  }

  return {
    id: randomUUID(),
    meeting_id: input.meeting_id,
    slide_id: input.slide_id,
    transitioned_at: input.transitioned_at,
    created_at: now,
  };
}
