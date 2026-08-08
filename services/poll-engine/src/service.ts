/**
 * @domio/poll-engine — orchestration service.
 *
 * Phase 16 W4. Coordinates poll creation, status transitions, and vote
 * casting. Wraps the store + audit emitter + idempotency store + bus.
 * Posts lifecycle events to `realtime.session.{id}.poll`.
 */

import type { EdgeBus } from '@domio/edge-pubsub';
import { encode, topicFor } from '@domio/edge-pubsub';
import { type Poll, PollEngineError, type PollVote, type PollAggregate } from './types.js';
import { type PollStore, isPollStore, closedError, notFoundError } from './store.js';
import { type IdempotencyStore, InMemoryIdempotencyStore } from './idempotency/index.js';
import {
  type PollAuditEmitter,
  type PollAuditEvent,
} from './audit/emit.js';
import { type PollEngineMetrics, NullPollEngineMetrics } from './observability/metrics.js';
import type { JsonObject } from '@domio/audit-ts';

export interface PollEngineOptions {
  readonly store: PollStore;
  readonly bus: EdgeBus;
  readonly idempotency?: IdempotencyStore | undefined;
  readonly audit: PollAuditEmitter;
  readonly metrics?: PollEngineMetrics | undefined;
  readonly now_ms?: () => number;
  readonly id_factory?: () => string;
}

export interface CreatePollInput {
  workspace_id: string;
  session_id: string;
  widget_id: string;
  question: string;
  options: ReadonlyArray<{ label: string }>;
  opens_at_ms?: number | null;
  closes_at_ms?: number | null;
  results_visible?: boolean;
  created_by: string;
}

export interface CastVoteInput {
  workspace_id: string;
  poll_id: string;
  participant_id: string;
  option_index: number;
  idempotency_key: string;
}

export class PollEngine {
  private readonly store: PollStore;
  private readonly bus: EdgeBus;
  private readonly idem: IdempotencyStore;
  private readonly audit: PollAuditEmitter;
  private readonly metrics: PollEngineMetrics;
  private readonly now_ms: () => number;
  private readonly id_factory: () => string;

  constructor(opts: PollEngineOptions) {
    if (!isPollStore(opts.store)) {
      throw new Error('PollEngine: store is required');
    }
    this.store = opts.store;
    this.bus = opts.bus;
    this.idem = opts.idempotency ?? new InMemoryIdempotencyStore();
    this.audit = opts.audit;
    this.metrics = opts.metrics ?? new NullPollEngineMetrics();
    this.now_ms = opts.now_ms ?? (() => Date.now());
    this.id_factory = opts.id_factory ?? (() => cryptoRandomId());
  }

  async create(input: CreatePollInput): Promise<Poll> {
    if (input.options.length < 2) {
      throw new PollEngineError('OPTIONS', 'poll requires at least 2 options');
    }
    const id = this.id_factory();
    const ts = this.now_ms();
    const poll: Poll = {
      id,
      workspace_id: input.workspace_id,
      session_id: input.session_id,
      widget_id: input.widget_id,
      question: input.question,
      options: input.options.map((o, i) => ({ index: i, label: o.label })),
      status: 'draft',
      opens_at_ms: input.opens_at_ms ?? null,
      closes_at_ms: input.closes_at_ms ?? null,
      results_visible: input.results_visible ?? false,
      created_by: input.created_by,
      created_at_ms: ts,
      updated_at_ms: ts,
      version: 1,
    };
    const created = await this.store.create({ poll });
    await this.emitAudit({
      actor_id: input.created_by,
      poll_id: created.id,
      workspace_id: created.workspace_id,
      session_id: created.session_id,
      ts,
      action: 'poll.create',
      after: pollToJson(created),
    });
    this.metrics.polls_created.inc(1, { workspace_id: created.workspace_id });
    return created;
  }

  async open(poll_id: string, expected_version: number, actor_id: string): Promise<Poll> {
    const current = await this.store.getById(poll_id);
    if (!current) throw notFoundError(poll_id);
    if (current.status !== 'draft') throw closedError(poll_id);
    const ts = this.now_ms();
    const next: Poll = { ...current, status: 'open', updated_at_ms: ts, version: current.version + 1 };
    const updated = await this.store.update({ poll_id, expected_version, next });
    await this.emitAudit({
      actor_id,
      poll_id,
      workspace_id: updated.workspace_id,
      session_id: updated.session_id,
      ts,
      action: 'poll.open',
      before: pollToJson(current),
      after: pollToJson(updated),
    });
    this.metrics.open_polls.inc(1, { workspace_id: updated.workspace_id });
    await this.bus.publish({
      session_id: updated.session_id,
      topic: 'poll',
      payload: encode({ kind: 'opened', poll_id, at_ms: ts }),
    });
    return updated;
  }

  async close(poll_id: string, expected_version: number, actor_id: string): Promise<Poll> {
    const current = await this.store.getById(poll_id);
    if (!current) throw notFoundError(poll_id);
    if (current.status !== 'open') throw closedError(poll_id);
    const ts = this.now_ms();
    const next: Poll = { ...current, status: 'closed', updated_at_ms: ts, version: current.version + 1 };
    const updated = await this.store.update({ poll_id, expected_version, next });
    await this.emitAudit({
      actor_id,
      poll_id,
      workspace_id: updated.workspace_id,
      session_id: updated.session_id,
      ts,
      action: 'poll.close',
      before: pollToJson(current),
      after: pollToJson(updated),
    });
    this.metrics.open_polls.dec(1, { workspace_id: updated.workspace_id });
    const aggregate = await this.store.aggregate(poll_id);
    await this.bus.publish({
      session_id: updated.session_id,
      topic: 'poll',
      payload: encode({ kind: 'closed', poll_id, at_ms: ts, aggregate }),
    });
    return updated;
  }

  async castVote(input: CastVoteInput): Promise<PollVote> {
    const start = this.now_ms();
    const idem = await this.idem.reserve({
      key: input.idempotency_key,
      workspace_id: input.workspace_id,
      poll_id: input.poll_id,
      ttl_ms: 24 * 60 * 60 * 1000,
    });
    if (idem.exists && idem.prior) {
      return idem.prior.response as PollVote;
    }
    const poll = await this.store.getById(input.poll_id);
    if (!poll) throw notFoundError(input.poll_id);
    if (input.option_index < 0 || input.option_index >= poll.options.length) {
      throw new PollEngineError('OPTION', `option_index ${input.option_index} out of range`);
    }
    const vote: PollVote = {
      id: this.id_factory(),
      workspace_id: input.workspace_id,
      session_id: poll.session_id,
      poll_id: input.poll_id,
      participant_id: input.participant_id,
      option_index: input.option_index,
      cast_at_ms: this.now_ms(),
      idempotency_key: input.idempotency_key,
    };
    const stored = await this.store.castVote({ vote, expected_existing_vote: null });
    await this.idem.commit({
      key: input.idempotency_key,
      workspace_id: input.workspace_id,
      poll_id: input.poll_id,
      response: stored,
      recorded_at_ms: vote.cast_at_ms,
      ttl_ms: 24 * 60 * 60 * 1000,
    });
    await this.emitAudit({
      actor_id: input.participant_id,
      poll_id: input.poll_id,
      workspace_id: poll.workspace_id,
      session_id: poll.session_id,
      ts: vote.cast_at_ms,
      action: 'poll.vote',
      after: { option_index: vote.option_index, participant_id: vote.participant_id },
    });
    this.metrics.votes_cast.inc(1, { workspace_id: poll.workspace_id });
    this.metrics.cast_latency_ms.observe(this.now_ms() - start, { workspace_id: poll.workspace_id });
    await this.bus.publish({
      session_id: poll.session_id,
      topic: 'poll',
      payload: encode({ kind: 'vote_cast', poll_id: input.poll_id, option_index: vote.option_index }),
    });
    return stored;
  }

  async aggregate(poll_id: string): Promise<PollAggregate> {
    return this.store.aggregate(poll_id);
  }

  private async emitAudit(event: PollAuditEvent): Promise<void> {
    await this.audit.emit(event);
  }
}

function pollToJson(p: Poll): JsonObject {
  return {
    id: p.id,
    status: p.status,
    question: p.question,
    option_count: p.options.length,
    version: p.version,
    updated_at_ms: p.updated_at_ms,
  };
}

function cryptoRandomId(): string {
  // RFC 4122 v4 — cheap inline impl since crypto.randomUUID exists in
  // Node 19+ and modern browsers.
  const g: typeof globalThis & { crypto?: { randomUUID?: () => string } } = globalThis;
  if (g.crypto?.randomUUID) return g.crypto.randomUUID();
  // Fallback: 32-char hex random.
  let s = '';
  for (let i = 0; i < 32; i++) s += Math.floor(Math.random() * 16).toString(16);
  return s;
}

void topicFor;
