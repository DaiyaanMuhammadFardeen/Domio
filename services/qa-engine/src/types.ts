/**
 * @domio/qa-engine — domain types.
 *
 * Phase 16 W6. Threads are optional groupings; submits can belong to a
 * thread or be top-level. Upvotes de-duplicate per (submit_id, voter_id).
 * `defer_to_parking_lot` exposes the P15 W9 hook.
 */

export type QaThreadStatus = 'open' | 'answered' | 'deferred' | 'archived';
export type ModerationDecision = 'allow' | 'flag' | 'block';

export interface QaThread {
  readonly id: string;
  readonly workspace_id: string;
  readonly session_id: string;
  readonly widget_id: string;
  readonly status: QaThreadStatus;
  readonly created_by: string;
  readonly created_at_ms: number;
  readonly version: number;
}

export interface QaSubmit {
  readonly id: string;
  readonly workspace_id: string;
  readonly session_id: string;
  readonly thread_id: string | null;
  readonly participant_id: string;
  readonly body: string;
  readonly moderation: ModerationDecision | null;
  readonly upvotes: number;
  readonly submitted_at_ms: number;
  readonly idempotency_key: string;
}

export interface QaUpvote {
  readonly submit_id: string;
  readonly participant_id: string;
  readonly workspace_id: string;
  readonly upvoted_at_ms: number;
}

export class QaError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'QaError';
  }
}
