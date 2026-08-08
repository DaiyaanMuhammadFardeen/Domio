/**
 * @domio/session-coordinator — domain types.
 *
 * Phase 16 W1. The coordinator is a read-path / fan-out service for
 * participant_session + session_membership. It does not own writes;
 * writes go through participant-session which writes to
 * session_membership via trigger.
 */

import type { ParticipantId, SessionCode } from '@domio/audience-service';
import type { ParticipantState } from '@domio/participant-session';

export interface MembershipRow {
  readonly workspace_id: string;
  readonly session_id: string;
  readonly participant_id: ParticipantId;
  readonly participant_session_id: string;
  readonly shard_index: number;
  readonly state: ParticipantState;
  readonly joined_at: string;
  readonly last_seen_at: string;
}

export interface SessionSummary {
  readonly workspace_id: string;
  readonly session_id: string;
  readonly session_code: SessionCode;
  readonly total_participants: number;
  readonly active_participants: number;
  readonly shards_touched: number;
  readonly last_join_at: string | null;
  readonly last_leave_at: string | null;
}

export interface ShardFanoutPlan {
  readonly session_id: string;
  readonly workspace_id: string;
  /** Shards that have at least one active participant. */
  readonly shards: ReadonlyArray<number>;
  /** Total active participants across shards. */
  readonly fanout_size: number;
}

export interface ListMembershipInput {
  readonly workspace_id: string;
  readonly session_id: string;
  readonly since_ms?: number;
  readonly cursor?: string;
  readonly limit?: number;
}

export interface ListMembershipResult {
  readonly items: ReadonlyArray<MembershipRow>;
  readonly next_cursor: string | null;
}

export class SessionCoordinatorError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
    this.name = 'SessionCoordinatorError';
  }
}

export class SessionNotFoundError extends SessionCoordinatorError {
  constructor(id: string) {
    super(404, 'SESSION_NOT_FOUND', `session ${id} not found`);
    this.name = 'SessionNotFoundError';
  }
}

export class WorkspaceMismatchError extends SessionCoordinatorError {
  constructor() {
    super(403, 'WORKSPACE_MISMATCH', 'workspace_id does not match session');
    this.name = 'WorkspaceMismatchError';
  }
}