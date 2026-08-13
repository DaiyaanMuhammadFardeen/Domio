/**
 * @domio/session-archiver — domain types.
 *
 * Phase 16 W2. The archiver subscribes to `session.lifecycle` and
 * persists a row per session that has ended. The aggregate payload
 * contains everything the presenter recap needs to render engagement
 * widgets.
 */

import type { LifecycleEvent } from '@domio/participant-session';

export interface SessionArchive {
  readonly workspace_id: string;
  readonly session_id: string;
  readonly ended_at_ms: number;
  readonly peak_active: number;
  readonly total_participants: number;
  readonly engagement: EngagementCounts;
  readonly raw: ReadonlyArray<LifecycleEvent>;
}

export interface EngagementCounts {
  readonly poll_votes: number;
  readonly word_cloud_submits: number;
  readonly qa_submits: number;
  readonly quiz_answers: number;
  readonly reactions: number;
  readonly nav_votes: number;
  readonly sentiment_votes: number;
  readonly raise_hands: number;
}

export function emptyEngagement(): EngagementCounts {
  return {
    poll_votes: 0,
    word_cloud_submits: 0,
    qa_submits: 0,
    quiz_answers: 0,
    reactions: 0,
    nav_votes: 0,
    sentiment_votes: 0,
    raise_hands: 0,
  };
}

export class SessionArchiverError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'SessionArchiverError';
  }
}
