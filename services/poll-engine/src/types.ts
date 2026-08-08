/**
 * @domio/poll-engine — domain types.
 *
 * Phase 16 W4. The poll engine owns:
 *  - draft/open/closed lifecycle of a poll widget,
 *  - per-participant vote uniqueness (one vote per participant per poll),
 *  - optimistic concurrency via `version` + If-Match etag,
 *  - audit chain (every state change),
 *  - fan-out to the audience topic `realtime.session.{id}.poll`.
 */

export type PollStatus = 'draft' | 'open' | 'closed' | 'archived';

export interface PollOption {
  readonly index: number;
  readonly label: string;
}

export interface Poll {
  readonly id: string;
  readonly workspace_id: string;
  readonly session_id: string;
  readonly widget_id: string;
  readonly question: string;
  readonly options: ReadonlyArray<PollOption>;
  readonly status: PollStatus;
  readonly opens_at_ms: number | null;
  readonly closes_at_ms: number | null;
  readonly results_visible: boolean;
  readonly created_by: string;
  readonly created_at_ms: number;
  readonly updated_at_ms: number;
  readonly version: number;
}

export interface PollVote {
  readonly id: string;
  readonly workspace_id: string;
  readonly session_id: string;
  readonly poll_id: string;
  readonly participant_id: string;
  readonly option_index: number;
  readonly cast_at_ms: number;
  readonly idempotency_key: string;
}

export interface PollAggregate {
  readonly poll_id: string;
  readonly counts: ReadonlyArray<number>; // by option_index
  readonly total: number;
  readonly computed_at_ms: number;
}

export class PollEngineError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'PollEngineError';
  }
}
