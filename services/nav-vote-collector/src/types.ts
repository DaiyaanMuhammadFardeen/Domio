/**
 * @domio/nav-vote-collector — domain types.
 *
 * Phase 16 W8. Audience can vote to advance the slide: `next`,
 * `previous`, or `back`. The presenter configures a threshold
 * (e.g. 5 votes within 30 seconds) and the presenter-session service
 * observes the running tally over the bus topic.
 */

export type NavDirection = 'next' | 'previous' | 'back';

export interface NavVote {
  readonly workspace_id: string;
  readonly session_id: string;
  readonly slide_id: string;
  readonly participant_id: string;
  readonly direction: NavDirection;
  readonly voted_at_ms: number;
  readonly idempotency_key: string;
}

export class NavVoteError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'NavVoteError';
  }
}
