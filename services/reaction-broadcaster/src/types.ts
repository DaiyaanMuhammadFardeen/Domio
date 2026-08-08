/**
 * @domio/reaction-broadcaster — domain types.
 *
 * Phase 16 W8. Reactions are short, ephemeral — clients burst-emoji the
 * current slide and the broadcaster fans them out to the audience
 * topic. There's no persistent record beyond what the join-web stores
 * locally; the broadcaster is a pure fan-out.
 */

export interface ReactionEvent {
  readonly workspace_id: string;
  readonly session_id: string;
  readonly slide_id: string;
  readonly participant_id: string;
  readonly emoji: string;
  readonly posted_at_ms: number;
  readonly idempotency_key: string;
}

export class ReactionError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'ReactionError';
  }
}
