/**
 * @domio/qa-engine — orchestration service.
 *
 * Phase 16 W6. Q&A with optional threads, upvotes, and parking-lot
 * promotion. The `promote_to_parking_lot()` method emits an event on
 * `realtime.session.{id}.qa` that the presenter-session service listens
 * to in order to push the entry into its parking-lot queue.
 */

import type { EdgeBus } from '@domio/edge-pubsub';
import { encode } from '@domio/edge-pubsub';
import {
  type QaThread,
  type QaSubmit,
  type ModerationDecision,
  QaError,
} from './types.js';
import {
  type QaStore,
  isQaStore,
  notFoundError,
  tooLongError,
} from './store.js';
import { type IdempotencyStore, InMemoryIdempotencyStore } from './idempotency/index.js';
import {
  type QaAuditEmitter,
  type QaAuditEvent,
} from './audit/emit.js';
import { type QaEngineMetrics, NullQaEngineMetrics } from './observability/metrics.js';

export type QaModerator = (input: {
  workspace_id: string;
  session_id: string;
  body: string;
  participant_id: string;
}) => Promise<ModerationDecision>;

export interface QaEngineOptions {
  readonly store: QaStore;
  readonly bus: EdgeBus;
  readonly audit: QaAuditEmitter;
  readonly idempotency?: IdempotencyStore | undefined;
  readonly moderator?: QaModerator | undefined;
  readonly metrics?: QaEngineMetrics | undefined;
  readonly now_ms?: () => number;
  readonly id_factory?: () => string;
}

export interface CreateThreadInput {
  workspace_id: string;
  session_id: string;
  widget_id: string;
  created_by: string;
}

export interface SubmitInput {
  workspace_id: string;
  session_id: string;
  thread_id?: string | null;
  participant_id: string;
  body: string;
  idempotency_key: string;
  max_body_chars?: number;
}

export interface UpvoteInput {
  workspace_id: string;
  submit_id: string;
  participant_id: string;
}

const DEFAULT_MAX_BODY = 500;

export class QaEngine {
  private readonly store: QaStore;
  private readonly bus: EdgeBus;
  private readonly idem: IdempotencyStore;
  private readonly audit: QaAuditEmitter;
  private readonly moderator: QaModerator | undefined;
  private readonly metrics: QaEngineMetrics;
  private readonly now_ms: () => number;
  private readonly id_factory: () => string;

  constructor(opts: QaEngineOptions) {
    if (!isQaStore(opts.store)) {
      throw new Error('QaEngine: store is required');
    }
    this.store = opts.store;
    this.bus = opts.bus;
    this.idem = opts.idempotency ?? new InMemoryIdempotencyStore();
    this.audit = opts.audit;
    this.moderator = opts.moderator;
    this.metrics = opts.metrics ?? new NullQaEngineMetrics();
    this.now_ms = opts.now_ms ?? (() => Date.now());
    this.id_factory = opts.id_factory ?? (() => cryptoRandomId());
  }

  async createThread(input: CreateThreadInput): Promise<QaThread> {
    const id = this.id_factory();
    const ts = this.now_ms();
    const thread: QaThread = {
      id,
      workspace_id: input.workspace_id,
      session_id: input.session_id,
      widget_id: input.widget_id,
      status: 'open',
      created_by: input.created_by,
      created_at_ms: ts,
      version: 1,
    };
    const created = await this.store.createThread({ thread });
    await this.emitAudit({
      actor_id: input.created_by,
      workspace_id: created.workspace_id,
      session_id: created.session_id,
      thread_id: created.id,
      submit_id: null,
      ts,
      action: 'qa.thread.create',
      after: { id: created.id, widget_id: created.widget_id },
    });
    this.metrics.threads_created.inc(1, { workspace_id: created.workspace_id });
    return created;
  }

  async defer(thread_id: string, expected_version: number, actor_id: string): Promise<QaThread> {
    const current = await this.store.getThread(thread_id);
    if (!current) throw notFoundError(thread_id);
    const ts = this.now_ms();
    const next: QaThread = { ...current, status: 'deferred', version: current.version + 1 };
    const updated = await this.store.updateThread({ thread_id, expected_version, next });
    await this.emitAudit({
      actor_id,
      workspace_id: updated.workspace_id,
      session_id: updated.session_id,
      thread_id,
      submit_id: null,
      ts,
      action: 'qa.thread.defer',
      before: { status: current.status },
      after: { status: 'deferred' },
    });
    return updated;
  }

  async submit(input: SubmitInput): Promise<QaSubmit> {
    const start = this.now_ms();
    const idem = await this.idem.reserve({
      key: input.idempotency_key,
      workspace_id: input.workspace_id,
      session_id: input.session_id,
      ttl_ms: 24 * 60 * 60 * 1000,
    });
    if (idem.exists && idem.prior) {
      return idem.prior.response as QaSubmit;
    }
    const max = input.max_body_chars ?? DEFAULT_MAX_BODY;
    if (input.body.length > max) {
      throw tooLongError(input.body.length, max);
    }
    let moderation: ModerationDecision | null = null;
    if (this.moderator) {
      moderation = await this.moderator({
        workspace_id: input.workspace_id,
        session_id: input.session_id,
        body: input.body,
        participant_id: input.participant_id,
      });
    }
    const submit: QaSubmit = {
      id: this.id_factory(),
      workspace_id: input.workspace_id,
      session_id: input.session_id,
      thread_id: input.thread_id ?? null,
      participant_id: input.participant_id,
      body: input.body,
      moderation,
      upvotes: 0,
      submitted_at_ms: this.now_ms(),
      idempotency_key: input.idempotency_key,
    };
    const stored = await this.store.submit({ submit, expected_existing: null });
    await this.idem.commit({
      key: input.idempotency_key,
      workspace_id: input.workspace_id,
      session_id: input.session_id,
      response: stored,
      recorded_at_ms: submit.submitted_at_ms,
      ttl_ms: 24 * 60 * 60 * 1000,
    });
    await this.emitAudit({
      actor_id: input.participant_id,
      workspace_id: input.workspace_id,
      session_id: input.session_id,
      thread_id: submit.thread_id,
      submit_id: submit.id,
      ts: submit.submitted_at_ms,
      action: 'qa.submit',
      after: { body_length: submit.body.length, moderation: moderation ?? 'allow' },
    });
    this.metrics.submits.inc(1, { workspace_id: input.workspace_id });
    this.metrics.submit_latency_ms.observe(this.now_ms() - start, { workspace_id: input.workspace_id });
    await this.bus.publish({
      session_id: input.session_id,
      topic: 'qa',
      payload: encode({ kind: 'submit', submit_id: submit.id, body: submit.body }),
    });
    return stored;
  }

  async upvote(input: UpvoteInput): Promise<QaSubmit> {
    const ts = this.now_ms();
    const upvote = {
      submit_id: input.submit_id,
      participant_id: input.participant_id,
      workspace_id: input.workspace_id,
      upvoted_at_ms: ts,
    };
    const { submit } = await this.store.upvote({ upvote, expected_existing: null });
    await this.emitAudit({
      actor_id: input.participant_id,
      workspace_id: input.workspace_id,
      session_id: submit.session_id,
      thread_id: submit.thread_id,
      submit_id: submit.id,
      ts,
      action: 'qa.upvote',
      after: { upvotes: submit.upvotes },
    });
    this.metrics.upvotes.inc(1, { workspace_id: input.workspace_id });
    await this.bus.publish({
      session_id: submit.session_id,
      topic: 'qa',
      payload: encode({ kind: 'upvote', submit_id: submit.id, count: submit.upvotes }),
    });
    return submit;
  }

  async promoteToParkingLot(input: { thread_id: string; submit_id: string; actor_id: string }): Promise<{ submit: QaSubmit; promoted: true }> {
    const ts = this.now_ms();
    const submit = await this.store.getSubmit(input.submit_id);
    if (!submit) throw notFoundError(input.submit_id);
    await this.emitAudit({
      actor_id: input.actor_id,
      workspace_id: submit.workspace_id,
      session_id: submit.session_id,
      thread_id: input.thread_id,
      submit_id: submit.id,
      ts,
      action: 'qa.promote_to_parking_lot',
      after: { promoted: true },
    });
    this.metrics.parking_lot_promotions.inc(1, { workspace_id: submit.workspace_id });
    await this.bus.publish({
      session_id: submit.session_id,
      topic: 'qa',
      payload: encode({ kind: 'promote_to_parking_lot', submit_id: submit.id, body: submit.body }),
    });
    return { submit, promoted: true };
  }

  private async emitAudit(event: QaAuditEvent): Promise<void> {
    await this.audit.emit(event);
  }
}

function cryptoRandomId(): string {
  const g: typeof globalThis & { crypto?: { randomUUID?: () => string } } = globalThis;
  if (g.crypto?.randomUUID) return g.crypto.randomUUID();
  let s = '';
  for (let i = 0; i < 32; i++) s += Math.floor(Math.random() * 16).toString(16);
  return s;
}

void encode;
void QaError;
