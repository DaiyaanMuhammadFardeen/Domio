/**
 * @domio/sentiment-collector — domain types.
 *
 * Phase 16 W8. Audience rates each slide on a -2..+2 scale. Recap
 * surfaces the running average per slide as a sparkline.
 */

export type SentimentScore = -2 | -1 | 0 | 1 | 2;

export interface SentimentVote {
  readonly workspace_id: string;
  readonly session_id: string;
  readonly slide_id: string;
  readonly participant_id: string;
  readonly score: SentimentScore;
  readonly voted_at_ms: number;
  readonly idempotency_key: string;
}

export interface SentimentSummary {
  readonly slide_id: string;
  readonly count: number;
  readonly average: number;
  readonly by_score: Readonly<Record<SentimentScore, number>>;
}

export class SentimentError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'SentimentError';
  }
}
