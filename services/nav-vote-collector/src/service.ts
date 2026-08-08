/**
 * @domio/nav-vote-collector — orchestration service.
 *
 * Phase 16 W8. Receives nav votes, dedups by idempotency key, tallies
 * per slide, and publishes to `realtime.session.{id}.nav`.
 */

import type { EdgeBus } from '@domio/edge-pubsub';
import { encode } from '@domio/edge-pubsub';
import type { NavVote, NavDirection } from './types.js';
import { NavVoteTally, type Tally } from './ring.js';

export interface NavVoteCollectorOptions {
  readonly bus: EdgeBus;
  readonly tally?: NavVoteTally;
  readonly now_ms?: () => number;
}

export interface CastInput {
  workspace_id: string;
  session_id: string;
  slide_id: string;
  participant_id: string;
  direction: NavDirection;
  idempotency_key: string;
}

export class NavVoteCollector {
  private readonly bus: EdgeBus;
  private readonly tally: NavVoteTally;
  private readonly now_ms: () => number;
  private readonly seen = new Set<string>();

  constructor(opts: NavVoteCollectorOptions) {
    this.bus = opts.bus;
    this.tally = opts.tally ?? new NavVoteTally();
    this.now_ms = opts.now_ms ?? (() => Date.now());
  }

  async cast(input: CastInput): Promise<NavVote> {
    const vote: NavVote = {
      workspace_id: input.workspace_id,
      session_id: input.session_id,
      slide_id: input.slide_id,
      participant_id: input.participant_id,
      direction: input.direction,
      voted_at_ms: this.now_ms(),
      idempotency_key: input.idempotency_key,
    };
    if (this.seen.has(input.idempotency_key)) return vote;
    this.seen.add(input.idempotency_key);
    this.tally.add({
      participant_id: input.slide_id,
      direction: input.direction,
      voted_at_ms: vote.voted_at_ms,
    });
    await this.bus.publish({
      session_id: input.session_id,
      topic: 'nav',
      payload: encode({ kind: 'nav_vote', slide_id: input.slide_id, direction: input.direction }),
    });
    return vote;
  }

  currentTally(slide_id: string): Tally {
    return this.tally.tally(slide_id, this.now_ms());
  }
}
