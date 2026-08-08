/**
 * @domio/protocol — audience envelope types.
 *
 * Phase 16 W1. Mirrors `contracts/proto/domio/v1/audience.proto` in
 * TypeScript. The wire format is JSON for the Phase 16 PWA; the Go
 * WS gateway uses the proto-defined binary form for high-throughput
 * channels (polls, quiz ticks).
 *
 * The envelope is intentionally minimal — every audience action flows
 * through it so the gateway can apply consistent auth, replay, and
 * rate-limiting. Higher-level frames (poll, quiz, qa, word-cloud)
 * extend the envelope via discriminated `kind` payloads.
 */

export type AudienceEnvelopeKind =
  | 'hello'
  | 'welcome'
  | 'heartbeat'
  | 'presence_join'
  | 'presence_leave'
  | 'poll_vote'
  | 'poll_close'
  | 'word_cloud_submit'
  | 'qa_submit'
  | 'qa_upvote'
  | 'quiz_answer'
  | 'reaction'
  | 'nav_vote'
  | 'sentiment_vote'
  | 'raise_hand'
  | 'error';

export interface AudienceEnvelopeBase {
  readonly kind: AudienceEnvelopeKind;
  /** HLC timestamp assigned by the sender. */
  readonly ts_ms: number;
  /** Stable per-session participant id. */
  readonly participant_id: string;
  /** Idempotency key — replays with the same key are coalesced. */
  readonly idempotency_key: string;
  /** Session code from /j/<code>. */
  readonly session_code: string;
}

export interface HelloFrame extends AudienceEnvelopeBase {
  readonly kind: 'hello';
  readonly display_name: string;
  readonly locale: string;
}

export interface WelcomeFrame extends AudienceEnvelopeBase {
  readonly kind: 'welcome';
  readonly server_ts_ms: number;
  readonly session_metadata: Record<string, unknown>;
}

export interface HeartbeatFrame extends AudienceEnvelopeBase {
  readonly kind: 'heartbeat';
}

export interface PresenceJoinFrame extends AudienceEnvelopeBase {
  readonly kind: 'presence_join';
}

export interface PresenceLeaveFrame extends AudienceEnvelopeBase {
  readonly kind: 'presence_leave';
}

export interface PollVoteFrame extends AudienceEnvelopeBase {
  readonly kind: 'poll_vote';
  readonly poll_id: string;
  readonly option_id: string;
}

export interface PollCloseFrame extends AudienceEnvelopeBase {
  readonly kind: 'poll_close';
  readonly poll_id: string;
}

export interface WordCloudSubmitFrame extends AudienceEnvelopeBase {
  readonly kind: 'word_cloud_submit';
  readonly text: string;
}

export interface QaSubmitFrame extends AudienceEnvelopeBase {
  readonly kind: 'qa_submit';
  readonly question: string;
}

export interface QaUpvoteFrame extends AudienceEnvelopeBase {
  readonly kind: 'qa_upvote';
  readonly question_id: string;
}

export interface QuizAnswerFrame extends AudienceEnvelopeBase {
  readonly kind: 'quiz_answer';
  readonly question_id: string;
  readonly option_id: string;
  /** Client-side answer time, ms since question open. */
  readonly answer_latency_ms: number;
}

export interface ReactionFrame extends AudienceEnvelopeBase {
  readonly kind: 'reaction';
  readonly emoji: string;
}

export interface NavVoteFrame extends AudienceEnvelopeBase {
  readonly kind: 'nav_vote';
  readonly target_slide_id: string;
}

export interface SentimentVoteFrame extends AudienceEnvelopeBase {
  readonly kind: 'sentiment_vote';
  /** -1, 0, 1. */
  readonly value: -1 | 0 | 1;
}

export interface RaiseHandFrame extends AudienceEnvelopeBase {
  readonly kind: 'raise_hand';
  readonly hand: 'up' | 'down';
}

export interface ErrorFrame {
  readonly kind: 'error';
  readonly code: string;
  readonly message: string;
  /** Optional field — only present on envelopes that triggered the error. */
  readonly idempotency_key?: string;
}

export type AudienceEnvelope =
  | HelloFrame
  | WelcomeFrame
  | HeartbeatFrame
  | PresenceJoinFrame
  | PresenceLeaveFrame
  | PollVoteFrame
  | PollCloseFrame
  | WordCloudSubmitFrame
  | QaSubmitFrame
  | QaUpvoteFrame
  | QuizAnswerFrame
  | ReactionFrame
  | NavVoteFrame
  | SentimentVoteFrame
  | RaiseHandFrame
  | ErrorFrame;

export function isAudienceEnvelope(value: unknown): value is AudienceEnvelope {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v['kind'] === 'string' &&
    typeof v['ts_ms'] === 'number' &&
    typeof v['participant_id'] === 'string' &&
    typeof v['idempotency_key'] === 'string' &&
    typeof v['session_code'] === 'string'
  );
}

/** Discriminated narrowing helper used in handlers. */
export function narrowEnvelope<K extends AudienceEnvelopeKind>(
  env: AudienceEnvelope,
  kind: K,
): Extract<AudienceEnvelope, { kind: K }> | null {
  return env.kind === kind ? (env as Extract<AudienceEnvelope, { kind: K }>) : null;
}