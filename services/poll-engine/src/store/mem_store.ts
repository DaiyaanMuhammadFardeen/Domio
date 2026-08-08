/**
 * @domio/poll-engine — in-memory store.
 *
 * Phase 16 W4. Holds polls + votes in a Map. Optimistic concurrency
 * enforced via expected_version checks. Vote uniqueness enforced via
 * a (poll_id, participant_id) index.
 */

import type { Poll, PollVote, PollAggregate } from '../types.js';
import {
  type PollStore,
  type CreatePollRow,
  type UpdatePollRow,
  type CastVoteRow,
  conflictError,
  closedError,
  duplicateVoteError,
  notFoundError,
} from '../store.js';

export class InMemoryPollStore implements PollStore {
  private readonly polls = new Map<string, Poll>();
  private readonly votes = new Map<string, PollVote>();
  private readonly voteIndex = new Map<string, string>(); // poll_id::participant_id -> vote_id

  private voteKey(poll_id: string, participant_id: string): string {
    return `${poll_id}::${participant_id}`;
  }

  async create(row: CreatePollRow): Promise<Poll> {
    if (this.polls.has(row.poll.id)) {
      throw conflictError(row.poll.id, -1);
    }
    this.polls.set(row.poll.id, row.poll);
    return row.poll;
  }

  async getById(id: string): Promise<Poll | null> {
    return this.polls.get(id) ?? null;
  }

  async update(row: UpdatePollRow): Promise<Poll> {
    const existing = this.polls.get(row.poll_id);
    if (!existing) throw notFoundError(row.poll_id);
    if (existing.version !== row.expected_version) {
      throw conflictError(row.poll_id, existing.version);
    }
    this.polls.set(row.poll_id, row.next);
    return row.next;
  }

  async castVote(row: CastVoteRow): Promise<PollVote> {
    const poll = this.polls.get(row.vote.poll_id);
    if (!poll) throw notFoundError(row.vote.poll_id);
    if (poll.status !== 'open') throw closedError(poll.id);
    const k = this.voteKey(poll.id, row.vote.participant_id);
    if (this.voteIndex.has(k)) throw duplicateVoteError(row.vote.participant_id);
    this.votes.set(row.vote.id, row.vote);
    this.voteIndex.set(k, row.vote.id);
    return row.vote;
  }

  async aggregate(poll_id: string): Promise<PollAggregate> {
    const poll = this.polls.get(poll_id);
    if (!poll) throw notFoundError(poll_id);
    const counts = new Array<number>(poll.options.length).fill(0);
    let total = 0;
    for (const v of this.votes.values()) {
      if (v.poll_id !== poll_id) continue;
      if (v.option_index >= 0 && v.option_index < counts.length) {
        counts[v.option_index] = (counts[v.option_index] ?? 0) + 1;
      }
      total += 1;
    }
    return { poll_id, counts, total, computed_at_ms: Date.now() };
  }

  async listBySession(input: { workspace_id: string; session_id: string }): Promise<ReadonlyArray<Poll>> {
    const out: Poll[] = [];
    for (const p of this.polls.values()) {
      if (p.workspace_id === input.workspace_id && p.session_id === input.session_id) out.push(p);
    }
    return out;
  }
}
