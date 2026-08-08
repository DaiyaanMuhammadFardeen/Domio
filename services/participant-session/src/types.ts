/**
 * @domio/participant-session — domain types.
 *
 * Phase 16 W1. Mirrors the surface of `@domio/presenter-session` but
 * for the AUDIENCE side. The presenter owns a single row in
 * `presenter_session`; the participant owns a single row in
 * `participant_session`. Engagement (polls, qa, quiz) rows hang off
 * the participant_session_id.
 *
 * Lifecycle states:
 *   - joined     — gateway has accepted the participant
 *   - active     — recent heartbeat (within ttl)
 *   - idle       — heartbeat aged beyond soft ttl but not yet reclaimed
 *   - left       — graceful disconnect
 *   - reaped     — reaped by the janitor after hard ttl
 *   - kicked     — moderator removed the participant
 */

import type { AudienceSnapshot, ParticipantId, SessionCode, ShardCoordinate } from '@domio/audience-service';

export type ParticipantState =
  | 'joined'
  | 'active'
  | 'idle'
  | 'left'
  | 'reaped'
  | 'kicked';

export interface ParticipantSession {
  readonly id: string;
  readonly session_id: string;
  readonly session_code: SessionCode;
  readonly workspace_id: string;
  readonly participant_id: ParticipantId;
  readonly state: ParticipantState;
  readonly display_name: string;
  readonly locale: string;
  readonly fingerprint_hash: string | null;
  readonly shard_index: number;
  /** Optimistic concurrency token. */
  readonly version: number;
  readonly joined_at: string;
  readonly last_seen_at: string;
  readonly left_at: string | null;
  /** Counter incremented when a moderator kicks the participant. */
  readonly kick_count: number;
  /** Per-participant rate-limit token bucket state. */
  readonly rate_bucket: RateBucket;
}

export interface RateBucket {
  /** Tokens remaining in the bucket. */
  readonly tokens: number;
  /** Tokens added per second. */
  readonly refill_per_s: number;
  /** Bucket capacity. */
  readonly capacity: number;
  /** When the bucket was last refilled (ms epoch). */
  readonly last_refill_ms: number;
}

export interface JoinInput {
  readonly session_code: SessionCode;
  readonly workspace_id: string;
  readonly participant_id: ParticipantId;
  readonly display_name: string;
  readonly locale: string;
  readonly fingerprint_hash?: string | null;
  readonly idempotency_key?: string;
}

export interface JoinResult {
  readonly session: ParticipantSession;
  readonly bundle: AudienceSnapshot;
  /** Echoed back when the request was idempotently replayed. */
  readonly idempotent_replay: ParticipantSession | null;
}

export interface HeartbeatInput {
  readonly session_id: string;
  readonly participant_id: ParticipantId;
  readonly idempotency_key?: string;
}

export interface LeaveInput {
  readonly session_id: string;
  readonly participant_id: ParticipantId;
  readonly reason: 'user_action' | 'socket_timeout' | 'session_ended' | 'moderator_kick' | 'rate_limit';
  readonly idempotency_key?: string;
}

export interface ListActiveInput {
  /** Filter by presenter session. */
  readonly session_id?: string;
  /** Filter by workspace. */
  readonly workspace_id: string;
  /** When set, only return participants joined at or after this HLC. */
  readonly since_ms?: number;
  /** Pagination cursor. */
  readonly cursor?: string;
  /** Max items per page. */
  readonly limit?: number;
}

export interface ListActiveResult {
  readonly items: ReadonlyArray<ParticipantSession>;
  readonly next_cursor: string | null;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class ParticipantSessionError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
    this.name = 'ParticipantSessionError';
  }
}

export class ParticipantNotFoundError extends ParticipantSessionError {
  constructor(id: string) {
    super(404, 'PARTICIPANT_NOT_FOUND', `participant ${id} not found`);
    this.name = 'ParticipantNotFoundError';
  }
}

export class ParticipantAlreadyJoinedError extends ParticipantSessionError {
  constructor(id: string) {
    super(409, 'PARTICIPANT_ALREADY_JOINED', `participant ${id} already joined`);
    this.name = 'ParticipantAlreadyJoinedError';
  }
}

export class ParticipantSessionEndedError extends ParticipantSessionError {
  constructor(id: string) {
    super(410, 'PRESENTER_SESSION_ENDED', `presenter session for ${id} has ended`);
    this.name = 'ParticipantSessionEndedError';
  }
}

export class ParticipantValidationError extends ParticipantSessionError {
  constructor(detail: string) {
    super(400, 'VALIDATION', detail);
    this.name = 'ParticipantValidationError';
  }
}

export class ParticipantConflictError extends ParticipantSessionError {
  constructor(detail: string) {
    super(409, 'CONFLICT', detail);
    this.name = 'ParticipantConflictError';
  }
}

export function validateJoinInput(input: JoinInput): void {
  if (!input.session_code || input.session_code.length < 5) {
    throw new ParticipantValidationError('session_code is required');
  }
  if (!input.workspace_id) {
    throw new ParticipantValidationError('workspace_id is required');
  }
  if (!input.participant_id) {
    throw new ParticipantValidationError('participant_id is required');
  }
  if (!input.display_name || input.display_name.length === 0 || input.display_name.length > 64) {
    throw new ParticipantValidationError('display_name must be 1..64 chars');
  }
  if (!input.locale || input.locale.length < 2 || input.locale.length > 16) {
    throw new ParticipantValidationError('locale must be 2..16 chars');
  }
}

export function shardCoordinate(
  session_code: SessionCode,
  shard_index: number,
): ShardCoordinate {
  return { session_code, shard_index };
}