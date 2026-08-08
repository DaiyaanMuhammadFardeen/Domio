/**
 * @domio/sentiment-collector — orchestration service.
 *
 * Phase 16 W8. Records sentiment votes per (slide, participant) and
 * publishes to `realtime.session.{id}.sentiment`.
 */

import type { EdgeBus } from '@domio/edge-pubsub';
import { encode } from '@domio/edge-pubsub';
import type { SentimentVote, SentimentScore, SentimentSummary } from './types.js';
import { SentimentTally } from './tally.js';

export interface SentimentCollectorOptions {
  readonly bus: EdgeBus;
  readonly tally?: SentimentTally;
  readonly now_ms?: () => number;
}

export interface CastInput {
  workspace_id: string;
  session_id: string;
  slide_id: string;
  participant_id: string;
  score: SentimentScore;
  idempotency_key: string;
}

export class SentimentCollector {
  private readonly bus: EdgeBus;
  private readonly tally: SentimentTally;
  private readonly now_ms: () => number;
  private readonly seen = new Set<string>();

  constructor(opts: SentimentCollectorOptions) {
    this.bus = opts.bus;
    this.tally = opts.tally ?? new SentimentTally();
    this.now_ms = opts.now_ms ?? (() => Date.now());
  }

  async cast(input: CastInput): Promise<SentimentVote> {
    const vote: SentimentVote = {
      workspace_id: input.workspace_id,
      session_id: input.session_id,
      slide_id: input.slide_id,
      participant_id: input.participant_id,
      score: input.score,
      voted_at_ms: this.now_ms(),
      idempotency_key: input.idempotency_key,
    };
    if (this.seen.has(input.idempotency_key)) return vote;
    this.seen.add(input.idempotency_key);
    this.tally.add(input.slide_id, input.participant_id, input.score);
    await this.bus.publish({
      session_id: input.session_id,
      topic: 'sentiment',
      payload: encode({ kind: 'sentiment_vote', slide_id: input.slide_id, score: input.score }),
    });
    return vote;
  }

  summary(slide_id: string): SentimentSummary {
    return this.tally.summary(slide_id);
  }
}
